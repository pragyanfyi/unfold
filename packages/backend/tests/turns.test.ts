import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { lastMessageId, MAX_IDEA_MESSAGES } from "../convex/ideas";
import schema from "../convex/schema";
import { MAX_RUN_ID_LENGTH, RUN_STALE_MS } from "../convex/turns";

const modules = import.meta.glob("../convex/**/*.ts");

function backend() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerPassword(t);
  registerUsername(t);
  return t;
}

type Backend = ReturnType<typeof backend>;

// A signed-in user of its own, through the test-only password method (ADR 0016), and its id,
// which the HTTP action passes to `start` after signing the caller in.
async function user(t: Backend) {
  const result = await t.mutation(api.auth.signUpWithUsernamePassword, {
    username: `user-${crypto.randomUUID()}`,
    password: "correct horse battery staple",
  });
  if (result.status !== "complete") throw new Error("sign-up did not complete");
  const as = t.withIdentity(sessionIdentity(result.tokens));
  const me = await as.query(api.users.me, {});
  if (!me) throw new Error("not signed in");
  return { as, userId: me.userId };
}

const ID = "01890a5d-ac96-774b-bcce-b302099a8057";
const RUN = "run-1";
const NEXT_RUN = "run-2";

const message = (id: string, role = "user", text = `text of ${id}`) =>
  JSON.stringify({ id, role, parts: [{ type: "text", content: text }] });

const reply = (text = "Partial") => message("a1", "assistant", text);

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConvexError) return (error.data as { code: string }).code;
    throw error;
  }
  throw new Error("expected the call to fail");
}

// A backend with Alice's idea holding one user message.
async function withIdea() {
  const t = backend();
  const alice = await user(t);
  await alice.as.mutation(api.ideas.create, {
    id: ID,
    title: "An idea",
    schemaVersion: 1,
    messages: [message("m0")],
  });
  // Starts a run from the idea's stored history, as the action does after the browser's save.
  const start = async (
    runId = RUN,
    history?: { nextSeq: number; lastMessageId: string | null },
  ) => {
    const stored = history ?? (await historyOf(t));
    return t.mutation(internal.turns.start, {
      ownerId: alice.userId,
      id: ID,
      runId,
      expectedNextSeq: stored.nextSeq,
      expectedLastMessageId: stored.lastMessageId,
    });
  };
  return { t, alice, start };
}

// The idea's stored history, as the browser reports it with a request.
const historyOf = (t: Backend) =>
  t.run(async (ctx) => {
    const idea = await ctx.db
      .query("ideas")
      .withIndex("by_client_id", (q) => q.eq("clientId", ID))
      .unique();
    if (!idea) return { nextSeq: 0, lastMessageId: null };
    return { nextSeq: idea.nextSeq, lastMessageId: await lastMessageId(ctx, idea) };
  });

const turnOf = (t: Backend, ideaId: Id<"ideas">) =>
  t.run((ctx) =>
    ctx.db
      .query("turns")
      .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
      .unique(),
  );

describe("turns", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://example.convex.cloud");
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("E2E_PASSWORD_SIGN_UP", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("refuses the owner's calls from a signed-out caller", async () => {
    const t = backend();
    expect(await code(t.query(api.turns.get, { id: ID }))).toBe("signed-out");
    expect(
      await code(
        t.mutation(api.turns.answer, {
          id: ID,
          runId: RUN,
          expectedNextSeq: 1,
          schemaVersion: 1,
          message: reply(),
        }),
      ),
    ).toBe("signed-out");
    expect(await code(t.mutation(api.turns.stop, { id: ID, runId: RUN }))).toBe("signed-out");
  });

  it("streams a run, waits for the answer, and appends the answered message", async () => {
    const { t, alice, start } = await withIdea();
    expect(await alice.as.query(api.turns.get, { id: ID })).toBeNull();

    const ideaId = await start();
    expect(await alice.as.query(api.turns.get, { id: ID })).toEqual({
      runId: RUN,
      status: "running",
      message: null,
    });

    expect(await t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: reply() })).toBe(
      true,
    );
    expect((await alice.as.query(api.turns.get, { id: ID }))?.message).toBe(reply());

    const proposal = reply("Pick one");
    expect(
      await t.mutation(internal.turns.end, {
        ideaId,
        runId: RUN,
        message: proposal,
        needsAnswer: true,
      }),
    ).toBe(true);
    expect(await alice.as.query(api.turns.get, { id: ID })).toEqual({
      runId: RUN,
      status: "waiting",
      message: proposal,
    });
    // Nothing is final until the answer.
    expect((await alice.as.query(api.ideas.load, { id: ID }))?.messages).toHaveLength(1);

    const answered = reply("Pick one, answered");
    const record = await alice.as.mutation(api.turns.answer, {
      id: ID,
      runId: RUN,
      expectedNextSeq: 1,
      schemaVersion: 1,
      message: answered,
    });
    expect(record.nextSeq).toBe(2);
    expect(await alice.as.query(api.turns.get, { id: ID })).toBeNull();
    expect((await alice.as.query(api.ideas.load, { id: ID }))?.messages).toEqual([
      message("m0"),
      answered,
    ]);
  });

  it("appends a closing reply when its run ends, and clears the turn", async () => {
    const { t, alice, start } = await withIdea();
    const ideaId = await start();
    const closing = reply("All done");
    expect(
      await t.mutation(internal.turns.end, {
        ideaId,
        runId: RUN,
        message: closing,
        needsAnswer: false,
      }),
    ).toBe(true);
    expect(await alice.as.query(api.turns.get, { id: ID })).toBeNull();
    expect((await alice.as.query(api.ideas.load, { id: ID }))?.messages).toEqual([
      message("m0"),
      closing,
    ]);
  });

  it("starts a run only when no run holds the turn", async () => {
    const { t, start } = await withIdea();
    const ideaId = await start();
    expect(await code(start(NEXT_RUN))).toBe("busy");

    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    expect(await code(start(NEXT_RUN))).toBe("busy");
  });

  it("replaces an interrupted turn, and the old run can no longer write", async () => {
    const { t, alice, start } = await withIdea();
    const ideaId = await start();
    await t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: reply("Old") });
    expect(await t.mutation(internal.turns.interrupt, { ideaId, runId: RUN })).toBe(true);
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("interrupted");

    await start(NEXT_RUN);
    expect(await alice.as.query(api.turns.get, { id: ID })).toEqual({
      runId: NEXT_RUN,
      status: "running",
      message: null,
    });

    // The old run resumes: every write is refused and changes nothing.
    expect(await t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: reply() })).toBe(
      false,
    );
    expect(await t.mutation(internal.turns.interrupt, { ideaId, runId: RUN })).toBe(false);
    expect(
      await t.mutation(internal.turns.end, {
        ideaId,
        runId: RUN,
        message: reply(),
        needsAnswer: false,
      }),
    ).toBe(false);
    expect(await alice.as.query(api.turns.get, { id: ID })).toEqual({
      runId: NEXT_RUN,
      status: "running",
      message: null,
    });
    expect((await alice.as.query(api.ideas.load, { id: ID }))?.record.nextSeq).toBe(1);
  });

  it("refuses writes to a turn that is no longer running", async () => {
    const { t, start } = await withIdea();
    const ideaId = await start();
    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    // Waiting: the run has ended, so it can neither write nor interrupt its own turn.
    expect(await t.mutation(internal.turns.batch, { ideaId, runId: RUN })).toBe(false);
    expect(await t.mutation(internal.turns.interrupt, { ideaId, runId: RUN })).toBe(false);
    expect((await turnOf(t, ideaId))?.status).toBe("waiting");
  });

  it("refuses a run whose request carries other history than the idea holds", async () => {
    const { t, start } = await withIdea();
    // The idea holds 1 message, "m0". A tab that has 0 or 2 is out of step with it, and so is a
    // tab whose 1 message is another: two tabs can diverge at the same length.
    expect(await code(start(RUN, { nextSeq: 0, lastMessageId: null }))).toBe("conflict");
    expect(await code(start(RUN, { nextSeq: 2, lastMessageId: "m0" }))).toBe("conflict");
    expect(await code(start(RUN, { nextSeq: 1, lastMessageId: "other" }))).toBe("conflict");
    expect(await t.run((ctx) => ctx.db.query("turns").collect())).toHaveLength(0);
    await start(RUN, { nextSeq: 1, lastMessageId: "m0" });
  });

  it("keeps every user to their own ideas", async () => {
    const { t, alice, start } = await withIdea();
    const bob = await user(t);
    expect(
      await code(
        t.mutation(internal.turns.start, {
          ownerId: bob.userId,
          id: ID,
          runId: RUN,
          expectedNextSeq: 1,
          expectedLastMessageId: "m0",
        }),
      ),
    ).toBe("missing");

    const ideaId = await start();
    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    expect(await bob.as.query(api.turns.get, { id: ID })).toBeNull();
    expect(
      await code(
        bob.as.mutation(api.turns.answer, {
          id: ID,
          runId: RUN,
          expectedNextSeq: 1,
          schemaVersion: 1,
          message: reply(),
        }),
      ),
    ).toBe("missing");
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("waiting");
  });

  it("refuses an answer to a run that is not waiting, or that does not fit", async () => {
    const { t, alice, start } = await withIdea();
    const answer = (fields: Partial<{ runId: string; expectedNextSeq: number; message: string }>) =>
      alice.as.mutation(api.turns.answer, {
        id: ID,
        runId: RUN,
        expectedNextSeq: 1,
        schemaVersion: 1,
        message: reply(),
        ...fields,
      });

    expect(await code(answer({}))).toBe("stale");
    const ideaId = await start();
    expect(await code(answer({}))).toBe("stale");

    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    expect(await code(answer({ runId: NEXT_RUN }))).toBe("stale");
    expect(await code(answer({ expectedNextSeq: 0 }))).toBe("conflict");
    expect(await code(answer({ message: message("another", "assistant") }))).toBe("invalid");
    expect(await code(answer({ message: "not json" }))).toBe("invalid");
    expect(
      await code(
        alice.as.mutation(api.turns.answer, {
          id: ID,
          runId: RUN,
          expectedNextSeq: 1,
          schemaVersion: 0,
          message: reply(),
        }),
      ),
    ).toBe("too-new");

    // Every refusal left the turn waiting and the idea unchanged.
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("waiting");
    expect((await alice.as.query(api.ideas.load, { id: ID }))?.record.nextSeq).toBe(1);
  });

  it("stops only the named running run", async () => {
    const { t, alice, start } = await withIdea();
    const ideaId = await start();
    await alice.as.mutation(api.turns.stop, { id: ID, runId: NEXT_RUN });
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("running");

    await alice.as.mutation(api.turns.stop, { id: ID, runId: RUN });
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("interrupted");
    // The action learns it at its next write.
    expect(await t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: reply() })).toBe(
      false,
    );
  });

  it("holds the idea's messages while a run is running or waiting", async () => {
    const { t, alice, start } = await withIdea();
    const append = () =>
      alice.as.mutation(api.ideas.append, {
        id: ID,
        expectedNextSeq: 1,
        schemaVersion: 1,
        messages: [message("m1")],
      });
    const ideaId = await start();
    expect(await code(append())).toBe("busy");
    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    expect(await code(append())).toBe("busy");

    // An interrupted turn does not hold the idea.
    const turn = await turnOf(t, ideaId);
    if (!turn) throw new Error("no turn");
    await t.run((ctx) => ctx.db.patch(turn._id, { status: "interrupted" }));
    expect((await append()).nextSeq).toBe(2);
  });

  it("deletes the turn with its idea, and the run stops writing", async () => {
    const { t, alice, start } = await withIdea();
    const ideaId = await start();
    await t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: reply() });
    await alice.as.mutation(api.ideas.remove, { id: ID });
    expect(await turnOf(t, ideaId)).toBeNull();
    expect(await t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: reply() })).toBe(
      false,
    );
    expect(
      await t.mutation(internal.turns.end, {
        ideaId,
        runId: RUN,
        message: reply(),
        needsAnswer: false,
      }),
    ).toBe(false);
  });

  it("refuses messages and run ids it cannot store, and writes nothing", async () => {
    const { t, start } = await withIdea();
    expect(await code(start(""))).toBe("invalid");
    expect(await code(start("r".repeat(MAX_RUN_ID_LENGTH + 1)))).toBe("invalid");

    const ideaId = await start();
    expect(await code(t.mutation(internal.turns.batch, { ideaId, runId: RUN, message: "{" }))).toBe(
      "invalid",
    );
    expect(
      await code(
        t.mutation(internal.turns.end, {
          ideaId,
          runId: RUN,
          message: JSON.stringify({ id: "a1", role: "robot", parts: [] }),
          needsAnswer: true,
        }),
      ),
    ).toBe("invalid");
    const turn = await turnOf(t, ideaId);
    expect(turn?.status).toBe("running");
    expect(turn?.message).toBeUndefined();
  });

  it("refuses a closing reply the idea cannot hold, leaving the turn running", async () => {
    const { t, start } = await withIdea();
    const ideaId = await start();
    await t.run(async (ctx) => {
      await ctx.db.patch(ideaId, { nextSeq: MAX_IDEA_MESSAGES });
    });
    expect(
      await code(
        t.mutation(internal.turns.end, {
          ideaId,
          runId: RUN,
          message: reply(),
          needsAnswer: false,
        }),
      ),
    ).toBe("too-large");
    // The action interrupts the run next.
    expect((await turnOf(t, ideaId))?.status).toBe("running");
    expect(await t.mutation(internal.turns.interrupt, { ideaId, runId: RUN })).toBe(true);
  });

  it("never waits for an answer the idea cannot hold", async () => {
    const { t, start } = await withIdea();
    const ideaId = await start();
    await t.run(async (ctx) => {
      await ctx.db.patch(ideaId, { nextSeq: MAX_IDEA_MESSAGES });
    });
    expect(
      await code(
        t.mutation(internal.turns.end, {
          ideaId,
          runId: RUN,
          message: reply(),
          needsAnswer: true,
        }),
      ),
    ).toBe("too-large");
    // Still running, so the action can interrupt it and a new run can replace it.
    expect((await turnOf(t, ideaId))?.status).toBe("running");
    expect(await t.mutation(internal.turns.interrupt, { ideaId, runId: RUN })).toBe(true);
    expect(await start(NEXT_RUN)).toBe(ideaId);
  });

  it("lets the owner abandon a waiting run, freeing the idea", async () => {
    const { t, alice, start } = await withIdea();
    const ideaId = await start();
    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    await alice.as.mutation(api.turns.stop, { id: ID, runId: NEXT_RUN });
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("waiting");

    await alice.as.mutation(api.turns.stop, { id: ID, runId: RUN });
    expect((await alice.as.query(api.turns.get, { id: ID }))?.status).toBe("interrupted");
    expect(
      await code(
        alice.as.mutation(api.turns.answer, {
          id: ID,
          runId: RUN,
          expectedNextSeq: 1,
          schemaVersion: 1,
          message: reply(),
        }),
      ),
    ).toBe("stale");
    expect(
      (
        await alice.as.mutation(api.ideas.append, {
          id: ID,
          expectedNextSeq: 1,
          schemaVersion: 1,
          messages: [message("m1")],
        })
      ).nextSeq,
    ).toBe(2);
    expect(await start(NEXT_RUN)).toBe(ideaId);
  });

  it("marks a run interrupted once it has gone quiet for RUN_STALE_MS", async () => {
    vi.useFakeTimers();
    const { t, start } = await withIdea();
    const ideaId = await start();

    // The run writes halfway, so the first check finds it alive and checks again later.
    await vi.advanceTimersByTimeAsync(RUN_STALE_MS / 2);
    await t.mutation(internal.turns.batch, { ideaId, runId: RUN });
    await vi.advanceTimersByTimeAsync(RUN_STALE_MS / 2);
    await t.finishInProgressScheduledFunctions();
    expect((await turnOf(t, ideaId))?.status).toBe("running");

    // No write since: the next check, due RUN_STALE_MS after the last write, interrupts it.
    await vi.advanceTimersByTimeAsync(RUN_STALE_MS / 2);
    await t.finishInProgressScheduledFunctions();
    expect((await turnOf(t, ideaId))?.status).toBe("interrupted");
  });

  it("stops checking once the run has ended", async () => {
    vi.useFakeTimers();
    const { t, start } = await withIdea();
    const ideaId = await start();
    await t.mutation(internal.turns.end, {
      ideaId,
      runId: RUN,
      message: reply(),
      needsAnswer: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await turnOf(t, ideaId))?.status).toBe("waiting");
  });

  it("never lets an old run's check touch the run that replaced it", async () => {
    vi.useFakeTimers();
    const { t, alice, start } = await withIdea();
    const ideaId = await start();
    await t.mutation(internal.turns.interrupt, { ideaId, runId: RUN });
    await vi.advanceTimersByTimeAsync(RUN_STALE_MS / 2);
    await start(NEXT_RUN);

    // The old run's check comes due first; it does nothing and does not schedule itself again.
    await vi.advanceTimersByTimeAsync(RUN_STALE_MS / 2 + 10);
    await t.finishInProgressScheduledFunctions();
    expect(await alice.as.query(api.turns.get, { id: ID })).toMatchObject({
      runId: NEXT_RUN,
      status: "running",
    });
    const pending = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(
      pending.filter((job) => job.state.kind === "pending").map((job) => job.args[0].runId),
    ).toEqual([NEXT_RUN]);
  });
});
