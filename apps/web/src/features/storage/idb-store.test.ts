import "fake-indexeddb/auto";
import type { UIMessage } from "@tanstack/ai-react";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { createIdbStore } from "./idb-store";
import { type ConversationStore, StorageError } from "./store";
import { SCHEMA_VERSION } from "./types";

const message = (id: string, role: "user" | "assistant" = "user"): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", content: `text of ${id}` }],
});

let n = 0;
let name = "";
let store: ConversationStore;
beforeEach(() => {
  name = `unfold-test-${n++}`;
  store = createIdbStore({ name });
});

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StorageError) return error.code;
    throw error;
  }
  return null;
}

describe("create and load", () => {
  it("writes the messages at seq 0.. with the record, and reads them back in order", async () => {
    const record = await store.create({
      id: "c1",
      title: "Idea",
      messages: [message("m1"), message("m2", "assistant")],
    });
    expect(record).toMatchObject({ nextSeq: 2, titleRev: 0, schemaVersion: SCHEMA_VERSION });
    const loaded = await store.load("c1");
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(loaded?.record.title).toBe("Idea");
  });

  it("returns null for an unknown conversation", async () => {
    expect(await store.load("nope")).toBeNull();
  });

  it("refuses to create over an existing id and leaves it untouched", async () => {
    await store.create({ id: "c1", title: "First", messages: [message("m1")] });
    expect(await code(store.create({ id: "c1", title: "Other", messages: [message("x")] }))).toBe(
      "exists",
    );
    const loaded = await store.load("c1");
    expect(loaded?.record.title).toBe("First");
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("stores only the documented fields: no place for a key to ride along", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    const db = await openDB(name);
    const conversation = await db.get("conversations", "c1");
    const row = await db.get("messages", ["c1", 0]);
    expect(Object.keys(conversation).sort()).toEqual(
      ["createdAt", "id", "nextSeq", "schemaVersion", "title", "titleRev", "updatedAt"].sort(),
    );
    expect(Object.keys(row).sort()).toEqual(
      ["conversationId", "createdAt", "id", "message", "seq"].sort(),
    );
    expect([...db.objectStoreNames].sort()).toEqual(["conversations", "messages"]);
    db.close();
  });
});

describe("append", () => {
  it("appends after nextSeq and bumps the record", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    const next = await store.append("c1", 1, [message("m2", "assistant"), message("m3")]);
    expect(next.nextSeq).toBe(3);
    expect((await store.load("c1"))?.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("fails with conflict when another tab appended first, and writes nothing", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    await store.append("c1", 1, [message("from-tab-a")]);
    expect(await code(store.append("c1", 1, [message("from-tab-b")]))).toBe("conflict");
    expect((await store.load("c1"))?.messages.map((m) => m.id)).toEqual(["m1", "from-tab-a"]);
  });

  it("is all or nothing: a batch with a duplicate position writes none of it", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    // Force a failure part-way through: seq 1 already exists, so the first add fails.
    const db = await openDB(name);
    await db.put("messages", {
      conversationId: "c1",
      seq: 2,
      id: "planted",
      createdAt: "x",
      message: message("planted"),
    });
    db.close();
    expect(await code(store.append("c1", 1, [message("a"), message("b")]))).not.toBeNull();
    const db2 = await openDB(name);
    expect(await db2.count("messages")).toBe(2); // m1 and the planted row, not "a"
    expect((await db2.get("conversations", "c1")).nextSeq).toBe(1);
    db2.close();
  });

  it("never recreates a conversation that is gone", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    await store.remove("c1");
    expect(await code(store.append("c1", 1, [message("m2")]))).toBe("missing");
    expect(await store.load("c1")).toBeNull();
  });
});

describe("rename", () => {
  it("changes the title, bumps titleRev and keeps the messages", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    const next = await store.rename("c1", "Better", 0);
    expect(next).toMatchObject({ title: "Better", titleRev: 1, nextSeq: 1 });
  });

  it("fails with conflict on a stale titleRev, and does not conflict with appends", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    await store.append("c1", 1, [message("m2")]);
    await store.rename("c1", "From tab A", 0);
    expect(await code(store.rename("c1", "From tab B", 0))).toBe("conflict");
    expect((await store.load("c1"))?.record.title).toBe("From tab A");
  });

  it("fails with missing for a deleted conversation", async () => {
    expect(await code(store.rename("gone", "x", 0))).toBe("missing");
  });
});

describe("list and remove", () => {
  it("lists the most recently updated first", async () => {
    await store.create({ id: "a", title: "A", messages: [message("a1")] });
    await new Promise((r) => setTimeout(r, 5));
    await store.create({ id: "b", title: "B", messages: [message("b1")] });
    await new Promise((r) => setTimeout(r, 5));
    await store.append("a", 1, [message("a2")]);
    expect((await store.list()).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("removes the record and every message, and only that conversation's", async () => {
    await store.create({ id: "a", title: "A", messages: [message("a1"), message("a2")] });
    await store.create({ id: "b", title: "B", messages: [message("b1")] });
    await store.remove("a");
    expect(await store.load("a")).toBeNull();
    const db = await openDB(name);
    expect((await db.getAll("messages")).map((m) => m.conversationId)).toEqual(["b"]);
    db.close();
    await expect(store.remove("a")).resolves.toBeUndefined();
  });
});

describe("data this code does not understand", () => {
  it("refuses to read, append to or rename a conversation saved by newer code", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1")] });
    const db = await openDB(name);
    const record = await db.get("conversations", "c1");
    await db.put("conversations", { ...record, schemaVersion: SCHEMA_VERSION + 1 });
    db.close();
    expect(await code(store.load("c1"))).toBe("too-new");
    expect(await code(store.append("c1", 1, [message("m2")]))).toBe("too-new");
    expect(await code(store.rename("c1", "x", 0))).toBe("too-new");
    expect(await store.list()).toEqual([]);
    const db2 = await openDB(name);
    expect(await db2.count("messages")).toBe(1);
    db2.close();
  });

  it("refuses to load a conversation whose messages do not match its count", async () => {
    await store.create({ id: "c1", title: "Idea", messages: [message("m1"), message("m2")] });
    const db = await openDB(name);
    await db.delete("messages", ["c1", 0]);
    db.close();
    expect(await code(store.load("c1"))).toBe("unavailable");
  });
});
