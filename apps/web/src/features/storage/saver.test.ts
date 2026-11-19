import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it, vi } from "vitest";
import { ConversationSaver, MAX_MESSAGES_PER_SAVE, type SaveStatus, titleFromIdea } from "./saver";
import {
  type ConversationStore,
  StorageError,
  type StorageErrorCode,
  type TurnState,
} from "./store";

const msg = (id: string, text = id, role: "user" | "assistant" = "user"): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", content: text }],
});

// A store with `stored` messages and the given turn. Its last stored message is `last`, or by
// default the one the history being sent has at that place, as when both are the same history.
// Nothing here is conversation text that matters: the saver only moves messages around.
function fakeStore(
  stored: number | null,
  turn: TurnState | null,
  last: string | null | undefined,
  sent: { messages: ReadonlyArray<UIMessage> },
) {
  const fail: { next: StorageErrorCode | null } = { next: null };
  const guard = () => {
    if (fail.next) throw new StorageError(fail.next);
  };
  const store = {
    head: vi.fn(async () => {
      guard();
      if (stored === null) return null;
      const same = stored > 0 ? (sent.messages[stored - 1]?.id ?? null) : null;
      return { record: { nextSeq: stored }, lastMessageId: last === undefined ? same : last };
    }),
    turn: vi.fn(async () => turn),
    create: vi.fn(async (_input: { messages: ReadonlyArray<UIMessage> }) => {
      guard();
      return {};
    }),
    append: vi.fn(async (_id: string, _from: number, _messages: ReadonlyArray<UIMessage>) => {
      guard();
      return {};
    }),
    answer: vi.fn(async (_id: string, _input: unknown) => {
      guard();
      return {};
    }),
    stop: vi.fn(async (_id: string, _runId: string, _expectedNextSeq?: number) => {}),
  };
  return { store: store as unknown as ConversationStore, fail, ...store };
}

function setup(
  stored: number | null,
  turn: TurnState | null = null,
  existed = false,
  last?: string | null,
) {
  const sent: { messages: ReadonlyArray<UIMessage> } = { messages: [] };
  const fake = fakeStore(stored, turn, last, sent);
  const statuses: Array<SaveStatus> = [];
  const onSaved = vi.fn();
  const saver = new ConversationSaver({
    store: fake.store,
    id: "c1",
    existed,
    stopWait: { tries: 3, delayMs: 1 },
    onStatus: (s) => statuses.push(s),
    onSaved,
  });
  const beforeRun = saver.beforeRun.bind(saver);
  saver.beforeRun = (messages) => {
    sent.messages = messages;
    return beforeRun(messages);
  };
  return { ...fake, saver, statuses, onSaved };
}

const waiting = (id: string): TurnState => ({
  runId: "run-1",
  status: "waiting",
  message: JSON.stringify({ id, role: "assistant", parts: [] }),
});

describe("ConversationSaver.beforeRun", () => {
  it("creates a new idea with the messages being sent", async () => {
    const { saver, create, onSaved } = setup(null);
    await saver.beforeRun([msg("a")]);
    expect(create.mock.calls[0][0].messages.map((m) => m.id)).toEqual(["a"]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("writes nothing when storage already has every message", async () => {
    const { saver, create, append, answer } = setup(2);
    await saver.beforeRun([msg("a"), msg("b")]);
    expect(create).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it("appends only what storage does not have", async () => {
    const { saver, append } = setup(1);
    await saver.beforeRun([msg("a"), msg("b")]);
    expect(append).toHaveBeenCalledWith("c1", 1, [msg("b")]);
  });

  it("stores the answer to the waiting run with `answer`, not `append`", async () => {
    const { saver, append, answer, stop } = setup(1, waiting("q"));
    await saver.beforeRun([msg("a"), msg("q", "q", "assistant")]);
    expect(answer).toHaveBeenCalledWith("c1", {
      runId: "run-1",
      expectedNextSeq: 1,
      message: msg("q", "q", "assistant"),
    });
    expect(append).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("abandons a waiting question this tab does not have, then appends", async () => {
    const { saver, append, answer, stop } = setup(1, waiting("lost-question"));
    await saver.beforeRun([msg("a"), msg("b")]);
    // With the stored count it checked, so a question asked after that is not abandoned.
    expect(stop).toHaveBeenCalledWith("c1", "run-1", 1);
    expect(answer).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith("c1", 1, [msg("b")]);
  });

  it("abandons a waiting question even when there is nothing to write", async () => {
    const { saver, append, stop } = setup(2, waiting("lost-question"));
    await saver.beforeRun([msg("a"), msg("b")]);
    expect(stop).toHaveBeenCalledWith("c1", "run-1", 2);
    expect(append).not.toHaveBeenCalled();
  });

  it("refuses when another tab stored messages between the check and abandoning its question", async () => {
    const { saver, stop, append, statuses } = setup(1, waiting("theirs"));
    stop.mockRejectedValueOnce(new StorageError("conflict"));
    await expect(saver.beforeRun([msg("a"), msg("b")])).rejects.toBeInstanceOf(StorageError);
    expect(append).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: "conflict", reason: "changed" });
  });

  it("stores and reports each request's own messages when two overlap", async () => {
    const { saver, create } = setup(null);
    let finish!: () => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({});
        }),
    );
    const first = saver.beforeRun([msg("a")]);
    // A second request comes in while the first is still being stored.
    const second = saver.beforeRun([msg("a"), msg("b")]);
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0].messages.map((m) => m.id)).toEqual(["a"]);
    finish();
    expect(await first).toEqual({ nextSeq: 1, lastMessageId: "a" });
    await second.catch(() => {});
  });

  it("leaves a running turn alone: it is another tab's reply", async () => {
    const { saver, stop } = setup(2, { runId: "run-2", status: "running", message: null });
    await saver.beforeRun([msg("a"), msg("b")]);
    expect(stop).not.toHaveBeenCalled();
  });

  it("never stores a reply without a question: the action stores those, so this one was cut off", async () => {
    const { saver, append, statuses } = setup(1);
    await expect(
      saver.beforeRun([msg("a"), msg("partial", "Half a repl", "assistant"), msg("b")]),
    ).rejects.toBeInstanceOf(StorageError);
    expect(append).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: "unsaved", reason: "unavailable" });
  });

  it("resolves with the stored history, which the request carries", async () => {
    expect(await setup(null).saver.beforeRun([msg("a")])).toEqual({
      nextSeq: 1,
      lastMessageId: "a",
    });
    expect(await setup(1).saver.beforeRun([msg("a"), msg("b")])).toEqual({
      nextSeq: 2,
      lastMessageId: "b",
    });
    expect(
      await setup(1, waiting("q")).saver.beforeRun([msg("a"), msg("q", "q", "assistant")]),
    ).toEqual({ nextSeq: 2, lastMessageId: "q" });
  });

  it("refuses a history of the same length with another last message, before touching the turn", async () => {
    // Another tab abandoned this tab's question "q", answered its own "r", and now waits on a
    // third. This tab still sends its answer to "q": two messages, like storage, but not the same.
    const { saver, stop, answer, append, statuses } = setup(2, waiting("s"), false, "r");
    await expect(saver.beforeRun([msg("a"), msg("q", "q", "assistant")])).rejects.toBeInstanceOf(
      StorageError,
    );
    expect(stop).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: "conflict", reason: "changed" });
  });

  it("skips a cut-off reply at the end, so Try again can continue past it", async () => {
    const { saver, append } = setup(2);
    const count = await saver.beforeRun([
      msg("a"),
      msg("q", "q", "assistant"),
      msg("partial", "Half a repl", "assistant"),
    ]);
    expect(count).toEqual({ nextSeq: 2, lastMessageId: "q" });
    expect(append).not.toHaveBeenCalled();
  });

  it("refuses history older than storage: another tab moved on", async () => {
    const { saver, append, statuses } = setup(3);
    await expect(saver.beforeRun([msg("a"), msg("b")])).rejects.toBeInstanceOf(StorageError);
    expect(append).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: "conflict", reason: "changed" });
  });

  it("never recreates an idea that was stored and is gone", async () => {
    // Opened from storage, then deleted in another tab.
    const opened = setup(null, null, true);
    await expect(opened.saver.beforeRun([msg("a")])).rejects.toBeInstanceOf(StorageError);
    expect(opened.create).not.toHaveBeenCalled();
    expect(opened.statuses.at(-1)).toEqual({ kind: "conflict", reason: "deleted" });

    // Created by this tab, then deleted in another.
    const made = setup(null);
    await made.saver.beforeRun([msg("a")]);
    made.head.mockResolvedValue(null);
    await expect(made.saver.beforeRun([msg("a"), msg("b")])).rejects.toBeInstanceOf(StorageError);
    expect(made.create).toHaveBeenCalledOnce();
  });

  it("splits a long queue into writes the backend accepts", async () => {
    const { saver, append } = setup(1);
    const all = Array.from({ length: MAX_MESSAGES_PER_SAVE + 3 }, (_, i) => msg(`m${i}`));
    await saver.beforeRun(all);
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[0][1]).toBe(1);
    expect(append.mock.calls[0][2]).toHaveLength(MAX_MESSAGES_PER_SAVE);
    expect(append.mock.calls[1][1]).toBe(1 + MAX_MESSAGES_PER_SAVE);
  });

  it("fails the request when storage fails, and a retry goes through", async () => {
    const { saver, fail, statuses, append } = setup(1);
    fail.next = "unavailable";
    await expect(saver.beforeRun([msg("a"), msg("b")])).rejects.toBeInstanceOf(StorageError);
    expect(statuses.at(-1)).toEqual({ kind: "unsaved", reason: "unavailable" });
    fail.next = null;
    await saver.retry();
    expect(append).toHaveBeenCalledWith("c1", 1, [msg("b")]);
    expect(statuses.at(-1)).toEqual({ kind: "idle" });
  });

  it("stops for good after a conflict, and never recreates a deleted idea", async () => {
    const a = setup(1);
    a.fail.next = "conflict";
    await expect(a.saver.beforeRun([msg("a"), msg("b")])).rejects.toThrow();
    expect(a.statuses.at(-1)).toEqual({ kind: "conflict", reason: "changed" });
    a.fail.next = null;
    await expect(a.saver.beforeRun([msg("a"), msg("b")])).rejects.toThrow();
    expect(a.append).not.toHaveBeenCalled();

    const b = setup(1);
    b.fail.next = "missing";
    await expect(b.saver.beforeRun([msg("a"), msg("b")])).rejects.toThrow();
    expect(b.statuses.at(-1)).toEqual({ kind: "conflict", reason: "deleted" });
    expect(b.create).not.toHaveBeenCalled();
  });
});

describe("ConversationSaver.stopRun", () => {
  it("is queued with the writes, so the next request waits for it", async () => {
    const { saver, stop, head } = setup(1, { runId: "r", status: "running", message: null });
    let finishStop!: () => void;
    stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    const stopping = saver.stopRun();
    const sending = saver.beforeRun([msg("a")]);
    await vi.waitFor(() => expect(stop).toHaveBeenCalled());
    expect(head).not.toHaveBeenCalled();
    finishStop();
    await Promise.all([stopping, sending]);
    expect(head).toHaveBeenCalledOnce();
  });

  it("waits a little for a run whose request has not reached the server yet", async () => {
    const { saver, turn, stop } = setup(1);
    // The first look finds no turn; the action claims it a moment later.
    turn
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ runId: "late", status: "running", message: null });
    await saver.stopRun();
    expect(stop).toHaveBeenCalledWith("c1", "late");
  });

  it("keeps a Stop whose run never turned up, and checks again before the next write", async () => {
    const { saver, turn, stop } = setup(1);
    await saver.stopRun(); // 3 looks, no turn
    expect(turn).toHaveBeenCalledTimes(3);
    // The run claimed the turn after all; the next write stops it first.
    turn.mockResolvedValue({ runId: "late", status: "running", message: null });
    await saver.beforeRun([msg("a")]);
    expect(stop).toHaveBeenCalledWith("c1", "late");
  });

  it("keeps a Stop the server did not get, and sends it before the next write", async () => {
    const { saver, stop, append } = setup(1, { runId: "r", status: "running", message: null });
    stop.mockRejectedValueOnce(new StorageError("unavailable"));
    await saver.stopRun();
    expect(stop).toHaveBeenCalledTimes(1);
    await saver.beforeRun([msg("a"), msg("b")]);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledWith("c1", 1, [msg("b")]);
  });

  it("stops a running or waiting run, and leaves an interrupted one", async () => {
    const running = setup(1, { runId: "r", status: "running", message: null });
    await running.saver.stopRun();
    expect(running.stop).toHaveBeenCalledWith("c1", "r");
    const done = setup(1, { runId: "r", status: "interrupted", message: null });
    await done.saver.stopRun();
    expect(done.stop).not.toHaveBeenCalled();
  });
});

describe("titleFromIdea", () => {
  it("uses the first user message, cut to the title length", () => {
    expect(titleFromIdea([msg("a", "A picnic planner")])).toBe("A picnic planner");
    expect(titleFromIdea([msg("a", "x".repeat(200))]).length).toBeLessThanOrEqual(80);
    expect(titleFromIdea([])).toBe("Untitled idea");
  });
});
