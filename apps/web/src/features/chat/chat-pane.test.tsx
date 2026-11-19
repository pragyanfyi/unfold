// @vitest-environment jsdom
import { fakeText } from "@tanstack/ai/testing";
import type { UIMessage } from "@tanstack/ai-react";
import { defineByok, memoryStorage } from "@tanstack/ai-react/byok";
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { handleChatRequest } from "@unfold/backend/convex/chat/handler";
import type { Tree } from "@unfold/interview/derive-tree";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSessionProvider, fakeSession } from "#/features/auth/fake-session";
import type { Session } from "#/features/auth/session";
import { ChatPane } from "./chat-pane";

// Signed in, as the chat is used once onboarding is done (ADR 0016). The gate itself is tested
// in onboarding.test.tsx.
function SignedIn({ children }: { children: ReactNode }) {
  return <FakeSessionProvider>{children}</FakeSessionProvider>;
}
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: SignedIn });
}

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
  // A refused send keeps its idea for the Google redirect; no test may inherit it.
  sessionStorage.clear();
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

  it("opens onboarding at the key step when sending without a key, and keeps the idea", async () => {
    const { fetchMock } = stubNetwork([]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} />);
    await sendIdea("My idea");
    const dialog = await screen.findByRole("dialog", { name: "Before your first interview" });
    expect(
      within(dialog).getByText("Add your key").closest("li")?.getAttribute("aria-current"),
    ).toBe("step");
    expect(within(dialog).getByLabelText("API key")).toBeTruthy();
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

describe("ChatPane: the tree it hands out (ADR 0012)", () => {
  it("reports the tree when its content changes, not on every streamed token", async () => {
    const onTree = vi.fn();
    // The fake model streams text four characters at a time, so this is 75 updates.
    const long = "word ".repeat(60);
    const { fake } = stubNetwork([
      { text: long, toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} onTree={onTree} />);
    await sendIdea();
    await screen.findByText("Who is it for?");

    const ids = (call: Array<{ nodes: Array<{ id: string }> }>) =>
      call[0].nodes.map((node) => node.id).join(",");
    // Empty, then the idea, then the round: the streamed words changed nothing.
    expect(onTree.mock.calls.map(ids)).toEqual(["", "idea", "idea,r1q1"]);
    expect(fake.pendingResponses()).toBe(0);
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
    expect(screen.queryByText("The reply broke the interview rules")).toBeNull();
    expect(screen.queryByRole("button", { name: "Looks right" })).toBeNull();
  });

  it("keeps going with a note, which starts another round", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
      {
        text: "One more thing.",
        // The proposal already settled r1q1, so this round has nothing left to settle.
        toolCalls: [{ name: "ask_round", input: ROUND }],
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

    expect(await screen.findByText("The reply broke the interview rules")).toBeTruthy();
    expect(screen.getByText(/replied without asking a question/)).toBeTruthy();
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

  it("stores what the browser knows before each request: the idea, then the answered round", async () => {
    stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
      { text: "Great, we are done." },
    ]);
    const offered: Array<Array<{ id: string; role: string; answered: boolean }>> = [];
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        beforeRun={async (messages) => {
          offered.push(
            messages.map((m) => ({
              id: m.id,
              role: m.role,
              answered: m.parts.some((p) => p.type === "tool-call" && p.output !== undefined),
            })),
          );
        }}
      />,
    );
    await sendIdea();
    await screen.findByText("Who is it for?");
    // The first request carries only the idea.
    expect(offered).toHaveLength(1);
    expect(offered[0].map((m) => m.role)).toEqual(["user"]);
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await screen.findByText("Great, we are done.");

    // Each resume carries the answered round, which storage must hold before the next run.
    expect(offered).toHaveLength(3);
    expect(offered[1].map((m) => [m.role, m.answered])).toEqual([
      ["user", false],
      ["assistant", true],
    ]);
    expect(offered[2]).toHaveLength(3);
  });

  it("does not store an idea that was refused for lack of a key", async () => {
    stubNetwork([]);
    const beforeRun = vi.fn(async () => {});
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} beforeRun={beforeRun} />);
    await sendIdea("My idea");
    expect(await screen.findByLabelText("API key")).toBeTruthy();
    expect(beforeRun).not.toHaveBeenCalled();
  });

  it("sends nothing when storage fails, and says the reply failed", async () => {
    const { fetchMock } = stubNetwork([{ text: "must not be asked" }]);
    const beforeRun = vi.fn(async () => {
      throw new Error("not stored");
    });
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} beforeRun={beforeRun} />);
    await sendIdea();
    await screen.findByText("The reply failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells storage when the user stops a run", async () => {
    stubNetwork([{ text: "A long reply that is slow to arrive. ".repeat(10) }], { slow: true });
    const onStop = vi.fn();
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} onStop={onStop} />);
    await sendIdea();
    fireEvent.click(await screen.findByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("continues a restored interview whose reply was cut off, from the stored answer", async () => {
    const { fetchMock } = stubNetwork([
      { text: "That settles it.", toolCalls: [{ name: "propose_finish", input: FINISH }] },
    ]);
    const beforeRun = vi.fn(async (_messages: ReadonlyArray<UIMessage>) => {});
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        initialMessages={[idea, answeredRound]}
        beforeRun={beforeRun}
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
    // Storage is asked to hold the 2 restored messages, as for any request.
    expect(beforeRun.mock.calls[0][0]).toHaveLength(2);
  });

  it("continues a confirmed finish whose closing reply was never stored", async () => {
    const { fake, fetchMock } = stubNetwork([{ text: "Great, we are done." }]);
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
    expect(fake.pendingResponses()).toBe(0);
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

describe("ChatPane: turns that break the tree rules (ADR 0012)", () => {
  const BAD_ROUND = {
    settled: [],
    questions: [{ ...ROUND.questions[0], parentId: "r9q9" }],
  };

  it("shows an error instead of the questionnaire, and asks again on Try again", async () => {
    const { fake } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: BAD_ROUND }] },
      { text: "Second try.", toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();

    expect(await screen.findByText("The reply broke the interview rules")).toBeTruthy();
    expect(screen.getByText(/do not fit the decisions made so far/)).toBeTruthy();
    expect(screen.queryByText("Who is it for?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Who is it for?")).toBeTruthy();
    expect(screen.queryByText("The reply broke the interview rules")).toBeNull();
    expect(fake.pendingResponses()).toBe(0);
  });

  it("rejects a turn with two tool calls", async () => {
    const { fake } = stubNetwork([
      {
        text: "Two at once.",
        toolCalls: [
          { name: "ask_round", input: ROUND },
          { name: "ask_round", input: ROUND },
        ],
      },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    expect(await screen.findByText(/do not fit the decisions made so far/)).toBeTruthy();
    expect(screen.queryByText("Who is it for?")).toBeNull();
    expect(fake.pendingResponses()).toBe(0);
  });

  it("rejects a first reply that ends without a tool call", async () => {
    const { fake } = stubNetwork([{ text: "Just words." }]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    await sendIdea();
    expect(await screen.findByText(/replied without asking a question/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(fake.pendingResponses()).toBe(0);
  });

  it("after an answer, offers only Start over and sends nothing more", async () => {
    const onStartOver = vi.fn();
    const { fake, fetchMock } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
      // `settled` must list r1q1, and it lists nothing.
      { text: "Next.", toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} onStartOver={onStartOver} />);
    await sendIdea();
    fireEvent.click(await screen.findByRole("radio", { name: /A\s*Families/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText(/do not fit the decisions made so far/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: /questions for this round/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fake.pendingResponses()).toBe(0);
  });

  it("rejects a stored reply that ended without a tool call", async () => {
    stubNetwork([]);
    render(
      <ChatPane
        threadId="t1"
        byok={await byokWithKey(true)}
        initialMessages={[
          { id: "u1", role: "user", parts: [{ type: "text", content: "A picnic planner" }] },
          { id: "a1", role: "assistant", parts: [{ type: "text", content: "Just words." }] },
        ]}
      />,
    );
    expect(await screen.findByText("The reply broke the interview rules")).toBeTruthy();
    expect(screen.getByText(/replied without asking a question/)).toBeTruthy();
  });
});

describe("ChatPane: linked to the canvas (#31)", () => {
  const TWO = {
    settled: [],
    questions: [
      ROUND.questions[0],
      {
        title: "Where does it run?",
        body: "",
        label: "Platform",
        options: [{ label: "Web" }, { label: "Phone" }],
        parentId: "idea",
      },
    ],
  };
  const answered = [
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
          arguments: JSON.stringify(TWO),
          input: TWO,
          state: "complete",
          output: {
            answers: { "1": { optionId: "A", text: null }, "2": { optionId: "B", text: null } },
          },
        },
      ],
    },
  ] as Array<UIMessage>;

  it("opens the selected node's round in the history and marks its question", async () => {
    stubNetwork([]);
    const byok = await byokWithKey(true);
    const { rerender } = render(<ChatPane threadId="t1" byok={byok} initialMessages={answered} />);
    expect(screen.queryByText("Where does it run?")).toBeNull();

    rerender(<ChatPane threadId="t1" byok={byok} initialMessages={answered} selectedId="r1q2" />);
    const marked = screen.getByText("Where does it run?").closest("[aria-current]");
    expect(marked?.textContent).toContain("B. Phone");
    expect(screen.getByText("Who is it for?").closest("[aria-current]")).toBeNull();

    rerender(<ChatPane threadId="t1" byok={byok} initialMessages={answered} selectedId="idea" />);
    expect(
      screen
        .getByText("A picnic planner")
        .closest("[data-slot=bubble]")
        ?.getAttribute("aria-current"),
    ).toBe("true");
  });

  it("selects the question on screen, and shows answers on the tree before they are sent", async () => {
    const { fake } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: TWO }] },
    ]);
    const onSelect = vi.fn();
    const onTree = vi.fn();
    render(
      <ChatPane threadId="t1" byok={await byokWithKey(true)} onSelect={onSelect} onTree={onTree} />,
    );
    await sendIdea();
    await screen.findByText("Who is it for?");
    await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith("r1q1"));

    const states = () =>
      (onTree.mock.lastCall?.[0] as Tree | undefined)?.nodes.map(
        (node) => `${node.id}:${node.state}`,
      );
    expect(states()).toEqual(["idea:settled", "r1q1:pending", "r1q2:pending"]);
    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    expect(states()).toEqual(["idea:settled", "r1q1:answered", "r1q2:pending"]);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onSelect).toHaveBeenLastCalledWith("r1q2");
    expect(fake.pendingResponses()).toBe(0);
  });

  it("moves the questionnaire to a question of the round picked on the canvas", async () => {
    const { fake } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: TWO }] },
    ]);
    const byok = await byokWithKey(true);
    const { rerender } = render(<ChatPane threadId="t1" byok={byok} />);
    await sendIdea();
    expect(await screen.findByText("Question 1 of 2")).toBeTruthy();
    rerender(<ChatPane threadId="t1" byok={byok} selectedId="r1q2" />);
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    expect(fake.pendingResponses()).toBe(0);
  });
});

describe("ChatPane: onboarding (ADR 0016)", () => {
  function renderAs(session: Session, ui: ReactElement) {
    return rtlRender(<FakeSessionProvider session={session}>{ui}</FakeSessionProvider>);
  }
  const PENDING = "unfold.pendingIdea";

  function currentStep(dialog: HTMLElement) {
    return within(dialog).getByRole("list", { name: "Steps" }).querySelector("[aria-current=step]")
      ?.textContent;
  }

  it("signed out, keeps the idea for the redirect and asks to sign in, sending nothing", async () => {
    const { fetchMock } = stubNetwork([]);
    const signInWithGoogle = vi.fn(async () => {});
    renderAs(
      fakeSession({ status: "signed-out", signInWithGoogle }),
      <ChatPane threadId="t1" byok={await byokWithKey(true)} />,
    );
    expect(
      screen.getByText(/sign in with Google, then add your own Anthropic API key/),
    ).toBeTruthy();
    // No key button before sign-in: the key comes second.
    expect(screen.queryByRole("button", { name: /add anthropic api key/i })).toBeNull();

    await sendIdea("My idea");
    const dialog = await screen.findByRole("dialog", { name: "Before your first interview" });
    expect(currentStep(dialog)).toContain("Sign in");
    expect(sessionStorage.getItem(PENDING)).toBe("My idea");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith(undefined));
  });

  it("closing the dialog keeps the idea in the composer", async () => {
    stubNetwork([]);
    renderAs(
      fakeSession({ status: "signed-out" }),
      <ChatPane threadId="t1" byok={await byokWithKey(false)} />,
    );
    await sendIdea("My idea");
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByLabelText("Your idea") as HTMLTextAreaElement).value).toBe("My idea");
  });

  it("starts the interview on its own once the key is saved in the dialog", async () => {
    const { fake, fetchMock } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} />);
    await sendIdea("My idea");
    const dialog = await screen.findByRole("dialog", { name: "Before your first interview" });
    fireEvent.change(within(dialog).getByLabelText("API key"), { target: { value: FAKE_KEY } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save key" }));

    expect(await screen.findByText("Let's start.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("My idea", { selector: "[data-slot=bubble-content]" })).toBeTruthy();
    expect(sessionStorage.getItem(PENDING)).toBeNull();
    expect(fake.pendingResponses()).toBe(0);
  });

  it("cannot be dismissed while the key is being saved", async () => {
    const { fake, fetchMock } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    let finish = () => {};
    // A store whose save waits until the test lets it finish.
    const save = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const byok = defineByok({
      storage: {
        id: "test",
        label: "Test",
        persistent: true,
        load: () => ({}),
        save,
        clear: () => {},
      },
    });
    render(<ChatPane threadId="t1" byok={byok} />);
    await sendIdea("My idea");
    const dialog = await screen.findByRole("dialog", { name: "Before your first interview" });
    fireEvent.change(within(dialog).getByLabelText("API key"), { target: { value: FAKE_KEY } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    finish();
    expect(await screen.findByText("Let's start.")).toBeTruthy();
    expect(fake.pendingResponses()).toBe(0);
  });

  it("back from Google with a key ready, starts the idea typed before", async () => {
    const { fake } = stubNetwork([
      { text: "Let's start.", toolCalls: [{ name: "ask_round", input: ROUND }] },
    ]);
    sessionStorage.setItem(PENDING, "My idea");
    render(<ChatPane threadId="t1" byok={await byokWithKey(true)} />);
    expect(await screen.findByText("Let's start.")).toBeTruthy();
    expect(sessionStorage.getItem(PENDING)).toBeNull();
    expect(fake.pendingResponses()).toBe(0);
  });

  it("back from Google without a key, restores the idea and asks for the key", async () => {
    const { fetchMock } = stubNetwork([]);
    sessionStorage.setItem(PENDING, "My idea");
    render(<ChatPane threadId="t1" byok={await byokWithKey(false)} />);
    const dialog = await screen.findByRole("dialog", { name: "Before your first interview" });
    expect(currentStep(dialog)).toContain("Add your key");
    expect((screen.getByLabelText("Your idea") as HTMLTextAreaElement).value).toBe("My idea");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("back without signing in, restores the idea and opens nothing", async () => {
    stubNetwork([]);
    sessionStorage.setItem(PENDING, "My idea");
    renderAs(
      fakeSession({ status: "signed-out" }),
      <ChatPane threadId="t1" byok={await byokWithKey(true)} />,
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Your idea") as HTMLTextAreaElement).value).toBe("My idea"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sent from a saved idea's address, asks to sign in and returns there", async () => {
    stubNetwork([]);
    const signInWithGoogle = vi.fn(async () => {});
    renderAs(
      fakeSession({ status: "signed-out", signInWithGoogle }),
      <ChatPane threadId="t1" byok={await byokWithKey(true)} signInReturnTo="/c/abc" />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Before your first interview" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith("/c/abc"));
  });
});
