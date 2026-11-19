import type { UIMessage } from "@tanstack/ai-react";
import { deriveTree } from "@unfold/interview/derive-tree";
import { describe, expect, it } from "vitest";
import { withDrafts } from "./with-drafts";

function question(label: string) {
  return {
    title: `${label}?`,
    body: "",
    label,
    parentId: "idea",
    options: [{ label: "Yes" }, { label: "No" }],
  };
}

// An idea, then a round of two questions that waits for its answers.
const messages = [
  { id: "m1", role: "user", parts: [{ type: "text", content: "A picnic planner" }] },
  {
    id: "m2",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "c1",
        name: "ask_round",
        arguments: "",
        input: { settled: [], questions: [question("Who"), question("Where")] },
        state: "input-complete",
      },
    ],
  },
] as Array<UIMessage>;
const tree = deriveTree(messages);

const blank = { optionId: null, text: null };

describe("withDrafts", () => {
  it("shows an answered draft on its node and leaves the rest pending", () => {
    const shown = withDrafts(tree, {
      messageId: "m2",
      drafts: [blank, { optionId: "B", text: null }],
    });
    const [, who, where] = shown.nodes;
    expect(who).toMatchObject({ id: "r1q1", state: "pending", answer: null });
    expect(where).toMatchObject({
      id: "r1q2",
      state: "answered",
      answer: { optionId: "B", text: null },
    });
  });

  it("trims a note, and drops an option the question does not have", () => {
    const shown = withDrafts(tree, {
      messageId: "m2",
      drafts: [
        { optionId: "D", text: "  maybe both " },
        { optionId: "D", text: " " },
      ],
    });
    expect(shown.nodes[1]?.answer).toEqual({ optionId: null, text: "maybe both" });
    expect(shown.nodes[2]?.state).toBe("pending");
  });

  it("returns the same tree when nothing is answered yet, or the drafts are for another round", () => {
    expect(withDrafts(tree, null)).toBe(tree);
    expect(withDrafts(tree, { messageId: "m2", drafts: [blank, blank] })).toBe(tree);
    expect(withDrafts(tree, { messageId: "other", drafts: [{ optionId: "A", text: null }] })).toBe(
      tree,
    );
  });

  it("never overrides an answer that is in the messages", () => {
    const answered = deriveTree([
      messages[0],
      {
        ...messages[1],
        parts: [
          {
            ...messages[1].parts[0],
            state: "complete",
            output: { answers: { 1: { optionId: "A", text: null }, 2: blank } },
          },
        ],
      } as UIMessage,
    ]);
    const shown = withDrafts(answered, {
      messageId: "m2",
      drafts: [
        { optionId: "B", text: null },
        { optionId: "B", text: null },
      ],
    });
    expect(shown.nodes[1]?.answer).toEqual({ optionId: "A", text: null });
    // The second question has no answer in the messages and is still pending, so its draft shows.
    expect(shown.nodes[2]?.state).toBe("answered");
  });
});
