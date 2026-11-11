import type { UIMessage } from "@tanstack/ai-react";
import type { ConversationRecord, LoadedConversation } from "./types";

// Why a storage call failed. The UI words each one; none of them carries conversation text.
export type StorageErrorCode =
  | "conflict" // another tab changed the conversation first
  | "missing" // the conversation is gone (deleted elsewhere); never recreated
  | "exists" // creating a conversation whose id is taken
  | "too-new" // stored by newer code than this
  | "quota" // the browser refused the write for space
  | "unavailable"; // IndexedDB cannot be opened or used

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "StorageError";
    this.code = code;
  }
}

// The storage seam. Chat code and tests depend on this, not on IndexedDB (ADR 0013).
export interface ConversationStore {
  /** Most recently updated first. */
  list(): Promise<Array<ConversationRecord>>;
  /** `null` when there is no such conversation. */
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
