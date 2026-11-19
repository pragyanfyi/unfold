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

// A store with `stored` messages and the given turn. Nothing here is conversation text that
// matters: the saver only moves messages around.
function fakeStore(stored: number | null, turn: TurnState | null = null) {
  const fail: { next: StorageErrorCode | null } = { next: null };
  const guard = () => {
    if (fail.next) throw new StorageError(fail.next);
  };
  const store = {
    head: vi.fn(async () => {
      guard();
      return stored === null ? null : { nextSeq: stored };
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
    stop: vi.fn(async (_id: string, _runId: string) => {}),
  };
  return { store: store as unknown as ConversationStore, fail, ...store };
}

function setup(stored: number | null, turn: TurnState | null = null) {
  const fake = fakeStore(stored, turn);
  const statuses: Array<SaveStatus> = [];
  const onSaved = vi.fn();
  const saver = new ConversationSaver({
    store: fake.store,
    id: "c1",
    onStatus: (s) => statuses.push(s),
    onSaved,
  });
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
    expect(stop).toHaveBeenCalledWith("c1", "run-1");
    expect(answer).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith("c1", 1, [msg("b")]);
  });

  it("abandons a waiting question even when there is nothing to write", async () => {
    const { saver, append, stop } = setup(2, waiting("lost-question"));
    await saver.beforeRun([msg("a"), msg("b")]);
    expect(stop).toHaveBeenCalledWith("c1", "run-1");
    expect(append).not.toHaveBeenCalled();
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
