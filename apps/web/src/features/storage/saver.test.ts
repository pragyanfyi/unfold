import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it, vi } from "vitest";
import { ConversationSaver, type SaveStatus, titleFromIdea } from "./saver";
import { type ConversationStore, StorageError, type StorageErrorCode } from "./store";

const msg = (id: string, text = id, role: "user" | "assistant" = "user"): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", content: text }],
});

function fakeStore() {
  const fail: { next: StorageErrorCode | null } = { next: null };
  const store = {
    create: vi.fn(async (input: { messages: ReadonlyArray<UIMessage> }) => {
      if (fail.next) throw new StorageError(fail.next);
      return input;
    }),
    append: vi.fn(async () => {
      if (fail.next) throw new StorageError(fail.next);
      return {};
    }),
  };
  return {
    store: store as unknown as ConversationStore,
    fail,
    create: store.create,
    append: store.append,
  };
}

function setup(stored = 0) {
  const fake = fakeStore();
  const statuses: Array<SaveStatus> = [];
  const onSaved = vi.fn();
  const saver = new ConversationSaver({
    store: fake.store,
    id: "c1",
    stored,
    onStatus: (s) => statuses.push(s),
    onSaved,
  });
  return { ...fake, saver, statuses, onSaved };
}

describe("ConversationSaver", () => {
  it("creates with the first messages, then appends only what is new", async () => {
    const { saver, create, append, onSaved } = setup();
    await saver.sync([msg("a")]);
    await saver.sync([msg("a"), msg("b")]);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].messages.map((m) => m.id)).toEqual(["a"]);
    expect(append).toHaveBeenCalledWith("c1", 1, [msg("b")]);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("appends from the stored count for a restored conversation, never creating", async () => {
    const { saver, create, append } = setup(2);
    await saver.sync([msg("a"), msg("b")]);
    expect(create).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    await saver.sync([msg("a"), msg("b"), msg("c")]);
    expect(append).toHaveBeenCalledWith("c1", 2, [msg("c")]);
  });

  it("does not write twice for the same prefix", async () => {
    const { saver, create } = setup();
    await saver.sync([msg("a")]);
    await saver.sync([msg("a")]);
    expect(create).toHaveBeenCalledOnce();
  });

  it("keeps messages queued after a storage failure and sends them as one batch", async () => {
    const { saver, fail, create, append, statuses } = setup();
    fail.next = "quota";
    await saver.sync([msg("a")]);
    expect(statuses.at(-1)).toEqual({ kind: "unsaved", reason: "quota" });
    await saver.sync([msg("a"), msg("b")]); // still failing
    fail.next = null;
    await saver.retry();
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ messages: [msg("a"), msg("b")] }),
    );
    expect(append).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: "idle" });
  });

  it("stops for good after a conflict and writes nothing more", async () => {
    const { saver, fail, append, statuses } = setup(1);
    fail.next = "conflict";
    await saver.sync([msg("a"), msg("b")]);
    expect(statuses.at(-1)).toEqual({ kind: "conflict", reason: "changed" });
    fail.next = null;
    await saver.sync([msg("a"), msg("b"), msg("c")]);
    await saver.retry();
    expect(append).toHaveBeenCalledTimes(1);
  });

  it("reports a conversation deleted elsewhere and does not recreate it", async () => {
    const { saver, fail, create, statuses } = setup(1);
    fail.next = "missing";
    await saver.sync([msg("a"), msg("b")]);
    expect(statuses.at(-1)).toEqual({ kind: "conflict", reason: "deleted" });
    fail.next = null;
    await saver.sync([msg("a"), msg("b"), msg("c")]);
    expect(create).not.toHaveBeenCalled();
  });

  it("treats an id collision on create as a conflict", async () => {
    const { saver, fail, statuses } = setup();
    fail.next = "exists";
    await saver.sync([msg("a")]);
    expect(statuses.at(-1)).toEqual({ kind: "conflict", reason: "changed" });
  });

  it("serialises writes: a prefix that grows during a write is flushed after it", async () => {
    const { saver, append } = setup(1);
    const first = saver.sync([msg("a"), msg("b")]);
    const second = saver.sync([msg("a"), msg("b"), msg("c")]);
    await Promise.all([first, second]);
    expect(append.mock.calls.map((c) => (c as unknown[])[1])).toEqual([1, 2]);
  });
});

describe("titleFromIdea", () => {
  it("uses the first user message, tidied and trimmed", () => {
    expect(titleFromIdea([msg("a", "  A   picnic\nplanner ")])).toBe("A picnic planner");
    const long = titleFromIdea([msg("a", "word ".repeat(40))]);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });

  it("has a fallback", () => {
    expect(titleFromIdea([])).toBe("Untitled idea");
  });
});
