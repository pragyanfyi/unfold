import type { UIMessage } from "@tanstack/ai-react";
import { api } from "@unfold/backend/convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import { type ConversationStore, StorageError, type StorageErrorCode } from "./store";
import { type LoadedConversation, SCHEMA_VERSION } from "./types";

// The conversation store on Convex (ADR 0015, #74). The rules live in the backend's
// `ideas.ts`: ownership, append-only messages, and the `nextSeq` and `titleRev` checks.

/** The part of the Convex client this store uses, so tests can pass a fake. */
export type ConvexCalls = Pick<ConvexReactClient, "query" | "mutation">;

// Messages travel and are stored as JSON text: a `UIMessage` can hold a `Date` and keys Convex
// does not allow as field names.
export function encodeMessage(message: UIMessage): string {
  return JSON.stringify(message);
}

export function decodeMessage(json: string): UIMessage {
  const message = JSON.parse(json) as UIMessage & { createdAt?: unknown };
  if (typeof message.createdAt === "string") message.createdAt = new Date(message.createdAt);
  return message;
}

const PASSED_ON = new Set<StorageErrorCode>(["conflict", "missing", "exists", "too-new"]);

// Only the code crosses into the UI. Anything else the server said (signed out, refused input,
// damaged data) or a failure of the call itself is `unavailable`.
function translate(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | null)?.code;
    if (typeof code === "string" && PASSED_ON.has(code as StorageErrorCode)) {
      return new StorageError(code as StorageErrorCode, { cause: error });
    }
  }
  return new StorageError("unavailable", { cause: error });
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw translate(error);
  }
}

export function createConvexStore(client: ConvexCalls): ConversationStore {
  return {
    head: (id) => run(() => client.query(api.ideas.get, { id })),

    turn: (id) => run(() => client.query(api.turns.get, { id })),

    answer: (id, { runId, expectedNextSeq, message }) =>
      run(() =>
        client.mutation(api.turns.answer, {
          id,
          runId,
          expectedNextSeq,
          schemaVersion: SCHEMA_VERSION,
          message: encodeMessage(message),
        }),
      ),

    stop: (id, runId, expectedNextSeq) =>
      run(async () => {
        await client.mutation(api.turns.stop, { id, runId, expectedNextSeq });
      }),

    load: (id) =>
      run(async (): Promise<LoadedConversation | null> => {
        const loaded = await client.query(api.ideas.load, { id });
        if (!loaded) return null;
        if (loaded.record.schemaVersion > SCHEMA_VERSION) throw new StorageError("too-new");
        return { record: loaded.record, messages: loaded.messages.map(decodeMessage) };
      }),

    create: ({ id, title, messages }) =>
      run(() =>
        client.mutation(api.ideas.create, {
          id,
          title,
          schemaVersion: SCHEMA_VERSION,
          messages: messages.map(encodeMessage),
        }),
      ),

    append: (id, expectedNextSeq, messages) =>
      run(() =>
        client.mutation(api.ideas.append, {
          id,
          expectedNextSeq,
          schemaVersion: SCHEMA_VERSION,
          messages: messages.map(encodeMessage),
        }),
      ),

    rename: (id, title, expectedTitleRev) =>
      run(() =>
        client.mutation(api.ideas.rename, {
          id,
          title,
          expectedTitleRev,
          schemaVersion: SCHEMA_VERSION,
        }),
      ),

    remove: (id) =>
      run(async () => {
        await client.mutation(api.ideas.remove, { id });
      }),
  };
}
