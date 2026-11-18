import type { UIMessage } from "@tanstack/ai-react";

// The stored shapes (ADR 0015, #74). Ideas live in Convex, in `packages/backend/convex/ideas.ts`;
// these are what its functions return. No provider key is ever part of them (ADR 0003).

// The shape of the stored messages. Raise it when the chat library changes `UIMessage` in a way
// old messages do not satisfy, and add a migration.
export const SCHEMA_VERSION = 1;

export type ConversationRecord = {
  id: string; // UUIDv7, generated in the browser; the idea's address is `/c/<id>`
  title: string;
  schemaVersion: number;
  nextSeq: number; // count of stored messages
  createdAt: number; // ms since the epoch
  titleRev: number; // incremented on every title change
  updatedAt: number; // last append or title change, ms since the epoch
};

export type LoadedConversation = { record: ConversationRecord; messages: Array<UIMessage> };

// Kept in step with `MAX_TITLE_LENGTH` in packages/backend/convex/ideas.ts.
export const MAX_TITLE_LENGTH = 80;
