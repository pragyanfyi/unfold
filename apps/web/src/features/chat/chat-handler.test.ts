import { fakeText } from "@tanstack/ai/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleChatRequest, MAX_BODY_BYTES, MAX_MESSAGES } from "./chat-handler";

// Obviously fake. It is long and unusual enough to be found anywhere it leaks.
const SENTINEL_KEY = "sk-ant-FAKE-SENTINEL-do-not-leak-0123456789";

function body(overrides: Record<string, unknown> = {}) {
  return {
    threadId: "thread-1",
    runId: "run-1",
    messages: [{ id: "m1", role: "user", content: "An app that plans picnics" }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...overrides,
  };
}

function post(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

const withKey = { "x-byok-anthropic": SENTINEL_KEY };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("chat route: key handling", () => {
  it("answers 401 byok_missing when there is no key header", async () => {
    const res = await handleChatRequest(post(body()));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { type: "byok_missing", provider: "anthropic" },
    });
  });

  it("never falls back to a server-side environment key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-FAKE-ENV-KEY-0123456789");
    const createAdapter = vi.fn();
    const res = await handleChatRequest(post(body()), { createAdapter });
    expect(res.status).toBe(401);
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("treats a blank key as missing and rejects an oversized one", async () => {
    expect((await handleChatRequest(post(body(), { "x-byok-anthropic": "   " }))).status).toBe(401);
    const huge = await handleChatRequest(post(body(), { "x-byok-anthropic": "k".repeat(513) }));
    expect(huge.status).toBe(400);
  });

  it("hands the key only to the adapter of the chosen provider", async () => {
    const fake = fakeText();
    fake.setResponses([{ text: "ok" }]);
    const createAdapter = vi.fn(() => fake);
    const res = await handleChatRequest(post(body(), withKey), { createAdapter });
    await res.text();
    expect(createAdapter).toHaveBeenCalledWith("anthropic", SENTINEL_KEY);
  });
});

describe("chat route: validation", () => {
  it("rejects a body that is not JSON", async () => {
    expect((await handleChatRequest(post("{nope", withKey))).status).toBe(400);
  });

  it("rejects a body that is not a chat request", async () => {
    expect((await handleChatRequest(post({ hello: "world" }, withKey))).status).toBe(400);
  });

  it("rejects an unknown provider before looking at any key", async () => {
    const res = await handleChatRequest(
      post(body({ forwardedProps: { provider: "evil" } }), withKey),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { type: "unsupported_provider" } });
  });

  it("rejects an empty or oversized conversation", async () => {
    expect((await handleChatRequest(post(body({ messages: [] }), withKey))).status).toBe(400);
    const many = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => ({
      id: `m${i}`,
      role: "user",
      content: "x",
    }));
    expect((await handleChatRequest(post(body({ messages: many }), withKey))).status).toBe(400);
  });

  it("rejects a body over the size limit, even without a Content-Length", async () => {
    const big = body({
      messages: [{ id: "m1", role: "user", content: "x".repeat(MAX_BODY_BYTES) }],
    });
    expect((await handleChatRequest(post(big, withKey))).status).toBe(413);
  });

  it("stops reading a chunked body without Content-Length at the limit", async () => {
    const chunk = new TextEncoder().encode("x".repeat(100_000));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 30) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: withKey,
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await handleChatRequest(request)).status).toBe(413);
    expect(sent).toBeLessThan(30); // it stopped early instead of reading everything
  });

  it("answers a fixed 500 when the adapter cannot be built, without echoing the error", async () => {
    const createAdapter = () => {
      throw new Error(`bad config for ${SENTINEL_KEY}`);
    };
    const res = await handleChatRequest(post(body(), withKey), { createAdapter, log: () => {} });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SENTINEL_KEY);
  });

  it("does not echo the request in an error", async () => {
    const res = await handleChatRequest(post({ secretField: "SHOULD-NOT-ECHO" }, withKey));
    expect(await res.text()).not.toContain("SHOULD-NOT-ECHO");
  });
});

describe("chat route: interview protocol", () => {
  const askRoundInput = {
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

  it("streams text then one tool call, and calls the model once", async () => {
    const fake = fakeText();
    fake.setResponses([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: askRoundInput }] },
      { text: "must not be used" },
    ]);
    const res = await handleChatRequest(post(body(), withKey), { createAdapter: () => fake });
    const text = await res.text();
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("TEXT_MESSAGE_CONTENT");
    expect(text).toContain("TOOL_CALL_START");
    expect(text).toContain("ask_round");
    expect(fake.state.callCount).toBe(1);
    expect(fake.pendingResponses()).toBe(1);
  });

  it("sends the model only our tools, not tools declared by the client", async () => {
    const fake = fakeText();
    let toolNames: string[] = [];
    fake.setResponses([
      ({ request }) => {
        toolNames = (request.tools ?? []).map((tool) => tool.name);
        return { text: "ok" };
      },
    ]);
    const evil = [{ name: "steal", description: "x", parameters: { type: "object" } }];
    const res = await handleChatRequest(post(body({ tools: evil }), withKey), {
      createAdapter: () => fake,
    });
    await res.text();
    expect(toolNames.sort()).toEqual(["ask_round", "propose_finish"]);
  });
});

describe("chat route: tree outline (ADR 0012)", () => {
  // Unusual enough to be found anywhere it leaks.
  const OUTLINE_SENTINEL = "OUTLINE-SENTINEL-picnic-decision";
  const outline = [
    {
      id: "idea",
      label: "A picnic planner",
      answer: null,
      decision: null,
      parent: null,
      state: "settled",
      revisits: null,
    },
    {
      id: "r1q1",
      label: "Audience",
      answer: "A. Families",
      decision: OUTLINE_SENTINEL,
      parent: "idea",
      state: "settled",
      revisits: null,
    },
  ];

  async function systemPromptsFor(forwardedProps: Record<string, unknown>) {
    const fake = fakeText();
    let prompts: Array<unknown> = [];
    fake.setResponses([
      ({ request }) => {
        prompts = request.systemPrompts ?? [];
        return { text: "ok" };
      },
    ]);
    const res = await handleChatRequest(post(body({ forwardedProps }), withKey), {
      createAdapter: () => fake,
    });
    await res.text();
    expect(res.status).toBe(200);
    return prompts;
  }

  it("gives the model the outline as a second system prompt, after the fixed one", async () => {
    const prompts = await systemPromptsFor({ outline });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("You interview the user");
    expect(prompts[1]).toContain('"id":"r1q1"');
    expect(prompts[1]).toContain(OUTLINE_SENTINEL);
  });

  it("drops fields it does not know before they reach the model", async () => {
    const prompts = await systemPromptsFor({
      outline: [{ ...outline[0], extra: "SHOULD-NOT-PASS" }],
    });
    expect(JSON.stringify(prompts)).not.toContain("SHOULD-NOT-PASS");
  });

  it("works without an outline, for a tab still running the previous version", async () => {
    expect(await systemPromptsFor({})).toHaveLength(1);
  });

  it("rejects an outline of the wrong shape, without echoing it", async () => {
    for (const bad of [
      "SHOULD-NOT-ECHO",
      [{ id: "idea" }],
      [{ ...outline[0], state: "SHOULD-NOT-ECHO" }],
    ]) {
      const createAdapter = vi.fn();
      const res = await handleChatRequest(
        post(body({ forwardedProps: { outline: bad } }), withKey),
        {
          createAdapter,
        },
      );
      expect(res.status).toBe(400);
      expect(await res.text()).not.toContain("SHOULD-NOT-ECHO");
      expect(createAdapter).not.toHaveBeenCalled();
    }
  });

  it("never writes the outline to logs, whatever the outcome", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
    for (const responses of [[{ text: "fine" }], [{ error: "boom" }]]) {
      const fake = fakeText();
      fake.setResponses(responses);
      const res = await handleChatRequest(post(body({ forwardedProps: { outline } }), withKey), {
        createAdapter: () => fake,
      });
      await res.text();
    }
    const bad = [{ ...outline[1], state: "nope" }];
    await handleChatRequest(post(body({ forwardedProps: { outline: bad } }), withKey));
    expect(lines.length).toBeGreaterThan(0); // the capture is wired up, not silently empty
    expect(lines.join("\n")).not.toContain(OUTLINE_SENTINEL);
  });
});

describe("chat route: key-leak check (ADR 0003, item 6)", () => {
  function captureOutput() {
    const lines: string[] = [];
    const record = (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
      vi.spyOn(console, method).mockImplementation(record);
    }
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    return lines;
  }

  async function run(
    payload: unknown,
    responses: Parameters<ReturnType<typeof fakeText>["setResponses"]>[0],
  ) {
    const fake = fakeText();
    fake.setResponses(responses);
    const res = await handleChatRequest(post(payload, withKey), { createAdapter: () => fake });
    const text = await res.text();
    return { res, text };
  }

  it("never writes the key to logs, whatever the outcome", async () => {
    const lines = captureOutput();
    const results = [
      await run(body(), [{ text: "fine" }]),
      await run(body(), [{ error: `Invalid key ${SENTINEL_KEY}` }]),
      await run({ nope: true }, []),
      await run(body({ forwardedProps: { provider: "evil" } }), []),
    ];
    expect(lines.length).toBeGreaterThan(0); // the capture is wired up, not silently empty
    expect(lines.join("\n")).not.toContain(SENTINEL_KEY);
    // The key must not come back to the browser either, not even in a provider error.
    for (const { res, text } of results) {
      expect(text).not.toContain(SENTINEL_KEY);
      expect([...res.headers.values()].join("\n")).not.toContain(SENTINEL_KEY);
    }
  });

  it("masks a key before cutting a long library error message", async () => {
    const out: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      out.push(String(args[0]));
    });
    const { libraryLogger, logSafe } = await import("./safe-log");
    // The key straddles the 300th character: cutting first would leave a partial key.
    libraryLogger(logSafe, [SENTINEL_KEY]).error(`${"a".repeat(290)}${SENTINEL_KEY}`);
    const line = out.join("\n");
    expect(line).not.toContain(SENTINEL_KEY.slice(0, 20));
    expect(line).toContain("[redacted]");
  });

  it("scrubs a key quoted in a provider error", async () => {
    const { text } = await run(body(), [{ error: `Invalid key ${SENTINEL_KEY}` }]);
    expect(text).toContain("RUN_ERROR");
    expect(text).toContain("[redacted]");
  });
});

describe("chat route: the library's own error logging", () => {
  it("routes caught provider errors through the scrubbing logger, without the error object", async () => {
    const out: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        out.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
    const adapter = fakeText();
    // A provider SDK error that quotes the key, as a misbehaving provider or proxy might.
    adapter.chatStream = () => {
      throw Object.assign(new Error(`401 invalid key ${SENTINEL_KEY}`), { headers: withKey });
    };
    const res = await handleChatRequest(post(body(), withKey), { createAdapter: () => adapter });
    const text = await res.text();
    expect(text).toContain("RUN_ERROR");
    // Proof the library's logger is ours: the line is our JSON event, with the key masked.
    expect(out.some((line) => line.includes('"event":"ai.error"'))).toBe(true);
    expect(out.join("\n")).not.toContain(SENTINEL_KEY);
    expect(out.join("\n")).not.toContain("x-byok");
    expect(text).not.toContain(SENTINEL_KEY);
  });
});
