import { fakeText } from "@tanstack/ai/testing";
import { describe, expect, it, vi } from "vitest";
import { handleChatRequest, type StartTurn, type TurnRun } from "../convex/chat/handler";

// The handler records each run in the idea's turn document (ADR 0015). These tests give it a fake
// turn and check what it writes, and what it never writes.

const SENTINEL_KEY = "sk-ant-FAKE-TURN-SENTINEL-0123456789";

function post(
  forwardedProps: Record<string, unknown> = {
    ideaId: "idea-1",
    expectedNextSeq: 1,
    expectedLastMessageId: "m1",
  },
) {
  return new Request("http://localhost/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-byok-anthropic": SENTINEL_KEY },
    body: JSON.stringify({
      threadId: "t",
      runId: "r",
      messages: [{ id: "m1", role: "user", content: "An app that plans picnics" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps,
    }),
  });
}

function fakeTurn(overrides: Partial<TurnRun> = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    <T>(method: string, result: T) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };
  const run: TurnRun = {
    write: record("write", true),
    end: record("end", true),
    interrupt: async () => {
      calls.push({ method: "interrupt", args: [] });
    },
    ...overrides,
  };
  const startTurn = vi.fn<StartTurn>(async () => run);
  return { calls, startTurn };
}

const round = {
  settled: [],
  questions: [
    {
      title: "Who is it for?",
      body: "",
      label: "Audience",
      options: [{ label: "Families" }, { label: "Friends" }],
      parentId: "idea",
    },
  ],
};

async function drain(response: Response) {
  return response.text();
}

describe("chat turns", () => {
  it("ends a closing reply as final, and a round as waiting for an answer", async () => {
    const closing = fakeTurn();
    const reply = fakeText();
    reply.setResponses([{ text: "All done." }]);
    await drain(
      await handleChatRequest(post(), { createAdapter: () => reply, startTurn: closing.startTurn }),
    );
    const end = closing.calls.find((c) => c.method === "end");
    expect(end?.args[1]).toBe(false);
    expect(JSON.parse(end?.args[0] as string).role).toBe("assistant");
    expect(closing.calls.some((c) => c.method === "interrupt")).toBe(false);

    const asking = fakeTurn();
    const ask = fakeText();
    ask.setResponses([{ text: "Let's go.", toolCalls: [{ name: "ask_round", input: round }] }]);
    await drain(
      await handleChatRequest(post(), { createAdapter: () => ask, startTurn: asking.startTurn }),
    );
    expect(asking.calls.find((c) => c.method === "end")?.args[1]).toBe(true);
  });

  it("starts the run for the idea the request names, before calling the model", async () => {
    const { startTurn } = fakeTurn();
    const createAdapter = vi.fn(() => fakeText());
    await handleChatRequest(post({}), { createAdapter, startTurn });
    expect(startTurn).not.toHaveBeenCalled(); // no idea in the request
    await handleChatRequest(post({ ideaId: "idea-1" }), { createAdapter, startTurn });
    expect(startTurn).not.toHaveBeenCalled(); // no stored count
    await handleChatRequest(post(), { createAdapter: () => fakeText(), startTurn });
    expect(startTurn.mock.calls[0][0]).toBe("idea-1");
    expect(startTurn.mock.calls[0][2]).toEqual({ nextSeq: 1, lastMessageId: "m1" });
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("accepts any stored message id as the last one, however long", async () => {
    const { startTurn } = fakeTurn();
    const long = "m".repeat(500);
    const adapter = fakeText();
    adapter.setResponses([{ text: "Tell me more." }]);
    const response = await handleChatRequest(
      post({ ideaId: "idea-1", expectedNextSeq: 1, expectedLastMessageId: long }),
      { createAdapter: () => adapter, startTurn },
    );
    await drain(response);
    expect(startTurn.mock.calls[0][2]).toEqual({ nextSeq: 1, lastMessageId: long });
    expect(adapter.pendingResponses()).toBe(0);
  });

  it("answers 404 for an idea that is not the caller's, and 409 while busy or out of step", async () => {
    const createAdapter = vi.fn(() => fakeText());
    const missing = await handleChatRequest(post(), {
      createAdapter,
      startTurn: async () => "missing",
    });
    expect(missing.status).toBe(404);
    const busy = await handleChatRequest(post(), { createAdapter, startTurn: async () => "busy" });
    expect(busy.status).toBe(409);
    const stale = await handleChatRequest(post(), {
      createAdapter,
      startTurn: async () => "conflict",
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { type: "history_conflict" } });
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("interrupts, and never ends, a run whose model fails", async () => {
    const { calls, startTurn } = fakeTurn();
    const adapter = fakeText();
    adapter.setResponses([{ error: "boom" }]);
    await drain(await handleChatRequest(post(), { createAdapter: () => adapter, startTurn }));
    expect(calls.map((c) => c.method)).toContain("interrupt");
    expect(calls.map((c) => c.method)).not.toContain("end");
  });

  it("interrupts, and never ends, a run whose model goes silent", async () => {
    const { calls, startTurn } = fakeTurn();
    const adapter = fakeText();
    adapter.chatStream = async function* () {
      await new Promise<never>(() => {});
    };
    const response = await handleChatRequest(post(), {
      createAdapter: () => adapter,
      startTurn,
      idleTimeoutMs: 50,
    });
    expect(await drain(response)).toContain("RUN_ERROR");
    expect(calls.map((c) => c.method)).toContain("interrupt");
    expect(calls.map((c) => c.method)).not.toContain("end");
  });

  it("interrupts a silent run even after the browser has left", async () => {
    const { calls, startTurn } = fakeTurn();
    const adapter = fakeText();
    adapter.setResponses([{ text: "Starting, then nothing." }]);
    const original = adapter.chatStream.bind(adapter);
    adapter.chatStream = async function* (options) {
      for await (const chunk of original(options)) yield chunk;
      await new Promise<never>(() => {});
    };
    const response = await handleChatRequest(post(), {
      createAdapter: () => adapter,
      startTurn,
      idleTimeoutMs: 50,
    });
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await vi.waitFor(() => expect(calls.some((c) => c.method === "interrupt")).toBe(true));
    expect(calls.map((c) => c.method)).not.toContain("end");
  });

  it("interrupts a run whose turn was taken or stopped, and stops asking the model", async () => {
    const { calls, startTurn } = fakeTurn({ write: async () => false });
    const adapter = fakeText();
    adapter.setResponses([{ text: "x".repeat(2000) }]);
    // Every look at the clock is 2 s later, so each chunk is due a write.
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => (now += 2_000));
    await drain(await handleChatRequest(post(), { createAdapter: () => adapter, startTurn }));
    vi.restoreAllMocks();
    expect(calls.map((c) => c.method)).not.toContain("end");
    expect(calls.map((c) => c.method)).toContain("interrupt");
  });

  it("interrupts when the idea cannot hold the final message", async () => {
    const { calls, startTurn } = fakeTurn({ end: async () => false });
    const adapter = fakeText();
    adapter.setResponses([{ text: "done" }]);
    await drain(await handleChatRequest(post(), { createAdapter: () => adapter, startTurn }));
    expect(calls.map((c) => c.method)).toContain("interrupt");
  });

  it("carries on recording when the browser stops reading", async () => {
    const { calls, startTurn } = fakeTurn();
    const adapter = fakeText();
    adapter.setResponses([{ text: "A reply that outlives its reader." }]);
    const response = await handleChatRequest(post(), { createAdapter: () => adapter, startTurn });
    // The browser reads one chunk and leaves. The run is not tied to the request's abort signal.
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await vi.waitFor(() => expect(calls.some((c) => c.method === "end")).toBe(true));
    expect(JSON.parse(calls.find((c) => c.method === "end")?.args[0] as string).parts).toHaveLength(
      1,
    );
    expect(calls.some((c) => c.method === "interrupt")).toBe(false);
  });

  it("never passes the key to a turn function, and writes no key-shaped text", async () => {
    const { calls, startTurn } = fakeTurn();
    const adapter = fakeText();
    adapter.setResponses([{ text: "Hello", toolCalls: [{ name: "ask_round", input: round }] }]);
    await drain(await handleChatRequest(post(), { createAdapter: () => adapter, startTurn }));
    expect(startTurn.mock.calls.flat().join(" ")).not.toContain(SENTINEL_KEY);
    expect(JSON.stringify(calls)).not.toContain(SENTINEL_KEY);
  });

  it("masks the key in the reply before it is written, even when the model echoes it", async () => {
    const { calls, startTurn } = fakeTurn();
    const adapter = fakeText();
    adapter.setResponses([{ text: `Your key is ${SENTINEL_KEY}, keep it safe.` }]);
    await drain(await handleChatRequest(post(), { createAdapter: () => adapter, startTurn }));
    expect(adapter.pendingResponses()).toBe(0);
    const end = calls.find((c) => c.method === "end");
    expect(end?.args[0]).toContain("[redacted]");
    expect(JSON.stringify(calls)).not.toContain(SENTINEL_KEY);
  });
});
