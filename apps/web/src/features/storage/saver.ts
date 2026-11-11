import type { UIMessage } from "@tanstack/ai-react";
import { type ConversationStore, StorageError } from "./store";
import { MAX_TITLE_LENGTH } from "./types";

// What the UI shows about saving (ADR 0013). `unsaved` and `conflict` are warnings that stay
// until fixed. The conversation keeps working in memory either way.
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "unsaved"; reason: "quota" | "unavailable" | "too-new" }
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
  /** How many messages of this conversation are already stored. 0 for a new one. */
  stored: number;
  onStatus: (status: SaveStatus) => void;
  /** Called after each committed save, for refreshing lists and telling other tabs. */
  onSaved: () => void;
};

// Writes the savable prefix of one conversation, in order, one transaction at a time. It
// never rewrites or deletes: the prefix only grows. After a storage failure the unsaved
// messages stay queued and go out as one batch on the next `sync` or `retry` (a transaction
// is all or nothing, so a retry cannot duplicate or skip messages). After a conflict it stops
// for good: this tab does not merge, and never recreates a conversation deleted elsewhere.
export class ConversationSaver {
  private readonly options: Options;
  private stored: number;
  private latest: ReadonlyArray<UIMessage> = [];
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(options: Options) {
    this.options = options;
    this.stored = options.stored;
  }

  /** Offer the current savable prefix. Cheap to call whenever it changes. */
  sync(prefix: ReadonlyArray<UIMessage>): Promise<void> {
    this.latest = prefix;
    return this.flush();
  }

  /** Try again after a storage failure. */
  retry(): Promise<void> {
    return this.flush();
  }

  private flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain() {
    // `latest` can grow while a write is in flight, so loop until nothing is left.
    while (!this.stopped && this.latest.length > this.stored) {
      const batch = this.latest.slice(this.stored);
      this.options.onStatus({ kind: "saving" });
      try {
        if (this.stored === 0) {
          await this.options.store.create({
            id: this.options.id,
            title: titleFromIdea(batch),
            messages: batch,
          });
        } else {
          await this.options.store.append(this.options.id, this.stored, batch);
        }
      } catch (error) {
        this.fail(error);
        return;
      }
      this.stored += batch.length;
      this.options.onStatus({ kind: "idle" });
      this.options.onSaved();
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
    } else if (code === "quota" || code === "too-new") {
      this.options.onStatus({ kind: "unsaved", reason: code });
    } else {
      this.options.onStatus({ kind: "unsaved", reason: "unavailable" });
    }
  }
}
