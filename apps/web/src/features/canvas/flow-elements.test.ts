import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";
import { deriveTree } from "#/features/tree/derive-tree";
import { toFlow } from "./flow-elements";
import { layoutTree, NODE_HEIGHT, NODE_WIDTH } from "./layout-tree";

const idea: UIMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", content: "A picnic planner" }],
};

type Question = { label: string; parentId?: string; dependsOn?: Array<string>; revisits?: string };

function round(id: string, settled: Array<unknown>, questions: Array<Question>, output?: unknown) {
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
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: `${id}-call`,
        name: "ask_round",
        arguments: JSON.stringify(input),
        input,
        state: "complete",
        ...(output === undefined ? {} : { output }),
      },
    ],
  } as UIMessage;
}

function flow(messages: Array<UIMessage>, selectedId: string | null = null) {
  const tree = deriveTree(messages);
  expect(tree.rejected).toEqual([]);
  return toFlow(tree, layoutTree(tree.nodes), selectedId);
}

const firstRound = round("a1", [], [{ label: "Audience" }, { label: "Pricing" }], {
  answers: { "1": { optionId: "B", text: "mostly" }, "2": { optionId: null, text: "Not sure" } },
});
const secondRound = round(
  "a2",
  [
    { id: "r1q1", decision: "For friends", status: "settled" },
    { id: "r1q2", decision: "Pricing is undecided", status: "open" },
  ],
  [
    { label: "Pricing again", parentId: "r1q1", revisits: "r1q2" },
    { label: "Sharing", parentId: "r1q1", dependsOn: ["idea", "r1q1", "idea"] },
  ],
);

describe("toFlow", () => {
  it("draws nothing for an empty tree", () => {
    expect(flow([])).toEqual({ nodes: [], edges: [] });
  });

  it("gives every node the fixed size and its laid-out position", () => {
    const { nodes } = flow([idea, firstRound]);
    expect(nodes.map((node) => node.id)).toEqual(["idea", "r1q1", "r1q2"]);
    for (const node of nodes) {
      expect(node).toMatchObject({ type: "tree", width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].position.x).toBeGreaterThan(0);
  });

  it("shows the idea without a second line, and the raw answer until there is a decision", () => {
    const { nodes } = flow([idea, firstRound]);
    expect(nodes[0].data).toMatchObject({ kind: "idea", label: "A picnic planner", detail: null });
    expect(nodes[1].data).toMatchObject({ state: "answered", detail: "B. Friends: mostly" });
    expect(nodes[2].data).toMatchObject({ state: "answered", detail: "Not sure" });
    expect(flow([idea, round("a1", [], [{ label: "Audience" }])]).nodes[1].data).toMatchObject({
      state: "pending",
      detail: null,
    });
  });

  it("shows the model's decision once it has written one", () => {
    const { nodes } = flow([idea, firstRound, secondRound]);
    expect(nodes[1].data).toMatchObject({ state: "settled", detail: "For friends" });
    expect(nodes[2].data).toMatchObject({ state: "open", detail: "Pricing is undecided" });
  });

  it("marks an open question that was asked again, and the question asking it", () => {
    const { nodes } = flow([idea, firstRound, secondRound]);
    const marks = nodes.map((node) => [node.id, node.data.askedAgain, node.data.asksAgain]);
    expect(marks).toEqual([
      ["idea", false, false],
      ["r1q1", false, false],
      ["r1q2", true, false],
      ["r2q1", false, true],
      ["r2q2", false, false],
    ]);
  });

  it("draws a solid edge from the parent and a dashed one from each other dependency", () => {
    const { edges } = flow([idea, firstRound, secondRound]);
    expect(edges.map((edge) => [edge.source, edge.target, edge.data?.kind])).toEqual([
      ["idea", "r1q1", "parent"],
      ["idea", "r1q2", "parent"],
      ["r1q1", "r2q1", "parent"],
      ["r1q1", "r2q2", "parent"],
      // The dependency on the parent and the repeated one are not drawn twice. A revisit is
      // not an edge.
      ["idea", "r2q2", "depends"],
    ]);
    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length);
    expect(edges.every((edge) => edge.selectable === false)).toBe(true);
  });

  it("selects the node the app says is selected", () => {
    const selected = flow([idea, firstRound], "r1q2").nodes.filter((node) => node.selected);
    expect(selected.map((node) => node.id)).toEqual(["r1q2"]);
  });

  it("names each node for a screen reader with its label, state and decision", () => {
    const { nodes } = flow([idea, firstRound, secondRound]);
    expect(nodes[0].ariaLabel).toBe("A picnic planner. Your idea");
    expect(nodes[1].ariaLabel).toBe("Audience. Settled. For friends");
  });
});
