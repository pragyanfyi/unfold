import { fakeText } from "@tanstack/ai/testing";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-react";
import { defineByok, memoryStorage } from "@tanstack/ai-react/byok";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "./chat-handler";
import { askRound } from "./tools";

// Spike for #27 (kept as a regression test): the real chat client against the real route,
// with a scripted fake model and no real provider. It pins what the chat UI relies on:
// answers sent as the `ask_round` tool result, and the shape of reasoning and failed turns.

const FAKE_KEY = "sk-ant-FAKE-SPIKE-KEY-0123456789";

const ROUND = {
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

type Script = Parameters<ReturnType<typeof fakeText>["setResponses"]>[0];

async function setup(responses: Script) {
  const fake = fakeText();
  fake.setResponses(responses);
  const bodies: Array<{ messages: Array<Record<string, unknown>> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(new URL(String(input), "http://localhost"), init);
      bodies.push(JSON.parse(await request.clone().text()));
      return handleChatRequest(request, { createAdapter: () => fake });
    }),
  );
  const byok = defineByok({ storage: memoryStorage() });
  await byok.update("anthropic", FAKE_KEY);
  const client = new ChatClient({
    threadId: "t1",
    connection: fetchServerSentEvents("/api/chat"),
    byok,
    forwardedProps: { provider: "anthropic" },
  });
  return { fake, bodies, client };
}

afterEach(() => vi.unstubAllGlobals());

describe("answering a round (spike for #27)", () => {
  async function askedRound() {
    const ctx = await setup([
      { text: "First round.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "Second round." },
    ]);
    await ctx.client.sendMessage("An idea");
    const call = ctx.client
      .getMessages()
      .at(-1)
      ?.parts.find((part) => part.type === "tool-call");
    if (call?.type !== "tool-call") throw new Error("no tool call");
    return { ...ctx, call };
  }

  it("ends an unanswered handler-less ask_round in input-complete, with parsed input", async () => {
    const { call } = await askedRound();
    expect(call.state).toBe("input-complete");
    expect(call.input).toEqual(ROUND);
  });

  it("without a client-side ask_round, the run stays blocked on an unresolvable interrupt", async () => {
    const { client, call, bodies, fake } = await askedRound();
    await expect(client.sendMessage("my answers")).rejects.toThrow(/pending interrupts/);
    // addToolResult records locally but cannot continue the run.
    await client.addToolResult({ toolCallId: call.id, tool: "ask_round", output: {} });
    expect(bodies).toHaveLength(1);
    expect(fake.pendingResponses()).toBe(1);
  });

  it("with a client-side ask_round, resolving it resumes the run with a real tool result", async () => {
    const fake = fakeText();
    fake.setResponses([
      { text: "First round.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "Second round." },
    ]);
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(new URL(String(input), "http://localhost"), init);
        bodies.push(JSON.parse(await request.clone().text()));
        return handleChatRequest(request, { createAdapter: () => fake });
      }),
    );
    const byok = defineByok({ storage: memoryStorage() });
    await byok.update("anthropic", FAKE_KEY);
    // The client declares the same tool WITH an `execute` that waits for the user. The
    // chat UI resolves this promise with the submitted answers.
    let answer: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      answer = resolve;
    });
    const client = new ChatClient({
      threadId: "t1",
      connection: fetchServerSentEvents("/api/chat"),
      byok,
      forwardedProps: { provider: "anthropic" },
      tools: [askRound.client(() => pending)],
    });
    const turn = client.sendMessage("An idea");
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    await vi.waitFor(() => {
      const part = client
        .getMessages()
        .at(-1)
        ?.parts.find((p) => p.type === "tool-call");
      expect(part?.type === "tool-call" && part.state).toBe("input-complete");
    });
    answer({ answers: { "1": { optionId: "0", text: null } } });
    await turn;

    expect(fake.pendingResponses()).toBe(0);
    expect(bodies).toHaveLength(2);
    const sent = JSON.stringify(bodies[1]);
    expect(sent).not.toContain("No result provided");
    expect(sent).toContain('\\"optionId\\":\\"0\\"');
    expect(
      client
        .getMessages()
        .at(-1)
        ?.parts.map((p) => p.type),
    ).toEqual(["text"]);
  });
});

describe("reasoning and failed turns", () => {
  it("shows reasoning as a thinking part before the text", async () => {
    const { client } = await setup([{ thinking: "Weighing audiences.", text: "Hi." }]);
    await client.sendMessage("An idea");
    const types = client
      .getMessages()
      .at(-1)
      ?.parts.map((part) => part.type);
    expect(types).toEqual(["thinking", "text"]);
  });

  it("reports a failed turn through error and status, and reload retries it", async () => {
    const { client, fake } = await setup([{ error: { message: "boom" } }, { text: "Recovered." }]);
    await client.sendMessage("An idea");
    expect(client.getStatus()).toBe("error");
    expect(client.getError()).toBeInstanceOf(Error);
    await client.reload();
    expect(client.getStatus()).toBe("ready");
    expect(client.getMessages().filter((m) => m.role === "user")).toHaveLength(1);
    expect(fake.pendingResponses()).toBe(0);
  });
});
