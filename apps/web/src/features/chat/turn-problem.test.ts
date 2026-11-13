import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";
import { deriveTree } from "#/features/tree/derive-tree";
import { turnProblem } from "./turn-problem";

const idea: UIMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", content: "A picnic planner" }],
};

const text = (id: string, content = "Some words."): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", content }],
});

function call(id: string, name: string, input: unknown, output?: unknown): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: `${id}-call`,
        name,
        arguments: JSON.stringify(input),
        input,
        state: "complete",
        ...(output === undefined ? {} : { output }),
      },
    ],
  } as UIMessage;
}

const round = (parentId = "idea", settled: Array<unknown> = []) => ({
  settled,
  questions: [
    {
      title: "Who is it for?",
      body: "",
      label: "Audience",
      options: [{ label: "Families" }, { label: "Friends" }],
      parentId,
    },
  ],
});
const answered = { answers: { "1": { optionId: "A", text: null } } };
const settled = [{ id: "r1q1", decision: "Families", status: "settled" }];

const check = (messages: Array<UIMessage>, complete: Array<string> = []) =>
  turnProblem(messages, deriveTree(messages), (id) => complete.includes(id));

describe("turnProblem", () => {
  it("finds nothing wrong before a reply, or with a valid round", () => {
    expect(check([])).toBeNull();
    expect(check([idea])).toBeNull();
    expect(check([idea, call("a1", "ask_round", round())])).toBeNull();
  });

  it("gives the reason the tree rejected the last turn", () => {
    expect(check([idea, call("a1", "ask_round", round("r9q9"))])).toMatch(/unknown id: r9q9/);
    expect(check([idea, call("a1", "search_web", {})])).toMatch(/unknown tool/);
  });

  it("rejects a complete reply with no tool call, but not one still streaming", () => {
    expect(check([idea, text("a1")], ["a1"])).toBe("no tool call");
    expect(check([idea, text("a1")])).toBeNull();
  });

  it("accepts the closing reply after a confirmed finish", () => {
    const finish = { settled, summary: "All agreed." };
    const upToProposal = [idea, call("a1", "ask_round", round(), answered)];
    const confirmed = call("a2", "propose_finish", finish, { confirmed: true, text: null });
    expect(check([...upToProposal, confirmed, text("a3")], ["a3"])).toBeNull();
    // "Keep going" returns to the interview, so the next reply must ask again.
    const keptGoing = call("a2", "propose_finish", finish, { confirmed: false, text: "More" });
    expect(check([...upToProposal, keptGoing, text("a3")], ["a3"])).toBe("no tool call");
  });

  it("looks only at the last turn, past the empty message a failed run leaves behind", () => {
    const bad = call("a1", "ask_round", round("r9q9"));
    const empty: UIMessage = { id: "a2", role: "assistant", parts: [] };
    expect(check([idea, bad, empty])).toMatch(/unknown id/);
    expect(check([idea, bad, call("a3", "ask_round", round())])).toBeNull();
  });
});
