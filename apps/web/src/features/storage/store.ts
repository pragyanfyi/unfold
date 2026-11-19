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
// The idea's message that is not final yet: a reply streaming in Convex, or a round or finish
// proposal waiting for the user's answer (ADR 0015).
export type TurnState = {
  runId: string;
  status: "running" | "waiting" | "interrupted";
  /** The message so far, as JSON text. */
  message: string | null;
};

export interface ConversationStore {
  /**
   * The record and its last stored message's id, without the messages. `null` when the signed-in
   * user has no such conversation.
   */
  head(id: string): Promise<{ record: ConversationRecord; lastMessageId: string | null } | null>;
  /** The idea's turn, if a run is streaming or waiting for an answer. */
  turn(id: string): Promise<TurnState | null>;
  /**
   * Stores the user's answer to the waiting run `runId`: `message` is that run's message with the
   * answer in it. Fails with `conflict` unless the stored `nextSeq` equals `expectedNextSeq`.
   */
  answer(
    id: string,
    input: { runId: string; expectedNextSeq: number; message: UIMessage },
  ): Promise<ConversationRecord>;
  /**
   * Stops the run `runId`, or abandons its waiting question. With `expectedNextSeq`, fails with
   * `conflict` unless the stored `nextSeq` still equals it.
   */
  stop(id: string, runId: string, expectedNextSeq?: number): Promise<void>;
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
