import type { UIMessage } from "@tanstack/ai-react";
import { api } from "@unfold/backend/convex/_generated/api";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { type ConvexCalls, createConvexStore, decodeMessage, encodeMessage } from "./convex-store";
import { StorageError } from "./store";
import { SCHEMA_VERSION } from "./types";

const ID = "01890a5d-ac96-774b-bcce-b302099a8057";

const record = {
  id: ID,
  title: "An idea",
  schemaVersion: SCHEMA_VERSION,
  nextSeq: 1,
  createdAt: 1,
  titleRev: 0,
  updatedAt: 1,
};

const message: UIMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", content: "An idea" }],
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
};

function fake() {
  const query = vi.fn();
  const mutation = vi.fn();
  return { query, mutation, client: { query, mutation } as unknown as ConvexCalls };
}

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StorageError);
  return (error as StorageError).code;
}

describe("message encoding", () => {
  it("round-trips a message, including its date", () => {
    const back = decodeMessage(encodeMessage(message));
    expect(back).toEqual(message);
    expect(back.createdAt).toBeInstanceOf(Date);
  });
});

describe("createConvexStore", () => {
  it("sends messages as JSON text with this code's schema version", async () => {
    const { mutation, client } = fake();
    mutation.mockResolvedValue(record);
    await createConvexStore(client).append(ID, 1, [message]);
    expect(mutation).toHaveBeenCalledWith(api.ideas.append, {
      id: ID,
      expectedNextSeq: 1,
      schemaVersion: SCHEMA_VERSION,
      messages: [encodeMessage(message)],
    });
  });

  it("decodes loaded messages, and returns null for no idea", async () => {
    const { query, client } = fake();
    const store = createConvexStore(client);
    query.mockResolvedValueOnce({ record, messages: [encodeMessage(message)] });
    expect(await store.load(ID)).toEqual({ record, messages: [message] });
    query.mockResolvedValueOnce(null);
    expect(await store.load(ID)).toBeNull();
  });

  it("refuses to load an idea stored by newer code", async () => {
    const { query, client } = fake();
    query.mockResolvedValue({
      record: { ...record, schemaVersion: SCHEMA_VERSION + 1 },
      messages: [],
    });
    expect(await codeOf(createConvexStore(client).load(ID))).toBe("too-new");
  });

  it("passes on the codes the UI words, and turns anything else into unavailable", async () => {
    const { mutation, client } = fake();
    const store = createConvexStore(client);
    for (const code of ["conflict", "missing", "exists", "too-new"]) {
      mutation.mockRejectedValueOnce(new ConvexError({ code }));
      expect(await codeOf(store.rename(ID, "x", 0))).toBe(code);
    }
    for (const error of [
      new ConvexError({ code: "signed-out" }),
      new ConvexError({ code: "invalid" }),
      new ConvexError("no code"),
      new Error("Server Error"),
    ]) {
      mutation.mockRejectedValueOnce(error);
      expect(await codeOf(store.remove(ID))).toBe("unavailable");
    }
  });
});
