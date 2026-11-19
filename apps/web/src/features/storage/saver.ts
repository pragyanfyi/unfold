import type { UIMessage } from "@tanstack/ai-react";
import { type ConversationStore, StorageError } from "./store";
import { MAX_TITLE_LENGTH, type StoredHistory } from "./types";

// The most messages one write may carry. Kept in step with `MAX_MESSAGES_PER_CALL` in
// packages/backend/convex/ideas.ts; a longer queue goes out in several writes.
export const MAX_MESSAGES_PER_SAVE = 100;

// What the UI shows about saving (ADR 0013). `unsaved` and `conflict` are warnings that stay
// until fixed. The conversation keeps working in memory either way.
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "unsaved"; reason: "unavailable" | "too-new" }
  | { kind: "conflict"; reason: "changed" | "deleted" };

export function titleFromIdea(messages: ReadonlyArray<UIMessage>): string {
  const first = messages.find((message) => message.role === "user");
  const text = first?.parts
    .flatMap((part) => (part.type === "text" ? [part.content] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Untitled idea";
  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : text;
}

type Options = {
  store: ConversationStore;
  id: string;
  /** True when the idea was already stored when the screen opened it. */
  existed?: boolean;
  /**
   * How long Stop looks for a run that has not reached the server yet: the request may still be
   * on its way to the action when the user stops it.
   */
  stopWait?: { tries: number; delayMs: number };
  onStatus: (status: SaveStatus) => void;
  /** Called after each committed save, for telling the screen a new idea now exists. */
  onSaved: () => void;
};

// Writes what the browser knows before each run (ADR 0015). Once a run starts, Convex is the
// writer of everything the model says: the action stores the closing reply, and the user's answer
// to a round or finish proposal goes through `turns.answer`. So this saver never watches the
// stream. Before each request it brings storage up to the messages being sent:
// - a new idea is created with them;
// - the answer to the waiting run is stored with `answer`, which also frees the turn;
// - a waiting question the browser no longer has (a reload lost it) is abandoned, so a new run
//   may start;
// - a reply without a question at the end is skipped: the action stores complete ones, so this one
//   was stopped or failed, and is never stored;
// - anything else not stored yet is appended.
// It refuses, as a conflict, a history that is not the stored one (shorter, or the same length
// with another last message): another tab or device moved on. It resolves with the stored history,
// which the request carries so the action can refuse a run from history the server does not have. A failure stops the request. After a conflict it stops
// for good: this tab does not merge, and never recreates a conversation deleted elsewhere.
export class ConversationSaver {
  private readonly options: Options;
  private latest: ReadonlyArray<UIMessage> = [];
  private stopped = false;
  private exists: boolean;
  // Set when Stop could not reach the server; the next write tries it again first.
  private stopPending = false;
  private running: Promise<unknown> = Promise.resolve();

  constructor(options: Options) {
    this.options = options;
    this.exists = options.existed ?? false;
  }

  /**
   * Stores the messages that are about to be sent, and resolves with the stored history. Throws
   * when storage is not current, so the caller does not send.
   */
  beforeRun(messages: ReadonlyArray<UIMessage>): Promise<StoredHistory> {
    this.latest = messages;
    return this.queue(() => this.sync());
  }

  /** Try again after a storage failure, with the messages of the last request. */
  retry(): Promise<void> {
    return this.queue(() => this.sync()).then(
      () => {},
      () => {},
    );
  }

  /**
   * Stops the idea's running or waiting run, if any (the user pressed Stop). Queued with the
   * writes, so a request sent right after waits for it instead of finding the turn still busy.
   * The request may still be on its way, so Stop looks for its run for a short while. If the
   * server cannot be reached, or no run turns up, the stop is kept and tried again before the
   * next write.
   */
  stopRun(): Promise<void> {
    this.stopPending = true;
    return this.queue(() => this.stopTurn(true)).catch(() => {});
  }

  private async stopTurn(waitForRun = false): Promise<void> {
    if (!this.stopPending) return;
    const { store, id } = this.options;
    const { tries, delayMs } = this.options.stopWait ?? { tries: 12, delayMs: 250 };
    for (let attempt = 0; ; attempt++) {
      const turn = await store.turn(id);
      if (turn?.status === "running" || turn?.status === "waiting") {
        await store.stop(id, turn.runId);
        this.stopPending = false;
        return;
      }
      // Before the next write no request of this tab is in flight, so no run can turn up.
      if (!waitForRun) {
        this.stopPending = false;
        return;
      }
      if (attempt + 1 >= tries) return;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.running.catch(() => {}).then(work);
    this.running = next;
    return next;
  }

  private async sync(): Promise<StoredHistory> {
    // A conversation that conflicted is never written again, and no run may start from it.
    if (this.stopped) throw new StorageError("conflict");
    const { store, id } = this.options;
    this.options.onStatus({ kind: "saving" });
    let stored: number;
    try {
      await this.stopTurn();
      const head = await store.head(id);
      if (head) {
        this.exists = true;
        stored = await this.catchUp(head.record.nextSeq, head.lastMessageId);
      } else if (this.exists) {
        // It was stored and is gone: deleted in another tab or device. Never recreate it.
        throw new StorageError("missing");
      } else {
        await store.create({ id, title: titleFromIdea(this.latest), messages: this.latest });
        this.exists = true;
        stored = this.latest.length;
        this.options.onSaved();
      }
    } catch (error) {
      this.fail(error);
      throw error;
    }
    this.options.onStatus({ kind: "idle" });
    return {
      nextSeq: stored,
      lastMessageId: stored > 0 ? (this.latest[stored - 1]?.id ?? null) : null,
    };
  }

  private async catchUp(nextSeq: number, lastMessageId: string | null): Promise<number> {
    const { store, id } = this.options;
    let pending = this.latest.slice(nextSeq);
    let stored = nextSeq;
    // Storage holds another history than this tab: more messages, or as many with another last
    // one (another tab or device moved on). Checked before anything is written or stopped: a run
    // from this tab's history would answer messages the server does not hold in that order.
    if (this.latest.length < nextSeq) throw new StorageError("conflict");
    if (nextSeq > 0 && this.latest[nextSeq - 1]?.id !== lastMessageId) {
      throw new StorageError("conflict");
    }
    // A run waiting for an answer holds the idea, so it is dealt with even when nothing is
    // pending: after a reload the tab no longer has the question, and a new run needs the turn.
    // A running turn is left alone: it is another tab's reply, and the request will be refused
    // as busy until it ends.
    const turn = await store.turn(id);
    if (turn?.status === "waiting") {
      const waitingId = messageId(turn.message);
      if (waitingId !== null && pending[0]?.id === waitingId) {
        await store.answer(id, { runId: turn.runId, expectedNextSeq: stored, message: pending[0] });
        pending = pending.slice(1);
        stored += 1;
      } else {
        // A question this tab does not have: abandon it.
        await store.stop(id, turn.runId);
      }
    }
    // Only the user's own messages, and an answered question, are the browser's to store. A reply
    // with no question in it is stored by the action when its run ends, so one still pending is a
    // reply that was stopped or failed (ADR 0015). At the end it is skipped, so Try again can
    // continue past it; anywhere else the history is not one this tab can store.
    const last = pending.at(-1);
    if (last && isReplyWithoutQuestion(last)) pending = pending.slice(0, -1);
    if (pending.some(isReplyWithoutQuestion)) throw new StorageError("unavailable");
    while (pending.length > 0) {
      const batch = pending.slice(0, MAX_MESSAGES_PER_SAVE);
      await store.append(id, stored, batch);
      pending = pending.slice(batch.length);
      stored += batch.length;
    }
    return stored;
  }

  private fail(error: unknown) {
    const code = error instanceof StorageError ? error.code : "unavailable";
    if (code === "conflict" || code === "exists") {
      this.stopped = true;
      this.options.onStatus({ kind: "conflict", reason: "changed" });
    } else if (code === "missing") {
      this.stopped = true;
      this.options.onStatus({ kind: "conflict", reason: "deleted" });
    } else if (code === "too-new") {
      this.options.onStatus({ kind: "unsaved", reason: code });
    } else {
      this.options.onStatus({ kind: "unsaved", reason: "unavailable" });
    }
  }
}

function isReplyWithoutQuestion(message: UIMessage): boolean {
  return message.role === "assistant" && !message.parts.some((part) => part.type === "tool-call");
}

function messageId(json: string | null): string | null {
  if (!json) return null;
  try {
    const id = (JSON.parse(json) as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}
