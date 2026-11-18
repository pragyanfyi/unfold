import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The data model of ADR 0015: one document per idea and one per final message (ADR 0012).
// No provider key is ever a field here (ADR 0003).
//
// Schema changes must stay backward compatible (ADR 0015, Data model): add a field before code
// uses it, migrate, and remove the old one only when nothing reads it, because the previous
// release's functions may run against the new schema during a deploy.
export default defineSchema({
  // The signed-in people (ADR 0016). Sessions, Google links and password records live in Convex
  // Auth's own components, not here.
  users: defineTable({}),

  // One idea is one conversation.
  ideas: defineTable({
    // The idea's id in addresses (`/c/<clientId>`): a UUIDv7 made in the browser, so a new idea
    // has its address before its first save finishes (#74).
    clientId: v.string(),
    // The signed-in user who owns the idea. Every function checks it (#74).
    ownerId: v.id("users"),
    title: v.string(),
    // The version of the stored message shape. Raised when the chat library changes `UIMessage`
    // in a way old documents do not satisfy, with a migration.
    schemaVersion: v.number(),
    // The count of message documents; the next append goes at this `seq`.
    nextSeq: v.number(),
    // The total size of the idea's messages in bytes, kept under `MAX_IDEA_BYTES` (ideas.ts).
    bytes: v.number(),
    // Incremented on every title change, so a rename can detect a concurrent one.
    titleRev: v.number(),
    // Last append or title change, in ms since the epoch. Creation time is `_creationTime`.
    updatedAt: v.number(),
  })
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .index("by_client_id", ["clientId"]),

  // One final message per document, append-only, ordered only by `seq`. Messages still
  // streaming or waiting for an answer live in the idea's turn document (`turns`), not here.
  messages: defineTable({
    ideaId: v.id("ideas"),
    // 0-based and contiguous within the idea.
    seq: v.number(),
    // The chat library's message id.
    messageId: v.string(),
    // The chat library's `UIMessage` as JSON text. Its shape belongs to the library and holds
    // values Convex cannot store as fields (a `Date`, keys of any name), so it is kept as text;
    // `ideas.ts` checks it on the way in.
    message: v.string(),
  }).index("by_idea_seq", ["ideaId", "seq"]),

  // The idea's message that is not final yet (ADR 0015, Data model): a reply still streaming, or
  // one waiting for the user's answer. At most one per idea, owned by one run (`turns.ts`).
  turns: defineTable({
    ideaId: v.id("ideas"),
    // The run that owns the turn. Only that run may write it, and only while `running`.
    runId: v.string(),
    // `running`: the action is streaming. `waiting`: the run ended with a round or finish
    // proposal that needs the user's answer. `interrupted`: the run failed, was stopped, or went
    // quiet; the next run replaces the turn.
    status: v.union(v.literal("running"), v.literal("waiting"), v.literal("interrupted")),
    // The chat library's `UIMessage` as JSON text, as in `messages.message`. Absent until the
    // run's first batch.
    message: v.optional(v.string()),
    // The run's last write, in ms since the epoch. The scheduled check reads it.
    lastWriteAt: v.number(),
  }).index("by_idea", ["ideaId"]),
});
