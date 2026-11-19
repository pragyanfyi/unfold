import type { UIMessage } from "@tanstack/ai-react";
import { type ConversationStore, StorageError } from "./store";
import { MAX_TITLE_LENGTH } from "./types";

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
// - anything else not stored yet is appended.
// A failure stops the request: the run would start from a conversation the server does not have.
// After a conflict it stops for good: this tab does not merge, and never recreates a conversation
// deleted elsewhere.
export class ConversationSaver {
  private readonly options: Options;
  private latest: ReadonlyArray<UIMessage> = [];
  private stopped = false;
  private running: Promise<void> = Promise.resolve();

  constructor(options: Options) {
    this.options = options;
  }

  /**
   * Stores the messages that are about to be sent. Resolves when storage is current and throws
   * when it is not, so the caller does not send.
   */
  beforeRun(messages: ReadonlyArray<UIMessage>): Promise<void> {
    this.latest = messages;
    return this.queue();
  }

  /** Try again after a storage failure, with the messages of the last request. */
  retry(): Promise<void> {
    return this.queue().catch(() => {});
  }

  /** Stops the idea's running or waiting run, if any (the user pressed Stop). */
  async stopRun(): Promise<void> {
    try {
      const turn = await this.options.store.turn(this.options.id);
      if (turn && turn.status !== "interrupted") {
        await this.options.store.stop(this.options.id, turn.runId);
      }
    } catch {
      // The run ends by itself: the next batch finds the turn gone, or the scheduled check does.
    }
  }

  private queue(): Promise<void> {
    const next = this.running.catch(() => {}).then(() => this.sync());
    this.running = next;
    return next;
  }

  private async sync() {
    // A conversation that conflicted is never written again, and no run may start from it.
    if (this.stopped) throw new StorageError("conflict");
    if (this.latest.length === 0) return;
    const { store, id } = this.options;
    this.options.onStatus({ kind: "saving" });
    try {
      const head = await store.head(id);
      if (!head) {
        await store.create({ id, title: titleFromIdea(this.latest), messages: this.latest });
        this.options.onSaved();
      } else {
        await this.catchUp(head.nextSeq);
      }
    } catch (error) {
      this.fail(error);
      throw error;
    }
    this.options.onStatus({ kind: "idle" });
  }

  private async catchUp(nextSeq: number) {
    const { store, id } = this.options;
    let pending = this.latest.slice(nextSeq);
    let stored = nextSeq;
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
    while (pending.length > 0) {
      const batch = pending.slice(0, MAX_MESSAGES_PER_SAVE);
      await store.append(id, stored, batch);
      pending = pending.slice(batch.length);
      stored += batch.length;
    }
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

function messageId(json: string | null): string | null {
  if (!json) return null;
  try {
    const id = (JSON.parse(json) as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}
