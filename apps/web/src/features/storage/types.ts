import type { UIMessage } from "@tanstack/ai-react";

// The stored shapes from ADR 0013. Nothing else is written to IndexedDB: a test asserts it,
// so a provider key can never ride along in a record (ADR 0003).

// The shape of the message records. Raise it when the chat library changes `UIMessage`
// in a way old records do not satisfy, and add a migration.
export const SCHEMA_VERSION = 1;

export type ConversationRecord = {
  id: string; // UUIDv7, generated in the browser
  title: string;
  schemaVersion: number;
  nextSeq: number; // count of stored messages
  createdAt: string; // ISO 8601 UTC
  titleRev: number; // incremented on every title change
  updatedAt: string; // last append or title change
};

export type MessageRecord = {
  conversationId: string;
  seq: number; // 0-based, contiguous; the key is [conversationId, seq]
  id: string;
  createdAt: string;
  message: UIMessage;
};

export type LoadedConversation = { record: ConversationRecord; messages: Array<UIMessage> };

export const MAX_TITLE_LENGTH = 80;
