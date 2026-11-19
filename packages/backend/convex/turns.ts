import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query } from "./_generated/server";
import {
  checkMessage,
  checkMessages,
  fail,
  findOwned,
  findTurn,
  insertMessages,
  lastMessageId,
  owner,
  record,
  toRecord,
} from "./ideas";

// The turn document (ADR 0015, Data model): the one message of an idea that is not final yet,
// owned by one run of the interview.
//
// - The HTTP action that runs the model (#75) is the only writer while a run streams. It calls
//   the internal functions here: `start`, `batch`, `end` and `interrupt`. Each write after
//   `start` must name the run that owns the turn, and the turn must still be `running`, checked
//   in the same transaction; a run that lost the turn writes nothing and learns so from the
//   result, so it can stop.
// - The owner reads the turn with `get`, answers a waiting run with `answer`, and stops a running
//   one with `stop`.
// - A run that dies without saying so is marked `interrupted` by `check`, a scheduled mutation
//   that follows the run's last write.
// - A message leaves the turn only by being appended at `nextSeq`, in the mutation that clears
//   the turn. A failed or stopped run is never appended.
//
// Provider keys never reach this file: no argument, field or scheduled job here holds one
// (ADR 0003). The action reads the key from its request header and keeps it there.

/**
 * How long a running turn may go without a write before the scheduled check marks it
 * interrupted. Above the longest normal gap between batches: the action (#75, not built yet) must
 * write at least every `RUN_HEARTBEAT_MS` while the model is quiet, so only a run that died goes
 * this long.
 */
export const RUN_STALE_MS = 90_000;
/** How often the action must write a running turn, at the latest, even with nothing new to add. */
export const RUN_HEARTBEAT_MS = 30_000;
/** A run id is the action's own UUID or similar token; this only bounds its size. */
export const MAX_RUN_ID_LENGTH = 100;

const status = v.union(v.literal("running"), v.literal("waiting"), v.literal("interrupted"));

const turnRecord = v.object({
  runId: v.string(),
  status,
  message: v.union(v.string(), v.null()),
});

function checkRunId(runId: string) {
  if (runId.length === 0 || runId.length > MAX_RUN_ID_LENGTH) fail("invalid");
}

// The turn when `runId` owns it and it is still running, or null: the caller has lost the turn.
async function ownedRunning(ctx: MutationCtx, ideaId: Id<"ideas">, runId: string) {
  const turn = await findTurn(ctx, ideaId);
  return turn && turn.runId === runId && turn.status === "running" ? turn : null;
}

// Appends one final message at the idea's `nextSeq`, within the idea's limits.
async function appendFinal(ctx: MutationCtx, idea: Doc<"ideas">, message: string) {
  const bytes = checkMessages({ count: idea.nextSeq, bytes: idea.bytes }, [message]);
  await insertMessages(ctx, idea._id, idea.nextSeq, [message]);
  await ctx.db.patch(idea._id, { nextSeq: idea.nextSeq + 1, bytes, updatedAt: Date.now() });
}

/**
 * The caller's turn for the idea `id`: what is streaming or waiting for an answer, or null when
 * there is none, or no such idea of the caller's. Live, so every tab follows the run.
 */
export const get = query({
  args: { id: v.string() },
  returns: v.union(v.null(), turnRecord),
  handler: async (ctx, { id }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) return null;
    const turn = await findTurn(ctx, idea._id);
    if (!turn) return null;
    return { runId: turn.runId, status: turn.status, message: turn.message ?? null };
  },
});

/**
 * Starts a run on the idea `id` for the user `ownerId`, whom the action has signed in. Allowed
 * only when the idea has no turn or an interrupted one, which the new run replaces. Fails with
 * `missing` when the user has no such idea, `busy` while another run owns the turn, and
 * `conflict` unless the idea holds exactly `expectedNextSeq` messages, the last of them
 * `expectedLastMessageId`: the run's request carries that history, and its reply is appended after
 * it. Two tabs can hold histories of the same length that differ, so the count alone is not enough.
 */
export const start = internalMutation({
  args: {
    ownerId: v.id("users"),
    id: v.string(),
    runId: v.string(),
    expectedNextSeq: v.number(),
    expectedLastMessageId: v.union(v.string(), v.null()),
  },
  returns: v.id("ideas"),
  handler: async (ctx, { ownerId, id, runId, expectedNextSeq, expectedLastMessageId }) => {
    checkRunId(runId);
    const idea = await findOwned(ctx, ownerId, id);
    if (!idea) fail("missing");
    const turn = await findTurn(ctx, idea._id);
    if (turn && turn.status !== "interrupted") fail("busy");
    if (idea.nextSeq !== expectedNextSeq) fail("conflict");
    if ((await lastMessageId(ctx, idea)) !== expectedLastMessageId) fail("conflict");
    if (turn) await ctx.db.delete(turn._id);
    const now = Date.now();
    await ctx.db.insert("turns", { ideaId: idea._id, runId, status: "running", lastWriteAt: now });
    // Only the two ids: never anything from the request (ADR 0003).
    await ctx.scheduler.runAfter(RUN_STALE_MS, internal.turns.check, {
      ideaId: idea._id,
      runId,
    });
    return idea._id;
  },
});

/**
 * Writes the run's message so far, or only marks the run alive when `message` is absent.
 * Returns false, and writes nothing, when the run no longer owns a running turn.
 */
export const batch = internalMutation({
  args: { ideaId: v.id("ideas"), runId: v.string(), message: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { ideaId, runId, message }) => {
    const turn = await ownedRunning(ctx, ideaId, runId);
    if (!turn) return false;
    if (message !== undefined) checkMessage(message);
    await ctx.db.patch(turn._id, {
      lastWriteAt: Date.now(),
      ...(message === undefined ? {} : { message }),
    });
    return true;
  },
});

/**
 * Ends the run with its final message. With `needsAnswer` (a round or finish proposal), the turn
 * keeps the message and waits for the user's answer. Without it (a closing reply), the message is
 * appended to the idea and the turn is cleared. Returns false, and writes nothing, when the run
 * no longer owns a running turn. Fails with `too-large`, leaving the turn running, when the idea
 * cannot take the message; the action then interrupts the run. A waiting message is checked too,
 * so a run never waits for an answer that could not be stored.
 */
export const end = internalMutation({
  args: {
    ideaId: v.id("ideas"),
    runId: v.string(),
    message: v.string(),
    needsAnswer: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, { ideaId, runId, message, needsAnswer }) => {
    const turn = await ownedRunning(ctx, ideaId, runId);
    if (!turn) return false;
    const idea = await ctx.db.get(ideaId);
    if (!idea) return false;
    if (needsAnswer) {
      checkMessages({ count: idea.nextSeq, bytes: idea.bytes }, [message]);
      await ctx.db.patch(turn._id, { status: "waiting", message, lastWriteAt: Date.now() });
      return true;
    }
    await appendFinal(ctx, idea, message);
    await ctx.db.delete(turn._id);
    return true;
  },
});

/**
 * Marks the run's turn interrupted, keeping what it wrote, for a run that failed or was cut off.
 * Does nothing, and returns false, when the run no longer owns a running turn, so a failing old
 * run cannot interrupt a newer one.
 */
export const interrupt = internalMutation({
  args: { ideaId: v.id("ideas"), runId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { ideaId, runId }) => {
    const turn = await ownedRunning(ctx, ideaId, runId);
    if (!turn) return false;
    await ctx.db.patch(turn._id, { status: "interrupted" });
    return true;
  },
});

/**
 * The scheduled check that follows a run (ADR 0015). It marks the turn interrupted when the run
 * has not written for `RUN_STALE_MS`, and otherwise checks again that long after the run's last
 * write. It stops once the run has lost the turn or the turn is no longer running.
 */
export const check = internalMutation({
  args: { ideaId: v.id("ideas"), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ideaId, runId }) => {
    const turn = await ownedRunning(ctx, ideaId, runId);
    if (!turn) return null;
    const due = turn.lastWriteAt + RUN_STALE_MS;
    if (Date.now() >= due) {
      await ctx.db.patch(turn._id, { status: "interrupted" });
    } else {
      await ctx.scheduler.runAt(due, internal.turns.check, { ideaId, runId });
    }
    return null;
  },
});

/**
 * The user's answer to a waiting run: `message` is the run's message with the answer stored in
 * it (ADR 0012). It is appended at `expectedNextSeq` and the turn is cleared. Fails with `stale`
 * unless run `runId` owns a waiting turn, `conflict` if another write moved `nextSeq`, and
 * `invalid` if the message is not the waiting one.
 */
export const answer = mutation({
  args: {
    id: v.string(),
    runId: v.string(),
    expectedNextSeq: v.number(),
    schemaVersion: v.number(),
    message: v.string(),
  },
  returns: record,
  handler: async (ctx, { id, runId, expectedNextSeq, schemaVersion, message }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) fail("missing");
    if (idea.schemaVersion > schemaVersion) fail("too-new");
    const turn = await findTurn(ctx, idea._id);
    if (!turn || turn.runId !== runId || turn.status !== "waiting" || !turn.message) fail("stale");
    if (idea.nextSeq !== expectedNextSeq) fail("conflict");
    if (checkMessage(message) !== checkMessage(turn.message)) fail("invalid");
    await appendFinal(ctx, idea, message);
    await ctx.db.delete(turn._id);
    const next = await ctx.db.get(idea._id);
    if (!next) fail("missing");
    return toRecord(next);
  },
});

/**
 * Stops the caller's run `runId`, running or waiting: the turn becomes interrupted, so the next
 * run may replace it. A running action stops at its next write. Stopping a waiting run abandons
 * its question, which is also the way out when the answer cannot be stored (`too-large`).
 * A run that already ended, or another run, is left alone.
 */
export const stop = mutation({
  args: { id: v.string(), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, runId }) => {
    const userId = await owner(ctx);
    const idea = await findOwned(ctx, userId, id);
    if (!idea) return null;
    const turn = await findTurn(ctx, idea._id);
    if (turn && turn.runId === runId && turn.status !== "interrupted") {
      await ctx.db.patch(turn._id, { status: "interrupted" });
    }
    return null;
  },
});
