import { readFileSync } from "node:fs";
import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";
import { deriveTree } from "./derive-tree";

type Settled = Array<{ id: string; decision: string; status: "settled" | "open" }>;
type Question = {
  label: string;
  parentId?: string;
  dependsOn?: Array<string>;
  revisits?: string;
  options?: number;
};

let nextId = 0;
const id = () => `m${++nextId}`;

function idea(text = "A picnic planner"): UIMessage {
  return { id: id(), role: "user", parts: [{ type: "text", content: text }] };
}

function call(name: string, input: unknown, output?: unknown, state = "complete"): UIMessage {
  return {
    id: id(),
    role: "assistant",
    parts: [
      { type: "text", content: "Some words first." },
      {
        type: "tool-call",
        id: id(),
        name,
        arguments: JSON.stringify(input),
        input,
        state,
        ...(output === undefined ? {} : { output }),
      },
    ],
  } as UIMessage;
}

function round(settled: Settled, questions: Array<Question>, answers?: Array<string | null>) {
  const input = {
    settled,
    questions: questions.map(({ options = 2, parentId = "idea", ...question }) => ({
      title: `${question.label}?`,
      body: "",
      parentId,
      options: Array.from({ length: options }, (_, index) => ({ label: `Option ${index + 1}` })),
      ...question,
    })),
  };
  const output = answers && {
    answers: Object.fromEntries(
      answers.map((optionId, index) => [String(index + 1), { optionId, text: null }]),
    ),
  };
  return call("ask_round", input, output);
}

function finish(settled: Settled, reply?: { confirmed: boolean; text: string | null }) {
  return call("propose_finish", { settled, summary: "All agreed." }, reply);
}

const settle = (...ids: Array<string>): Settled =>
  ids.map((nodeId) => ({ id: nodeId, decision: `Decided ${nodeId}`, status: "settled" }));

const states = (messages: Array<UIMessage>) =>
  Object.fromEntries(deriveTree(messages).nodes.map((node) => [node.id, node.state]));

describe("deriveTree", () => {
  it("is empty before the first message", () => {
    expect(deriveTree([])).toEqual({
      nodes: [],
      status: "interviewing",
      summary: null,
      rejected: [],
    });
  });

  it("makes the idea a settled root", () => {
    const first = idea("  A picnic planner  ");
    const [root] = deriveTree([first]).nodes;
    expect(root).toMatchObject({
      id: "idea",
      kind: "idea",
      round: 0,
      parentId: null,
      label: "A picnic planner",
      answer: { optionId: null, text: "A picnic planner" },
      decision: "A picnic planner",
      state: "settled",
      messageId: first.id,
    });
  });

  it("adds a round's questions as pending nodes with positional ids", () => {
    const asked = round([], [{ label: "Audience", options: 3 }, { label: "Discovery" }]);
    const tree = deriveTree([idea(), asked]);
    expect(tree.rejected).toEqual([]);
    expect(tree.nodes.map((node) => node.id)).toEqual(["idea", "r1q1", "r1q2"]);
    expect(tree.nodes[1]).toMatchObject({
      kind: "question",
      round: 1,
      parentId: "idea",
      dependsOn: [],
      revisits: null,
      label: "Audience",
      title: "Audience?",
      options: [
        { id: "A", label: "Option 1" },
        { id: "B", label: "Option 2" },
        { id: "C", label: "Option 3" },
      ],
      answer: null,
      decision: null,
      state: "pending",
      messageId: asked.id,
    });
  });

  it("marks answered questions, then fills in decisions from the next call", () => {
    const first = round([], [{ label: "Audience" }, { label: "Discovery" }], ["A", "B"]);
    expect(states([idea(), first])).toMatchObject({ r1q1: "answered", r1q2: "answered" });

    const second = round(
      [
        { id: "r1q1", decision: "Families", status: "settled" },
        { id: "r1q2", decision: "Not sure yet", status: "open" },
      ],
      [{ label: "Revenue", parentId: "r1q1" }],
    );
    const tree = deriveTree([idea(), first, second]);
    expect(tree.rejected).toEqual([]);
    expect(tree.nodes.map((node) => [node.id, node.state, node.decision])).toEqual([
      ["idea", "settled", "A picnic planner"],
      ["r1q1", "settled", "Families"],
      ["r1q2", "open", "Not sure yet"],
      ["r2q1", "pending", null],
    ]);
    expect(tree.nodes[1].answer).toEqual({ optionId: "A", text: null });
  });

  it("keeps an option with a note, text alone, and drops an option that does not exist", () => {
    const asked = round([], [{ label: "One" }, { label: "Two" }, { label: "Three" }]);
    const part = asked.parts[1] as { output?: unknown };
    part.output = {
      answers: {
        "1": { optionId: "B", text: " but cheaper " },
        "2": { optionId: null, text: "I don't know" },
        "3": { optionId: "D", text: null },
      },
    };
    const tree = deriveTree([idea(), asked]);
    expect(tree.nodes.slice(1).map((node) => [node.answer, node.state])).toEqual([
      [{ optionId: "B", text: "but cheaper" }, "answered"],
      [{ optionId: null, text: "I don't know" }, "answered"],
      [null, "pending"],
    ]);
  });

  it("gives the same tree every time it is derived", () => {
    const messages = [idea(), round([], [{ label: "Audience" }], ["A"]), finish(settle("r1q1"))];
    expect(deriveTree(messages)).toEqual(deriveTree(messages));
  });

  it("ignores a reply with no tool call and one whose call is still streaming", () => {
    const streaming = call("ask_round", undefined, undefined, "input-streaming");
    const words: UIMessage = {
      id: id(),
      role: "assistant",
      parts: [{ type: "text", content: "Thinking aloud." }],
    };
    const tree = deriveTree([idea(), words, streaming]);
    expect(tree.nodes).toHaveLength(1);
    expect(tree.rejected).toEqual([]);
  });

  describe("finishing", () => {
    const first = () => round([], [{ label: "Audience" }], ["A"]);

    it("is proposed with the summary until the user replies", () => {
      const tree = deriveTree([idea(), first(), finish(settle("r1q1"))]);
      expect(tree).toMatchObject({ status: "proposed", summary: "All agreed.", rejected: [] });
      expect(tree.nodes[1].state).toBe("settled");
    });

    it("is finished once the user confirms", () => {
      const done = finish(settle("r1q1"), { confirmed: true, text: null });
      expect(deriveTree([idea(), first(), done])).toMatchObject({
        status: "finished",
        summary: "All agreed.",
      });
    });

    it("stays proposed when the call failed instead of getting a reply", () => {
      const failed = call(
        "propose_finish",
        { settled: settle("r1q1"), summary: "All agreed." },
        {
          error: "Stopped",
        },
        "error",
      );
      expect(deriveTree([idea(), first(), failed])).toMatchObject({
        status: "proposed",
        summary: "All agreed.",
        rejected: [],
      });
    });

    it("goes back to interviewing when the user keeps going", () => {
      const more = finish(settle("r1q1"), { confirmed: false, text: "What about cost?" });
      const next = round([], [{ label: "Cost", parentId: "r1q1" }]);
      const tree = deriveTree([idea(), first(), more, next]);
      expect(tree).toMatchObject({ status: "interviewing", summary: null, rejected: [] });
      expect(tree.nodes.at(-1)?.id).toBe("r2q1");
    });
  });

  describe("revisits", () => {
    const open = (nodeId: string): Settled => [{ id: nodeId, decision: "Unsure", status: "open" }];

    it("settles the whole chain with the decision of its last question", () => {
      const tree = deriveTree([
        idea(),
        round([], [{ label: "Audience" }], ["A"]),
        round(open("r1q1"), [{ label: "Audience again", revisits: "r1q1" }], ["A"]),
        round(open("r2q1"), [{ label: "Audience once more", revisits: "r2q1" }], ["A"]),
        finish([{ id: "r3q1", decision: "Families", status: "settled" }]),
      ]);
      expect(tree.rejected).toEqual([]);
      expect(tree.nodes.slice(1).map((node) => [node.id, node.state, node.decision])).toEqual([
        ["r1q1", "settled", "Families"],
        ["r2q1", "settled", "Families"],
        ["r3q1", "settled", "Families"],
      ]);
    });

    it("leaves the chain open while its last question is open", () => {
      const messages = [
        idea(),
        round([], [{ label: "Audience" }], ["A"]),
        round(open("r1q1"), [{ label: "Audience again", revisits: "r1q1" }], ["A"]),
        finish(open("r2q1")),
      ];
      expect(states(messages)).toMatchObject({ r1q1: "open", r2q1: "open" });
    });
  });

  describe("rejected turns", () => {
    const answered = () => round([], [{ label: "Audience" }, { label: "Discovery" }], ["A", "A"]);
    const reasons = (messages: Array<UIMessage>) =>
      deriveTree(messages).rejected.map((turn) => turn.reason);

    it("rejects a turn with more than one tool call", () => {
      const both = round([], [{ label: "Audience" }]);
      both.parts.push(both.parts[1]);
      const tree = deriveTree([idea(), both]);
      expect(tree.nodes).toHaveLength(1);
      expect(tree.rejected).toEqual([{ messageId: both.id, reason: "more than one tool call" }]);
    });

    it("rejects an unknown tool and arguments that do not match the schema", () => {
      const oneOption = round([], [{ label: "Audience", options: 1 }]);
      const fiveOptions = round([], [{ label: "Audience", options: 5 }]);
      const noQuestions = round([], []);
      expect(reasons([idea(), call("search", {}), oneOption, fiveOptions, noQuestions])).toEqual([
        "unknown tool: search",
        "ask_round arguments do not match the schema",
        "ask_round arguments do not match the schema",
        "ask_round arguments do not match the schema",
      ]);
    });

    it("rejects a parent or dependency that is unknown, unanswered or open", () => {
      const unknown = round([], [{ label: "Revenue", parentId: "r9q9" }]);
      expect(reasons([idea(), unknown])).toEqual(["question 1 names an unknown id: r9q9"]);

      const onOpen = round(
        [
          { id: "r1q1", decision: "Families", status: "settled" },
          { id: "r1q2", decision: "Unsure", status: "open" },
        ],
        [{ label: "Revenue", parentId: "r1q1", dependsOn: ["r1q2"] }],
      );
      expect(reasons([idea(), answered(), onOpen])).toEqual([
        "question 1 builds on r1q2, which is not settled",
      ]);
    });

    it("rejects decisions that miss, repeat or add a question", () => {
      const next = (settled: Settled) => round(settled, [{ label: "Revenue" }]);
      const expected = "settled must list exactly: r1q1, r1q2";
      expect(reasons([idea(), answered(), next(settle("r1q1"))])).toEqual([expected]);
      expect(reasons([idea(), answered(), next(settle("r1q1", "r1q1", "r1q2"))])).toEqual([
        expected,
      ]);
      expect(reasons([idea(), answered(), next(settle("r1q1", "r1q2", "idea"))])).toEqual([
        expected,
      ]);
      expect(reasons([idea(), next(settle("r1q1"))])).toEqual([
        "settled must list exactly: nothing",
      ]);
      // One id that only reads like the two expected ones.
      expect(reasons([idea(), answered(), next(settle("r1q1, r1q2"))])).toEqual([expected]);
    });

    it("rejects a revisit of a question that is unknown, not open or already asked again", () => {
      const first = round([], [{ label: "Audience" }, { label: "Discovery" }], ["A", "A"]);
      const decided: Settled = [
        { id: "r1q1", decision: "Unsure", status: "open" },
        { id: "r1q2", decision: "Search", status: "settled" },
      ];
      const ask = (revisits: string) => round(decided, [{ label: "Again", revisits }]);
      expect(reasons([idea(), first, ask("r7q1")])).toEqual([
        "question 1 revisits an unknown id: r7q1",
      ]);
      expect(reasons([idea(), first, ask("r1q2")])).toEqual([
        "question 1 revisits r1q2, which is not open",
      ]);
      const twice = round(decided, [
        { label: "Again", revisits: "r1q1" },
        { label: "And again", revisits: "r1q1" },
      ]);
      expect(reasons([idea(), first, twice])).toEqual([
        "question 2 revisits r1q1, already asked again",
      ]);
    });

    it("applies nothing from a rejected call and does not count it as a round", () => {
      const bad = round(settle("r1q1", "r1q2"), [{ label: "Revenue", parentId: "nope" }]);
      const good = round(settle("r1q1", "r1q2"), [{ label: "Revenue", parentId: "r1q2" }]);
      const tree = deriveTree([idea(), answered(), bad, good]);
      expect(tree.rejected).toHaveLength(1);
      expect(tree.nodes.map((node) => node.id)).toEqual(["idea", "r1q1", "r1q2", "r2q1"]);

      // Before the good call arrives, the rejected one has decided nothing.
      expect(states([idea(), answered(), bad])).toMatchObject({
        r1q1: "answered",
        r1q2: "answered",
      });
    });
  });

  // The E2E journey is the one scripted conversation the canvas will be asserted on (ADR 0011),
  // so it has to follow the protocol.
  it("accepts every turn of the E2E journey fixture", () => {
    const file = new URL("../../../e2e/fixtures/interview.json", import.meta.url);
    const { fixtures } = JSON.parse(readFileSync(file, "utf8")) as {
      fixtures: Array<{
        match: { userMessage: string };
        response: {
          toolCalls?: Array<{ name: string; arguments: { questions?: Array<unknown> } }>;
        };
      }>;
    };
    const turns = fixtures
      .filter((fixture) => fixture.match.userMessage === "E2E-IDEA-JOURNEY")
      .flatMap((fixture) => fixture.response.toolCalls ?? []);
    const messages = [
      idea("E2E-IDEA-JOURNEY"),
      ...turns.map((turn) =>
        call(
          turn.name,
          turn.arguments,
          turn.name === "ask_round"
            ? {
                answers: Object.fromEntries(
                  (turn.arguments.questions ?? []).map((_, index) => [
                    String(index + 1),
                    { optionId: "A", text: null },
                  ]),
                ),
              }
            : { confirmed: true, text: null },
        ),
      ),
    ];
    const tree = deriveTree(messages);
    expect(tree.rejected).toEqual([]);
    expect(tree.status).toBe("finished");
    expect(tree.nodes.map((node) => [node.id, node.parentId, node.state])).toEqual([
      ["idea", null, "settled"],
      ["r1q1", "idea", "settled"],
      ["r1q2", "idea", "settled"],
      ["r2q1", "r1q1", "settled"],
    ]);
  });
});
