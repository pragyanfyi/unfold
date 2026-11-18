import type { UIMessage } from "@tanstack/ai-react";
import type { ConversationRecord, LoadedConversation } from "./types";

// Why a storage call failed. The UI words each one; none of them carries conversation text.
export type StorageErrorCode =
  | "conflict" // another tab or device changed the conversation first
  | "missing" // the conversation is gone (deleted elsewhere); never recreated
  | "exists" // creating a conversation whose id is taken
  | "too-new" // stored by newer code than this
  | "unavailable"; // the server refused or failed the call

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "StorageError";
    this.code = code;
  }
}

// The storage seam for one-off reads and writes. Chat code and tests depend on this, not on
// Convex. The list of ideas is a live query instead (`queries.ts`).
export interface ConversationStore {
  /** `null` when the signed-in user has no such conversation. */
  load(id: string): Promise<LoadedConversation | null>;
  /** Fails with `exists` if the id is taken. `messages` are written at seq 0, 1, ... */
  create(input: {
    id: string;
    title: string;
    messages: ReadonlyArray<UIMessage>;
  }): Promise<ConversationRecord>;
  /** Fails with `conflict` unless the stored `nextSeq` equals `expectedNextSeq`. */
  append(
    id: string,
    expectedNextSeq: number,
    messages: ReadonlyArray<UIMessage>,
  ): Promise<ConversationRecord>;
  /** Fails with `conflict` unless the stored `titleRev` equals `expectedTitleRev`. */
  rename(id: string, title: string, expectedTitleRev: number): Promise<ConversationRecord>;
  /** Removes the record and all its messages. A missing conversation is not an error. */
  remove(id: string): Promise<void>;
}
