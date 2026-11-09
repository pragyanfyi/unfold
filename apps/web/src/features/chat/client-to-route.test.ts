import { fakeText } from "@tanstack/ai/testing";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-react";
import { defineByok, memoryStorage } from "@tanstack/ai-react/byok";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "./chat-handler";

const SENTINEL_KEY = "sk-ant-FAKE-CLIENT-KEY-0123456789";

// Runs the real chat client against the real route handler, with a scripted fake model.
// It checks the actual data flow of ADR 0003: key in a header, never in the body, and the
// provider adapter receives it.
function setup(responses: Parameters<ReturnType<typeof fakeText>["setResponses"]>[0]) {
  const fake = fakeText();
  fake.setResponses(responses);
  const seen: { headers: Headers; body: string }[] = [];
  const createAdapter = vi.fn(() => fake);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(new URL(String(input), "http://localhost"), init);
      seen.push({ headers: request.headers, body: await request.clone().text() });
      return handleChatRequest(request, { createAdapter });
    }),
  );
  const byok = defineByok({ storage: memoryStorage() });
  const client = new ChatClient({
    threadId: "t1",
    connection: fetchServerSentEvents("/api/chat"),
    byok,
    forwardedProps: { provider: "anthropic" },
  });
  return { fake, seen, byok, client, createAdapter };
}

afterEach(() => vi.unstubAllGlobals());

describe("chat client to chat route", () => {
  it("sends the key in x-byok-anthropic only, and the route hands it to the adapter", async () => {
    const { client, byok, seen, createAdapter, fake } = setup([{ text: "Hello" }]);
    await byok.update("anthropic", SENTINEL_KEY);
    await client.sendMessage("An idea");
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("x-byok-anthropic")).toBe(SENTINEL_KEY);
    expect(seen[0].body).not.toContain(SENTINEL_KEY);
    expect(createAdapter).toHaveBeenCalledWith("anthropic", SENTINEL_KEY);
    const reply = client.getMessages().at(-1);
    expect(reply?.role).toBe("assistant");
    expect(fake.pendingResponses()).toBe(0);
  });

  it("does not call the server at all when there is no key", async () => {
    const { client, seen } = setup([]);
    await client.sendMessage("An idea").catch(() => {});
    expect(seen).toHaveLength(0);
  });
});
