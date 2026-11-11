// @vitest-environment jsdom
import { fakeText } from "@tanstack/ai/testing";
import { defineByok, memoryStorage } from "@tanstack/ai-react/byok";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "./chat-handler";
import { ChatPane } from "./chat-pane";

// The real chat client against the real route, with a scripted fake model and a fake key.
const FAKE_KEY = "sk-ant-FAKE-PANE-KEY-0123456789";

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
const FINISH = {
  settled: [{ id: "r1q1", decision: "Families", status: "settled" }],
  summary: "You are building a picnic planner for families.",
};

type Script = Parameters<ReturnType<typeof fakeText>["setResponses"]>[0];

function stubNetwork(script: Script, options: { slow?: boolean } = {}) {
  const fake = fakeText(options.slow ? { tokensPerSecond: 20 } : {});
  fake.setResponses(script);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handleChatRequest(new Request(new URL(String(input), "http://localhost"), init), {
      createAdapter: () => fake,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fake, fetchMock };
}

async function byokWithKey(withKey: boolean) {
  const byok = defineByok({ storage: memoryStorage() });
  if (withKey) await byok.update("anthropic", FAKE_KEY);
  return byok;
}

async function sendIdea(text = "A picnic planner") {
  fireEvent.change(screen.getByLabelText("Your idea"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

beforeEach(() => {
  const noop = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal("ResizeObserver", noop);
  vi.stubGlobal("IntersectionObserver", noop);
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatPane: empty state and key", () => {
  it("offers a key prompt and example ideas that fill the composer without sending", async () => {
    const { fetchMock } = stubNetwork([]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} />);
    expect(screen.getByRole("button", { name: /add anthropic api key/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /neighbours share tools/i }));
    expect((screen.getByLabelText("Your idea") as HTMLTextAreaElement).value).toMatch(/neighbours/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the key dialog when sending without a key, and keeps the idea", async () => {
    const { fetchMock } = stubNetwork([]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} />);
    await sendIdea("My idea");
    expect(await screen.findByLabelText("API key")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Your idea") as HTMLTextAreaElement).value).toBe("My idea");
    expect(screen.queryByText("My idea", { selector: "[data-slot=bubble-content]" })).toBeNull();
  });
});

describe("ChatPane: the interview", () => {
  it("shows reasoning collapsed, the reply, then the questionnaire; answers resume the run", async () => {
    stubNetwork([
      {
        thinking: "Weighing audiences.",
        text: "Let's start.",
        toolCalls: [{ name: "ask_round", input: ROUND }],
      },
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();

    expect(await screen.findByText("Let's start.")).toBeTruthy();
    expect(screen.getByText("Thought")).toBeTruthy();
    expect(screen.queryByText("Weighing audiences.")).toBeNull();
    // The composer is replaced by the questionnaire.
    expect(screen.queryByLabelText("Your idea")).toBeNull();
    expect(await screen.findByText("Who is it for?")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText("You are building a picnic planner for families.")).toBeTruthy();
    expect(screen.getByText("Asked 1 question")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Looks right" })).toBeTruthy();
    expect(screen.queryByRole("form", { name: /questions for this round/i })).toBeNull();
  });
});

describe("ChatPane: restored messages", () => {
  it("renders initialMessages with an answered round collapsed, and no composer", async () => {
    stubNetwork([]);
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        initialMessages={[
          { id: "u1", role: "user", parts: [{ type: "text", content: "A picnic planner" }] },
          {
            id: "a1",
            role: "assistant",
            parts: [
              { type: "text", content: "Let's start." },
              {
                type: "tool-call",
                id: "c1",
                name: "ask_round",
                arguments: JSON.stringify(ROUND),
                input: ROUND,
                state: "complete",
                output: { answers: { "1": { optionId: "A", text: null } } },
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("A picnic planner")).toBeTruthy();
    expect(screen.getByText("Asked 1 question")).toBeTruthy();
    expect(screen.queryByLabelText("Your idea")).toBeNull();
  });
});

describe("ChatPane: finishing", () => {
  it("confirming the summary ends the interview without a stall warning", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
      { text: "Great, we are done." },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    await screen.findByText("Who is it for?");
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    expect(await screen.findByText("Great, we are done.")).toBeTruthy();
    expect(screen.queryByText("The interview cannot continue")).toBeNull();
    expect(screen.queryByRole("button", { name: "Looks right" })).toBeNull();
  });

  it("keeps going with a note, which starts another round", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
      {
        text: "One more thing.",
        toolCalls: [{ name: "ask_round", input: { ...ROUND, settled: FINISH.settled } }],
      },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    await screen.findByText("Who is it for?");
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    await screen.findByRole("button", { name: "Looks right" });
    const keepGoing = screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement;
    expect(keepGoing.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/something missing/i), { target: { value: "Pricing" } });
    fireEvent.click(keepGoing);
    expect(await screen.findByText("One more thing.")).toBeTruthy();
    expect(await screen.findByRole("form", { name: /questions for this round/i })).toBeTruthy();
  });
});

describe("ChatPane: failures", () => {
  it("shows a failed first turn with Try again, and recovers", async () => {
    stubNetwork([{ error: "The provider is unavailable." }, { text: "Back again." }]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    expect(await screen.findByText("The reply failed")).toBeTruthy();
    expect(screen.getByText(/provider is unavailable/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Back again.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("The reply failed")).toBeNull());
  });

  it("retries a failed round after answers without losing the earlier rounds", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { error: "Overloaded." },
      { text: "Second try worked.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    await screen.findByText("Who is it for?");
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText("The reply failed")).toBeTruthy();
    // The answered round is still in the history.
    expect(screen.getByText("Asked 1 question")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You are building a picnic planner for families.")).toBeTruthy();
    expect(screen.getByText("Asked 1 question")).toBeTruthy();
  });
});

describe("ChatPane: stop", () => {
  const LONG = "word ".repeat(200);

  it("stops a streaming first reply, then lets the user try again", async () => {
    stubNetwork([{ text: LONG }, { text: "Fresh start." }], { slow: true });
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(await screen.findByText("The reply stopped")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Fresh start.")).toBeTruthy();
  });

  it("offers no Stop after an answer, and cannot resume a reply that ends without a question", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "I forgot to ask a question." },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    await screen.findByText("Who is it for?");
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText("The interview cannot continue")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.getByText("Asked 1 question")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByLabelText("Your idea")).toBeTruthy();
    expect(screen.queryByText("Asked 1 question")).toBeNull();
  });
});

describe("ChatPane: what it offers to storage (ADR 0013)", () => {
  const answeredRound = {
    id: "a1",
    role: "assistant" as const,
    parts: [
      { type: "text" as const, content: "Let's start." },
      {
        type: "tool-call" as const,
        id: "c1",
        name: "ask_round",
        arguments: JSON.stringify(ROUND),
        input: ROUND,
        state: "complete" as const,
        output: { answers: { "1": { optionId: "A", text: null } } },
      },
    ],
  };
  const idea = {
    id: "u1",
    role: "user" as const,
    parts: [{ type: "text" as const, content: "A picnic planner" }],
  };

  it("offers only growing prefixes of messages that never change afterwards", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
      { text: "Great, we are done." },
    ]);
    const offered: Array<Array<{ id: string }>> = [];
    const snapshots: Array<string> = [];
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        onSavable={(messages) => {
          offered.push(messages.map((m) => ({ id: m.id })));
          snapshots.push(JSON.stringify(messages));
        }}
      />,
    );
    await sendIdea();
    await screen.findByText("Who is it for?");
    // The unanswered round is not offered.
    expect(offered.at(-1)).toHaveLength(1);
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await screen.findByText("Great, we are done.");

    await waitFor(() => expect(offered.at(-1)).toHaveLength(4));
    for (let i = 1; i < offered.length; i++) {
      expect(offered[i].length).toBeGreaterThan(offered[i - 1].length);
      expect(offered[i].slice(0, offered[i - 1].length)).toEqual(offered[i - 1]);
    }
    // Append-only: each offered message is already in its final form.
    const final = JSON.parse(snapshots.at(-1) ?? "[]");
    for (const snapshot of snapshots) {
      const parsed = JSON.parse(snapshot) as Array<unknown>;
      expect(parsed).toEqual(final.slice(0, parsed.length));
    }
  });

  it("does not offer an idea that was refused for lack of a key", async () => {
    stubNetwork([]);
    const onSavable = vi.fn();
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} onSavable={onSavable} />);
    await sendIdea("My idea");
    expect(await screen.findByLabelText("API key")).toBeTruthy();
    expect(onSavable).not.toHaveBeenCalled();
  });

  it("offers the idea of a first turn that failed after it was sent, but never a half reply", async () => {
    stubNetwork([{ error: "The provider is unavailable." }]);
    const onSavable = vi.fn();
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} onSavable={onSavable} />);
    await sendIdea();
    await screen.findByText("The reply failed");
    expect(onSavable).toHaveBeenCalledTimes(1);
    expect(onSavable.mock.calls[0][0].map((m: { role: string }) => m.role)).toEqual(["user"]);
  });

  it("continues a restored interview whose reply was cut off, from the stored answer", async () => {
    const { fetchMock } = stubNetwork([
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
    ]);
    const onSavable = vi.fn();
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        initialMessages={[idea, answeredRound]}
        onSavable={onSavable}
      />,
    );
    // Opening it spends nothing: the user decides.
    expect(await screen.findByText("The reply stopped")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You are building a picnic planner for families.")).toBeTruthy();
    // The stored round is kept as it was: the next request carries its answer.
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).toContain("optionId");
    expect(screen.getByText("Asked 1 question")).toBeTruthy();
    // The 2 stored messages are not offered again, and the new proposal is still unanswered.
    expect(onSavable).not.toHaveBeenCalled();
  });

  it("continues a confirmed finish whose closing reply was never stored", async () => {
    const { fetchMock } = stubNetwork([{ text: "Great, we are done." }]);
    const finishCall = {
      type: "tool-call" as const,
      id: "c2",
      name: "propose_finish",
      arguments: JSON.stringify(FINISH),
      input: FINISH,
      state: "complete" as const,
      output: { confirmed: true, text: null },
    };
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        initialMessages={[
          idea,
          answeredRound,
          { id: "a2", role: "assistant", parts: [{ type: "text", content: "Done?" }, finishCall] },
        ]}
      />,
    );
    expect(await screen.findByText("The reply stopped")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Great, we are done.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for the key before continuing a restored conversation that has none", async () => {
    const { fetchMock } = stubNetwork([]);
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(false)}
        initialMessages={[idea, answeredRound]}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("API key")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts over through the app, not by clearing a stored conversation", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "I forgot to ask a question." },
    ]);
    const onStartOver = vi.fn();
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} onStartOver={onStartOver} />);
    await sendIdea();
    await screen.findByText("Who is it for?");
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});

describe("ChatPane: leaving mid-interview", () => {
  it("sends nothing to the provider when the pane closes while a round waits for an answer", async () => {
    const { fetchMock } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    const { unmount } = render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    await screen.findByText("Who is it for?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    // Closing the pane must not resume the run with an error as the "answer": that would
    // spend the user's key on a request they never made. Absence cannot be awaited, so drain
    // many scheduler turns, enough for the abort, the rejection and a follow-up request to run.
    for (let turn = 0; turn < 50; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
