import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";

// Saved ideas and their final messages (ADR 0012, 0015, #74). The browser decides which messages
// are final and sends them here; this file keeps the rules that make that safe:
//
// - every function acts only for the signed-in owner, and an idea owned by someone else looks
//   exactly like one that does not exist;
// - messages are append-only and numbered by `seq`, and an append is refused unless the caller
//   knows the current `nextSeq` (another tab may have written first);
// - a rename is refused unless the caller knows the current `titleRev`;
// - an idea stays under `MAX_IDEA_MESSAGES` messages and `MAX_IDEA_BYTES` bytes, so it can
//   always be loaded and deleted in one call.
//
// Failures are `ConvexError`s whose data is only `{ code }`, never conversation text.

export type IdeaErrorCode =
  | "signed-out"
  | "missing"
  | "exists"
  | "conflict"
  | "too-new"
  | "invalid"
  | "too-large"
  | "damaged"
  | "busy"
  | "stale";

export function fail(code: IdeaErrorCode): never {
  throw new ConvexError({ code });
}

// Kept in step with `MAX_TITLE_LENGTH` in apps/web/src/features/storage/types.ts.
export const MAX_TITLE_LENGTH = 80;
// A message is stored in one document, which Convex caps at 1 MiB. Interview messages are a few
// KiB; this leaves room for the record around it.
export const MAX_MESSAGE_BYTES = 512 * 1024;
// A bound on what a single call may write. Kept in step with `MAX_MESSAGES_PER_SAVE` in
// apps/web/src/features/storage/saver.ts, which splits larger saves.
export const MAX_MESSAGES_PER_CALL = 100;
// The most an idea's messages may hold in total. `load` returns them all and `remove` reads them
// all, each in one call, and Convex caps a call at 16 MiB read and 16 MiB returned; half of that
// leaves room for the rest. An interview is a few hundred KiB, so this is thousands of turns.
export const MAX_IDEA_BYTES = 8 * 1024 * 1024;
// The most messages an idea may hold. `load` returns them as one array, which Convex caps at
// 8,192 elements, and `remove` deletes them in one transaction, which Convex caps in documents
// read and written; half the array limit leaves room for both. That is about 2,000 turns.
export const MAX_IDEA_MESSAGES = 4096;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES = new Set(["system", "user", "assistant", "activity"]);

export const record = v.object({
  id: v.string(),
  title: v.string(),
  schemaVersion: v.number(),
  nextSeq: v.number(),
  createdAt: v.number(),
  titleRev: v.number(),
  updatedAt: v.number(),
});

// Only the fields the app needs (docs/internals/data-fetching.md): never the owner or Convex ids.
export function toRecord(idea: Doc<"ideas">) {
  return {
    id: idea.clientId,
    title: idea.title,
    schemaVersion: idea.schemaVersion,
    nextSeq: idea.nextSeq,
    createdAt: idea._creationTime,
    titleRev: idea.titleRev,
    updatedAt: idea.updatedAt,
  };
}

export async function owner(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) fail("signed-out");
  return userId;
}

// The caller's idea with this client id, or null. Someone else's idea is null too.
export async function findOwned(ctx: QueryCtx, userId: Id<"users">, clientId: string) {
  const idea = await ctx.db
    .query("ideas")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique();
  return idea !== null && idea.ownerId === userId ? idea : null;
}

function checkTitle(title: string) {
  if (title.trim().length === 0 || title.length > MAX_TITLE_LENGTH) fail("invalid");
}

// The message's id, after checking it is a message we can store. Its full shape belongs to the
// chat library, so this checks only what storage relies on.
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function checkMessage(json: string): string {
  if (byteLength(json) > MAX_MESSAGE_BYTES) fail("invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail("invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) fail("invalid");
  const { id, role, parts } = parsed as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0) fail("invalid");
  if (typeof role !== "string" || !ROLES.has(role)) fail("invalid");
  if (!Array.isArray(parts)) fail("invalid");
  return id;
}

// Checks the messages and that the idea stays under its limits; returns the idea's new size.
export function checkMessages(
  stored: { count: number; bytes: number },
  messages: ReadonlyArray<string>,
): number {
  if (messages.length > MAX_MESSAGES_PER_CALL) fail("invalid");
  if (stored.count + messages.length > MAX_IDEA_MESSAGES) fail("too-large");
  let bytes = stored.bytes;
  for (const message of messages) {
    checkMessage(message);
    bytes += byteLength(message);
  }
  if (bytes > MAX_IDEA_BYTES) fail("too-large");
  return bytes;
}

export async function insertMessages(
  ctx: MutationCtx,
  ideaId: Id<"ideas">,
  from: number,
  messages: ReadonlyArray<string>,
) {
  const ids = messages.map(checkMessage);
  for (const [index, message] of messages.entries()) {
    await ctx.db.insert("messages", { ideaId, seq: from + index, messageId: ids[index], message });
  }
}

/** The idea's turn document (ADR 0015), or null when nothing is waiting or streaming. */
export async function findTurn(ctx: QueryCtx, ideaId: Id<"ideas">) {
  return ctx.db
    .query("turns")
    .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
    .unique();
}

/**
 * The chat library's id of the idea's last stored message, or null when it has none. With
 * `nextSeq` it identifies the stored history: messages are append-only and each id is unique, so
 * two histories of the same length with the same last message are the same history.
 */
export async function lastMessageId(ctx: QueryCtx, idea: Doc<"ideas">): Promise<string | null> {
  if (idea.nextSeq === 0) return null;
  const last = await ctx.db
    .query("messages")
    .withIndex("by_idea_seq", (q) => q.eq("ideaId", idea._id).eq("seq", idea.nextSeq - 1))
    .unique();
  return last?.messageId ?? null;
}

/** The caller's ideas, most recently updated first. */
export const list = query({
  args: {},
  returns: v.array(record),
  handler: async (ctx) => {
    const userId = await owner(ctx);
    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
    return ideas.map(toRecord);
  },
});

/**
 * One idea's record and the id of its last stored message, without the messages, or null when
 * the caller has no such idea. The browser checks its own history against both before a run.
 */
export const get = query({
  args: { id: v.string() },
  returns: v.union(v.null(), v.object({ record, lastMessageId: v.union(v.string(), v.null()) })),
  handler: async (ctx, { id }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) return null;
    return { record: toRecord(idea), lastMessageId: await lastMessageId(ctx, idea) };
  },
});

/** One idea and its messages in `seq` order, or null when the caller has no such idea. */
export const load = query({
  args: { id: v.string() },
  returns: v.union(v.null(), v.object({ record, messages: v.array(v.string()) })),
  handler: async (ctx, { id }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) return null;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_idea_seq", (q) => q.eq("ideaId", idea._id))
      .order("asc")
      .collect();
    // The count must match `nextSeq`, and `seq` must run 0, 1, ... Anything else is damage the
    // browser must not build on.
    if (rows.length !== idea.nextSeq || rows.some((row, index) => row.seq !== index)) {
      fail("damaged");
    }
    return { record: toRecord(idea), messages: rows.map((row) => row.message) };
  },
});

/** Creates an idea with its first messages at seq 0, 1, ... Fails with `exists` if the id is taken. */
export const create = mutation({
  args: {
    id: v.string(),
    title: v.string(),
    schemaVersion: v.number(),
    messages: v.array(v.string()),
  },
  returns: record,
  handler: async (ctx, { id, title, schemaVersion, messages }) => {
    const userId = await owner(ctx);
    if (!UUID.test(id)) fail("invalid");
    checkTitle(title);
    const taken = await ctx.db
      .query("ideas")
      .withIndex("by_client_id", (q) => q.eq("clientId", id))
      .first();
    if (taken) fail("exists");
    const bytes = checkMessages({ count: 0, bytes: 0 }, messages);
    const ideaId = await ctx.db.insert("ideas", {
      clientId: id,
      ownerId: userId,
      title,
      schemaVersion,
      nextSeq: messages.length,
      bytes,
      titleRev: 0,
      updatedAt: Date.now(),
    });
    await insertMessages(ctx, ideaId, 0, messages);
    const idea = await ctx.db.get(ideaId);
    if (!idea) fail("missing");
    return toRecord(idea);
  },
});

/** Appends messages at `expectedNextSeq`. Fails with `conflict` if another write came first. */
export const append = mutation({
  args: {
    id: v.string(),
    expectedNextSeq: v.number(),
    schemaVersion: v.number(),
    messages: v.array(v.string()),
  },
  returns: record,
  handler: async (ctx, { id, expectedNextSeq, schemaVersion, messages }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) fail("missing");
    if (idea.schemaVersion > schemaVersion) fail("too-new");
    if (idea.nextSeq !== expectedNextSeq) fail("conflict");
    // A run's reply goes after the messages it was started with; one appended under it would
    // land before a reply that never saw it. An interrupted turn does not hold the idea.
    const turn = await findTurn(ctx, idea._id);
    if (turn && turn.status !== "interrupted") fail("busy");
    const bytes = checkMessages({ count: idea.nextSeq, bytes: idea.bytes }, messages);
    await insertMessages(ctx, idea._id, idea.nextSeq, messages);
    await ctx.db.patch(idea._id, {
      nextSeq: idea.nextSeq + messages.length,
      bytes,
      updatedAt: Date.now(),
    });
    const next = await ctx.db.get(idea._id);
    if (!next) fail("missing");
    return toRecord(next);
  },
});

/** Renames an idea. Fails with `conflict` unless the stored `titleRev` is `expectedTitleRev`. */
export const rename = mutation({
  args: {
    id: v.string(),
    title: v.string(),
    expectedTitleRev: v.number(),
    schemaVersion: v.number(),
  },
  returns: record,
  handler: async (ctx, { id, title, expectedTitleRev, schemaVersion }) => {
    const userId = await owner(ctx);
    checkTitle(title);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) fail("missing");
    if (idea.schemaVersion > schemaVersion) fail("too-new");
    if (idea.titleRev !== expectedTitleRev) fail("conflict");
    await ctx.db.patch(idea._id, { title, titleRev: idea.titleRev + 1, updatedAt: Date.now() });
    const next = await ctx.db.get(idea._id);
    if (!next) fail("missing");
    return toRecord(next);
  },
});

/**
 * Deletes an idea, all its messages and its turn. A missing idea is not an error. A run still
 * streaming finds its turn gone at its next write and stops.
 */
export const remove = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) return null;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_idea_seq", (q) => q.eq("ideaId", idea._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    const turn = await findTurn(ctx, idea._id);
    if (turn) await ctx.db.delete(turn._id);
    await ctx.db.delete(idea._id);
    return null;
  },
});
