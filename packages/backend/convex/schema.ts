import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The data model of ADR 0015: one document per idea and one per final message (ADR 0012).
// No provider key is ever a field here (ADR 0003).
//
// Schema changes must stay backward compatible (ADR 0015, Data model): add a field before code
// uses it, migrate, and remove the old one only when nothing reads it, because the previous
// release's functions may run against the new schema during a deploy.
export default defineSchema({
  // One idea is one conversation.
  ideas: defineTable({
    // The signed-in user who owns the idea. Its exact form follows the auth setup (#33, #34).
    ownerId: v.string(),
    title: v.string(),
    // The version of the stored message shape. Raised when the chat library changes `UIMessage`
    // in a way old documents do not satisfy, with a migration.
    schemaVersion: v.number(),
    // The count of message documents; the next append goes at this `seq`.
    nextSeq: v.number(),
    // Incremented on every title change, so a rename can detect a concurrent one.
    titleRev: v.number(),
    // Last append or title change, in ms since the epoch. Creation time is `_creationTime`.
    updatedAt: v.number(),
  }).index("by_owner_updated", ["ownerId", "updatedAt"]),

  // One final message per document, append-only, ordered only by `seq`. Messages still
  // streaming or waiting for an answer live in the idea's turn document, which arrives with
  // the storage and chat moves (#74, #75), not here.
  messages: defineTable({
    ideaId: v.id("ideas"),
    // 0-based and contiguous within the idea.
    seq: v.number(),
    // The chat library's message id.
    messageId: v.string(),
    // The chat library's `UIMessage`, stored as is. Its shape belongs to the library, so the
    // functions that append messages validate it (#74), not this schema.
    message: v.any(),
  }).index("by_idea_seq", ["ideaId", "seq"]),
});
