import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";
import { deriveTree } from "./derive-tree";
import { buildOutline, outlineSchema, renderOutline } from "./outline";

let nextId = 0;
const id = () => `m${++nextId}`;

function idea(text = "A picnic planner"): UIMessage {
  return { id: id(), role: "user", parts: [{ type: "text", content: text }] };
}

type Question = { label: string; parentId?: string; revisits?: string };
type Settled = Array<{ id: string; decision: string; status: "settled" | "open" }>;

function round(settled: Settled, questions: Array<Question>, output?: unknown): UIMessage {
  const input = {
    settled,
    questions: questions.map(({ parentId = "idea", ...question }) => ({
      title: `${question.label}?`,
      body: "",
      parentId,
      options: [{ label: "Families" }, { label: "Friends" }],
      ...question,
    })),
  };
  return {
    id: id(),
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: id(),
        name: "ask_round",
        arguments: JSON.stringify(input),
        input,
        state: "complete",
        ...(output === undefined ? {} : { output }),
      },
    ],
  } as UIMessage;
}

const outlineOf = (messages: Array<UIMessage>) => buildOutline(deriveTree(messages));

describe("buildOutline", () => {
  it("is empty before the first message", () => {
    expect(outlineOf([])).toEqual([]);
  });

  it("sends the idea once, as the label of the root", () => {
    expect(outlineOf([idea()])).toEqual([
      {
        id: "idea",
        label: "A picnic planner",
        answer: null,
        decision: null,
        parent: null,
        state: "settled",
        revisits: null,
      },
    ]);
  });

  it("shortens a long idea", () => {
    const [root] = outlineOf([idea("x".repeat(5000))]);
    expect(root.label).toHaveLength(201);
    expect(root.label.endsWith("…")).toBe(true);
  });

  it("lists pending questions with their parent and no answer", () => {
    const outline = outlineOf([idea(), round([], [{ label: "Audience" }])]);
    expect(outline[1]).toEqual({
      id: "r1q1",
      label: "Audience",
      answer: null,
      decision: null,
      parent: "idea",
      state: "pending",
      revisits: null,
    });
  });

  it("puts the answer in words: the option, a note, or the user's own text", () => {
    const answers = {
      answers: {
        "1": { optionId: "B", text: null },
        "2": { optionId: "A", text: "but only at first" },
        "3": { optionId: null, text: "I don't know" },
      },
    };
    const outline = outlineOf([
      idea(),
      round([], [{ label: "Audience" }, { label: "Scope" }, { label: "Pricing" }], answers),
    ]);
    expect(outline.slice(1).map((node) => [node.answer, node.state])).toEqual([
      ["B. Friends", "answered"],
      ["A. Families: but only at first", "answered"],
      ["I don't know", "answered"],
    ]);
  });

  it("carries decisions, open questions and what revisits them", () => {
    const outline = outlineOf([
      idea(),
      round([], [{ label: "Audience" }, { label: "Pricing" }], {
        answers: { "1": { optionId: "A", text: null }, "2": { optionId: null, text: "Not sure" } },
      }),
      round(
        [
          { id: "r1q1", decision: "For families", status: "settled" },
          { id: "r1q2", decision: "Pricing is undecided", status: "open" },
        ],
        [{ label: "Pricing again", parentId: "r1q1", revisits: "r1q2" }],
      ),
    ]);
    expect(
      outline.map(({ id, decision, parent, state, revisits }) => ({
        id,
        decision,
        parent,
        state,
        revisits,
      })),
    ).toEqual([
      { id: "idea", decision: null, parent: null, state: "settled", revisits: null },
      { id: "r1q1", decision: "For families", parent: "idea", state: "settled", revisits: null },
      {
        id: "r1q2",
        decision: "Pricing is undecided",
        parent: "idea",
        state: "open",
        revisits: null,
      },
      { id: "r2q1", decision: null, parent: "r1q1", state: "pending", revisits: "r1q2" },
    ]);
  });

  it("leaves out a turn the tree rejected, so ids match what the app will accept", () => {
    const outline = outlineOf([idea(), round([], [{ label: "Audience", parentId: "nope" }])]);
    expect(outline.map((node) => node.id)).toEqual(["idea"]);
  });

  it("builds what the route's schema accepts", () => {
    const outline = outlineOf([idea(), round([], [{ label: "Audience" }])]);
    expect(outlineSchema.parse(JSON.parse(JSON.stringify(outline)))).toEqual(outline);
  });
});

describe("renderOutline", () => {
  it("writes a heading and one JSON line per node, without empty fields", () => {
    const text = renderOutline(outlineOf([idea(), round([], [{ label: "Audience" }])]));
    expect(text.split("\n")).toEqual([
      "Outline of the tree so far, one node per line:",
      '{"id":"idea","label":"A picnic planner","state":"settled"}',
      '{"id":"r1q1","label":"Audience","parent":"idea","state":"pending"}',
    ]);
  });
});
