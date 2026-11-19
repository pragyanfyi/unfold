import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import {
  MAX_IDEA_BYTES,
  MAX_IDEA_MESSAGES,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_CALL,
  MAX_TITLE_LENGTH,
} from "../convex/ideas";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function backend() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerPassword(t);
  registerUsername(t);
  return t;
}

type Backend = ReturnType<typeof backend>;

// A signed-in user of its own, through the test-only password method (ADR 0016).
async function user(t: Backend) {
  const result = await t.mutation(api.auth.signUpWithUsernamePassword, {
    username: `user-${crypto.randomUUID()}`,
    password: "correct horse battery staple",
  });
  if (result.status !== "complete") throw new Error("sign-up did not complete");
  return t.withIdentity(sessionIdentity(result.tokens));
}

const ID = "01890a5d-ac96-774b-bcce-b302099a8057";
const OTHER_ID = "01890a5d-ac96-774b-bcce-b302099a8058";

const message = (id: string, role = "user", text = `text of ${id}`) =>
  JSON.stringify({ id, role, parts: [{ type: "text", content: text }] });

const idea = (messages = [message("m0")]) => ({
  id: ID,
  title: "An idea",
  schemaVersion: 1,
  messages,
});

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConvexError) return (error.data as { code: string }).code;
    throw error;
  }
  throw new Error("expected the call to fail");
}

describe("ideas", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://example.convex.cloud");
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("E2E_PASSWORD_SIGN_UP", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses every call from a signed-out caller", async () => {
    const t = backend();
    expect(await code(t.query(api.ideas.list, {}))).toBe("signed-out");
    expect(await code(t.query(api.ideas.load, { id: ID }))).toBe("signed-out");
    expect(await code(t.mutation(api.ideas.create, idea()))).toBe("signed-out");
    expect(
      await code(
        t.mutation(api.ideas.append, {
          id: ID,
          expectedNextSeq: 0,
          schemaVersion: 1,
          messages: [],
        }),
      ),
    ).toBe("signed-out");
    expect(
      await code(
        t.mutation(api.ideas.rename, {
          id: ID,
          title: "x",
          expectedTitleRev: 0,
          schemaVersion: 1,
        }),
      ),
    ).toBe("signed-out");
    expect(await code(t.mutation(api.ideas.remove, { id: ID }))).toBe("signed-out");
  });

  it("creates, appends and loads messages in seq order", async () => {
    const t = backend();
    const alice = await user(t);
    const created = await alice.mutation(api.ideas.create, idea());
    expect(created).toMatchObject({ id: ID, title: "An idea", nextSeq: 1, titleRev: 0 });

    const appended = await alice.mutation(api.ideas.append, {
      id: ID,
      expectedNextSeq: 1,
      schemaVersion: 1,
      messages: [message("m1", "assistant"), message("m2")],
    });
    expect(appended.nextSeq).toBe(3);

    const loaded = await alice.query(api.ideas.load, { id: ID });
    expect(loaded?.messages.map((m) => JSON.parse(m).id)).toEqual(["m0", "m1", "m2"]);
    expect(loaded?.record).toEqual(appended);
  });

  it("gets the record and the last message's id, which identify the stored history", async () => {
    const t = backend();
    const alice = await user(t);
    expect(await alice.query(api.ideas.get, { id: ID })).toBeNull();
    const created = await alice.mutation(api.ideas.create, idea());
    expect(await alice.query(api.ideas.get, { id: ID })).toEqual({
      record: created,
      lastMessageId: "m0",
    });
    await alice.mutation(api.ideas.append, {
      id: ID,
      expectedNextSeq: 1,
      schemaVersion: 1,
      messages: [message("m1", "assistant")],
    });
    expect((await alice.query(api.ideas.get, { id: ID }))?.lastMessageId).toBe("m1");
  });

  it("returns only the app's fields, never the owner or Convex ids", async () => {
    const t = backend();
    const alice = await user(t);
    await alice.mutation(api.ideas.create, idea());
    const [record] = await alice.query(api.ideas.list, {});
    expect(Object.keys(record).sort()).toEqual(
      ["createdAt", "id", "nextSeq", "schemaVersion", "title", "titleRev", "updatedAt"].sort(),
    );
  });

  it("lists only the caller's ideas, most recently updated first", async () => {
    const t = backend();
    const alice = await user(t);
    const bob = await user(t);
    await alice.mutation(api.ideas.create, idea());
    await alice.mutation(api.ideas.create, { ...idea(), id: OTHER_ID, title: "Second" });
    // Both were written in the same instant. Put the first one in the past, then rename it: a
    // rename counts as an update, so it moves back to the top.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("ideas").collect()) {
        await ctx.db.patch(row._id, { updatedAt: row.clientId === ID ? 1_000 : 2_000 });
      }
    });
    expect((await alice.query(api.ideas.list, {})).map((r) => r.title)).toEqual([
      "Second",
      "An idea",
    ]);
    await alice.mutation(api.ideas.rename, {
      id: ID,
      title: "Renamed",
      expectedTitleRev: 0,
      schemaVersion: 1,
    });
    expect((await alice.query(api.ideas.list, {})).map((r) => r.title)).toEqual([
      "Renamed",
      "Second",
    ]);
    expect(await bob.query(api.ideas.list, {})).toEqual([]);
  });

  it("treats another user's idea as missing for every call", async () => {
    const t = backend();
    const alice = await user(t);
    const bob = await user(t);
    await alice.mutation(api.ideas.create, idea());

    expect(await bob.query(api.ideas.load, { id: ID })).toBeNull();
    expect(
      await code(
        bob.mutation(api.ideas.append, {
          id: ID,
          expectedNextSeq: 1,
          schemaVersion: 1,
          messages: [message("evil")],
        }),
      ),
    ).toBe("missing");
    expect(
      await code(
        bob.mutation(api.ideas.rename, {
          id: ID,
          title: "Taken over",
          expectedTitleRev: 0,
          schemaVersion: 1,
        }),
      ),
    ).toBe("missing");
    await bob.mutation(api.ideas.remove, { id: ID });

    const loaded = await alice.query(api.ideas.load, { id: ID });
    expect(loaded?.record).toMatchObject({ title: "An idea", nextSeq: 1 });
    expect(loaded?.messages).toHaveLength(1);
  });

  it("refuses an id that is already taken, by anyone", async () => {
    const t = backend();
    const alice = await user(t);
    const bob = await user(t);
    await alice.mutation(api.ideas.create, idea());
    expect(await code(alice.mutation(api.ideas.create, idea()))).toBe("exists");
    expect(await code(bob.mutation(api.ideas.create, idea()))).toBe("exists");
  });

  it("refuses an append that does not start at the stored nextSeq, and writes nothing", async () => {
    const t = backend();
    const alice = await user(t);
    await alice.mutation(api.ideas.create, idea());
    for (const expectedNextSeq of [0, 2]) {
      expect(
        await code(
          alice.mutation(api.ideas.append, {
            id: ID,
            expectedNextSeq,
            schemaVersion: 1,
            messages: [message("late")],
          }),
        ),
      ).toBe("conflict");
    }
    const loaded = await alice.query(api.ideas.load, { id: ID });
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.record.nextSeq).toBe(1);
  });

  it("refuses a rename that does not know the stored titleRev", async () => {
    const t = backend();
    const alice = await user(t);
    await alice.mutation(api.ideas.create, idea());
    const renamed = await alice.mutation(api.ideas.rename, {
      id: ID,
      title: "First rename",
      expectedTitleRev: 0,
      schemaVersion: 1,
    });
    expect(renamed.titleRev).toBe(1);
    expect(
      await code(
        alice.mutation(api.ideas.rename, {
          id: ID,
          title: "Stale rename",
          expectedTitleRev: 0,
          schemaVersion: 1,
        }),
      ),
    ).toBe("conflict");
    expect((await alice.query(api.ideas.list, {}))[0].title).toBe("First rename");
  });

  it("refuses writes from code older than the stored schema version", async () => {
    const t = backend();
    const alice = await user(t);
    await alice.mutation(api.ideas.create, { ...idea(), schemaVersion: 2 });
    expect(
      await code(
        alice.mutation(api.ideas.append, {
          id: ID,
          expectedNextSeq: 1,
          schemaVersion: 1,
          messages: [message("m1")],
        }),
      ),
    ).toBe("too-new");
    expect(
      await code(
        alice.mutation(api.ideas.rename, {
          id: ID,
          title: "x",
          expectedTitleRev: 0,
          schemaVersion: 1,
        }),
      ),
    ).toBe("too-new");
  });

  it("deletes an idea with all its messages, and a missing one quietly", async () => {
    const t = backend();
    const alice = await user(t);
    await alice.mutation(api.ideas.create, idea([message("m0"), message("m1", "assistant")]));
    await alice.mutation(api.ideas.remove, { id: ID });
    await alice.mutation(api.ideas.remove, { id: ID });
    expect(await alice.query(api.ideas.load, { id: ID })).toBeNull();
    const rows = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(rows).toHaveLength(0);
  });

  it("refuses ids, titles and messages it cannot store, and writes nothing", async () => {
    const t = backend();
    const alice = await user(t);
    const refused = [
      { ...idea(), id: "not-a-uuid" },
      { ...idea(), title: "   " },
      { ...idea(), title: "x".repeat(MAX_TITLE_LENGTH + 1) },
      idea(["not json"]),
      idea([JSON.stringify([1, 2])]),
      idea([JSON.stringify({ id: "m0", role: "robot", parts: [] })]),
      idea([JSON.stringify({ id: "m0", role: "user" })]),
      idea([JSON.stringify({ role: "user", parts: [] })]),
      idea([message("m0", "user", "x".repeat(MAX_MESSAGE_BYTES))]),
    ];
    for (const input of refused) {
      expect(await code(alice.mutation(api.ideas.create, input))).toBe("invalid");
    }
    const ideas = await t.run((ctx) => ctx.db.query("ideas").collect());
    expect(ideas).toHaveLength(0);
  });

  it("refuses more messages per call than one save may send", async () => {
    const t = backend();
    const alice = await user(t);
    const many = Array.from({ length: MAX_MESSAGES_PER_CALL + 1 }, (_, i) => message(`m${i}`));
    expect(await code(alice.mutation(api.ideas.create, idea(many)))).toBe("invalid");
  });

  it("keeps an idea small enough to load and delete in one call", async () => {
    const t = backend();
    const alice = await user(t);
    // Messages just under the per-message limit, until the next one would pass the idea's limit.
    const big = (id: string) => message(id, "user", "x".repeat(MAX_MESSAGE_BYTES - 200));
    const fits = Math.floor(MAX_IDEA_BYTES / MAX_MESSAGE_BYTES);
    await alice.mutation(api.ideas.create, idea([big("m0")]));
    for (let seq = 1; seq < fits; seq++) {
      await alice.mutation(api.ideas.append, {
        id: ID,
        expectedNextSeq: seq,
        schemaVersion: 1,
        messages: [big(`m${seq}`)],
      });
    }
    expect(
      await code(
        alice.mutation(api.ideas.append, {
          id: ID,
          expectedNextSeq: fits,
          schemaVersion: 1,
          messages: [big("one-too-many")],
        }),
      ),
    ).toBe("too-large");
    const loaded = await alice.query(api.ideas.load, { id: ID });
    expect(loaded?.messages).toHaveLength(fits);
    await alice.mutation(api.ideas.remove, { id: ID });
    expect(await alice.query(api.ideas.load, { id: ID })).toBeNull();
  });

  it("caps the number of messages too, so many small ones stay loadable", async () => {
    const t = backend();
    const alice = await user(t);
    const batch = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => message(`m${from + i}`, "user", "x"));
    await alice.mutation(api.ideas.create, idea(batch(0, MAX_MESSAGES_PER_CALL)));
    let stored = MAX_MESSAGES_PER_CALL;
    while (stored < MAX_IDEA_MESSAGES) {
      const count = Math.min(MAX_MESSAGES_PER_CALL, MAX_IDEA_MESSAGES - stored);
      await alice.mutation(api.ideas.append, {
        id: ID,
        expectedNextSeq: stored,
        schemaVersion: 1,
        messages: batch(stored, count),
      });
      stored += count;
    }
    expect(
      await code(
        alice.mutation(api.ideas.append, {
          id: ID,
          expectedNextSeq: stored,
          schemaVersion: 1,
          messages: batch(stored, 1),
        }),
      ),
    ).toBe("too-large");
    const loaded = await alice.query(api.ideas.load, { id: ID });
    expect(loaded?.messages).toHaveLength(MAX_IDEA_MESSAGES);
    await alice.mutation(api.ideas.remove, { id: ID });
    expect(await alice.query(api.ideas.load, { id: ID })).toBeNull();
  });

  it("reports damage instead of returning a gap in the messages", async () => {
    const t = backend();
    const alice = await user(t);
    await alice.mutation(api.ideas.create, idea([message("m0"), message("m1", "assistant")]));
    await t.run(async (ctx) => {
      const first = await ctx.db.query("messages").first();
      if (first) await ctx.db.delete(first._id);
    });
    expect(await code(alice.query(api.ideas.load, { id: ID }))).toBe("damaged");
  });
});
