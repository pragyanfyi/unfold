import type { UIMessage } from "@tanstack/ai-react";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { type ConversationStore, StorageError } from "./store";
import {
  type ConversationRecord,
  type LoadedConversation,
  type MessageRecord,
  SCHEMA_VERSION,
} from "./types";

interface UnfoldDB extends DBSchema {
  conversations: {
    key: string;
    value: ConversationRecord;
    indexes: { updatedAt: string };
  };
  messages: {
    key: [string, number];
    value: MessageRecord;
  };
}

export const DB_NAME = "unfold";
const DB_VERSION = 1;

type Db = IDBPDatabase<UnfoldDB>;

// Another tab runs newer code and wants to upgrade the database. We close our connection so
// it can, and tell the page to ask for a reload.
export type IdbStoreOptions = { onVersionChange?: () => void; name?: string };

function translate(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new StorageError("quota", { cause: error });
  }
  return new StorageError("unavailable", { cause: error });
}

// An aborted transaction rejects `tx.done`. We report the failure ourselves, so mark that
// rejection as handled; code that awaits `tx.done` still sees it.
function handled<T extends { done: Promise<void> }>(tx: T): T {
  tx.done.catch(() => {});
  return tx;
}

function abortQuietly(tx: { abort(): void }) {
  try {
    tx.abort();
  } catch {
    // Already finished or aborted.
  }
}

const now = () => new Date().toISOString();

// ADR 0013. Each write is one `readwrite` transaction over both stores. Never `await`
// anything but IndexedDB requests inside one, or the transaction closes under you.
export function createIdbStore(options: IdbStoreOptions = {}): ConversationStore {
  let opening: Promise<Db> | null = null;

  function open(): Promise<Db> {
    opening ??= openDB<UnfoldDB>(options.name ?? DB_NAME, DB_VERSION, {
      upgrade(db) {
        const conversations = db.createObjectStore("conversations", { keyPath: "id" });
        conversations.createIndex("updatedAt", "updatedAt");
        db.createObjectStore("messages", { keyPath: ["conversationId", "seq"] });
      },
      blocking() {
        opening?.then((db) => db.close()).catch(() => {});
        opening = null;
        options.onVersionChange?.();
      },
      terminated() {
        opening = null;
      },
    }).catch((error: unknown) => {
      opening = null;
      throw translate(error);
    });
    return opening;
  }

  async function run<T>(work: (db: Db) => Promise<T>): Promise<T> {
    const db = await open();
    try {
      return await work(db);
    } catch (error) {
      throw translate(error);
    }
  }

  function assertUnderstood(record: ConversationRecord) {
    if (record.schemaVersion > SCHEMA_VERSION) throw new StorageError("too-new");
  }

  function messageRecords(
    id: string,
    from: number,
    messages: ReadonlyArray<UIMessage>,
    at: string,
  ) {
    return messages.map(
      (message, index): MessageRecord => ({
        conversationId: id,
        seq: from + index,
        id: message.id,
        createdAt: at,
        message,
      }),
    );
  }

  return {
    list: () =>
      run(async (db) => {
        const all = await db.getAllFromIndex("conversations", "updatedAt");
        return all.filter((record) => record.schemaVersion <= SCHEMA_VERSION).reverse();
      }),

    load: (id) =>
      run(async (db): Promise<LoadedConversation | null> => {
        const tx = handled(db.transaction(["conversations", "messages"], "readonly"));
        const record = await tx.objectStore("conversations").get(id);
        if (!record) return null;
        assertUnderstood(record);
        const rows = await tx
          .objectStore("messages")
          .getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
        await tx.done;
        // The count must match `nextSeq`. Anything else is damage we must not build on.
        if (rows.length !== record.nextSeq) throw new StorageError("unavailable");
        return { record, messages: rows.map((row) => row.message) };
      }),

    create: ({ id, title, messages }) =>
      run(async (db) => {
        const at = now();
        const record: ConversationRecord = {
          id,
          title,
          schemaVersion: SCHEMA_VERSION,
          nextSeq: messages.length,
          createdAt: at,
          titleRev: 0,
          updatedAt: at,
        };
        const tx = handled(db.transaction(["conversations", "messages"], "readwrite"));
        try {
          await tx.objectStore("conversations").add(record);
        } catch (error) {
          // A failed request has already aborted the transaction.
          if (error instanceof DOMException && error.name === "ConstraintError") {
            throw new StorageError("exists", { cause: error });
          }
          throw error;
        }
        const store = tx.objectStore("messages");
        for (const row of messageRecords(id, 0, messages, at)) await store.add(row);
        await tx.done;
        return record;
      }),

    append: (id, expectedNextSeq, messages) =>
      run(async (db) => {
        const tx = handled(db.transaction(["conversations", "messages"], "readwrite"));
        const conversations = tx.objectStore("conversations");
        const record = await conversations.get(id);
        if (!record) {
          abortQuietly(tx);
          throw new StorageError("missing");
        }
        if (record.schemaVersion > SCHEMA_VERSION) {
          abortQuietly(tx);
          throw new StorageError("too-new");
        }
        if (record.nextSeq !== expectedNextSeq) {
          abortQuietly(tx);
          throw new StorageError("conflict");
        }
        const at = now();
        const store = tx.objectStore("messages");
        for (const row of messageRecords(id, record.nextSeq, messages, at)) await store.add(row);
        const next = { ...record, nextSeq: record.nextSeq + messages.length, updatedAt: at };
        await conversations.put(next);
        await tx.done;
        return next;
      }),

    rename: (id, title, expectedTitleRev) =>
      run(async (db) => {
        const tx = handled(db.transaction("conversations", "readwrite"));
        const record = await tx.objectStore("conversations").get(id);
        if (!record) {
          abortQuietly(tx);
          throw new StorageError("missing");
        }
        if (record.schemaVersion > SCHEMA_VERSION) {
          abortQuietly(tx);
          throw new StorageError("too-new");
        }
        if (record.titleRev !== expectedTitleRev) {
          abortQuietly(tx);
          throw new StorageError("conflict");
        }
        const next = { ...record, title, titleRev: record.titleRev + 1, updatedAt: now() };
        await tx.objectStore("conversations").put(next);
        await tx.done;
        return next;
      }),

    remove: (id) =>
      run(async (db) => {
        const tx = handled(db.transaction(["conversations", "messages"], "readwrite"));
        await tx.objectStore("conversations").delete(id);
        await tx
          .objectStore("messages")
          .delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
        await tx.done;
      }),
  };
}
