import type { UIMessage } from "@tanstack/ai-react";
import type { Answer } from "#/features/chat/round-answers";
import { optionLetter } from "#/features/chat/round-answers";
import { askRound, proposeFinish } from "#/features/chat/tools";

// The decision tree, computed from the chat messages (ADR 0012). The messages are the only
// stored record, so this runs on every read and must give the same ids every time: `idea` for
// the root and `r{round}q{n}` for question `n` of the `round`-th valid `ask_round` call.
//
// ADR 0012 also lists `askedAt` and `answeredAt`. They are left out until something reads
// them: an answer is the tool result on the asking message, so it has no message of its own
// to take a time from.

export type NodeState = "pending" | "answered" | "settled" | "open";

export type TreeNode = {
  id: string;
  kind: "idea" | "question";
  /** 0 for the idea node. */
  round: number;
  /** Null only for the idea node. The solid edge. */
  parentId: string | null;
  /** The dashed edges. */
  dependsOn: Array<string>;
  /** The open question this one asks again. */
  revisits: string | null;
  label: string;
  title: string | null;
  body: string | null;
  /** `options[0]` is the model's recommendation. */
  options: Array<{ id: string; label: string }>;
  /** The idea node holds the idea as text. */
  answer: Answer | null;
  /** Written by the model in its next call. */
  decision: string | null;
  /** The chat message that asked it. */
  messageId: string;
  state: NodeState;
};

export type TreeStatus = "interviewing" | "proposed" | "finished";

/** A model turn that broke the protocol. Nothing from it is in the tree. */
export type RejectedTurn = { messageId: string; reason: string };

export type Tree = {
  /** In id order: the idea, then each round's questions. Empty before the first message. */
  nodes: Array<TreeNode>;
  status: TreeStatus;
  /** The closing summary, while the tree is `proposed` or `finished`. */
  summary: string | null;
  rejected: Array<RejectedTurn>;
};

type Settled = Array<{ id: string; decision: string; status: "settled" | "open" }>;
type Questions = ReturnType<typeof askRound.inputSchema.parse>["questions"];

const IDEA_ID = "idea";

function textOf(message: UIMessage): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.content] : [])).join("");
}

function parseArguments(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readAnswer(output: unknown, number: number, optionCount: number): Answer | null {
  const answers = (output as { answers?: Record<string, unknown> } | null | undefined)?.answers;
  const raw = answers?.[String(number)] as { optionId?: unknown; text?: unknown } | undefined;
  if (!raw || typeof raw !== "object") return null;
  const letters = Array.from({ length: optionCount }, (_, index) => optionLetter(index));
  const optionId =
    typeof raw.optionId === "string" && letters.includes(raw.optionId) ? raw.optionId : null;
  const text = typeof raw.text === "string" && raw.text.trim() ? raw.text.trim() : null;
  return optionId || text ? { optionId, text } : null;
}

// Writes the model's decisions onto `nodes`. `settled` must name each question that is waiting
// for a decision exactly once and nothing else. Returns why not, or null.
function applySettled(
  nodes: Array<TreeNode>,
  settled: Settled,
  awaiting: ReadonlyArray<string>,
): string | null {
  const ids = settled.map((entry) => entry.id);
  const expected = [...awaiting].sort().join(", ") || "nothing";
  if (
    new Set(ids).size !== ids.length ||
    [...ids].sort().join(", ") !== [...awaiting].sort().join(", ")
  ) {
    return `settled must list exactly: ${expected}`;
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const entry of settled) {
    let node = byId.get(entry.id);
    if (!node) continue;
    node.decision = entry.decision;
    node.state = entry.status;
    if (entry.status !== "settled") continue;
    // A chain of revisits settles with the decision of its last question.
    while (node?.revisits) {
      node = byId.get(node.revisits);
      if (node) {
        node.decision = entry.decision;
        node.state = "settled";
      }
    }
  }
  return null;
}

// Checks a round's questions against the tree as it stands after this call's decisions.
function checkQuestions(nodes: ReadonlyArray<TreeNode>, questions: Questions): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const revisited = new Set(nodes.flatMap((node) => (node.revisits ? [node.revisits] : [])));
  for (const [index, question] of questions.entries()) {
    const where = `question ${index + 1}`;
    for (const id of [question.parentId, ...(question.dependsOn ?? [])]) {
      const target = byId.get(id);
      if (!target) return `${where} names an unknown id: ${id}`;
      if (target.state !== "settled") return `${where} builds on ${id}, which is not settled`;
    }
    if (question.revisits) {
      const target = byId.get(question.revisits);
      if (!target) return `${where} revisits an unknown id: ${question.revisits}`;
      if (target.state !== "open") return `${where} revisits ${target.id}, which is not open`;
      if (revisited.has(target.id)) return `${where} revisits ${target.id}, already asked again`;
      revisited.add(target.id);
    }
  }
  return null;
}

export function deriveTree(messages: ReadonlyArray<UIMessage>): Tree {
  let nodes: Array<TreeNode> = [];
  const rejected: Array<RejectedTurn> = [];
  let round = 0;
  // Questions that have an answer and wait for the model's decision.
  let awaiting: Array<string> = [];
  let status: TreeStatus = "interviewing";
  let summary: string | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      const idea = textOf(message).trim();
      if (nodes.length === 0 && idea) {
        nodes.push({
          id: IDEA_ID,
          kind: "idea",
          round: 0,
          parentId: null,
          dependsOn: [],
          revisits: null,
          label: idea,
          title: null,
          body: null,
          options: [],
          answer: { optionId: null, text: idea },
          decision: idea,
          messageId: message.id,
          state: "settled",
        });
      }
      continue;
    }
    if (message.role !== "assistant" || nodes.length === 0) continue;

    const calls = message.parts.flatMap((part) => (part.type === "tool-call" ? [part] : []));
    // A reply with no tool call is the closing message, or one still streaming.
    if (calls.length === 0) continue;
    if (calls.some((call) => call.state === "awaiting-input" || call.state === "input-streaming")) {
      continue;
    }
    const reject = (reason: string) => rejected.push({ messageId: message.id, reason });
    if (calls.length > 1) {
      reject("more than one tool call");
      continue;
    }
    const call = calls[0];
    const input: unknown = call.input ?? parseArguments(call.arguments);
    // Decisions and questions are applied to a copy, so a rejected call changes nothing.
    const draft = nodes.map((node) => ({ ...node }));

    if (call.name === askRound.name) {
      const parsed = askRound.inputSchema.safeParse(input);
      if (!parsed.success) {
        reject("ask_round arguments do not match the schema");
        continue;
      }
      const problem =
        applySettled(draft, parsed.data.settled, awaiting) ??
        checkQuestions(draft, parsed.data.questions);
      if (problem) {
        reject(problem);
        continue;
      }
      round += 1;
      awaiting = [];
      for (const [index, question] of parsed.data.questions.entries()) {
        const id = `r${round}q${index + 1}`;
        const answer =
          call.output === undefined
            ? null
            : readAnswer(call.output, index + 1, question.options.length);
        if (answer) awaiting.push(id);
        draft.push({
          id,
          kind: "question",
          round,
          parentId: question.parentId,
          dependsOn: question.dependsOn ?? [],
          revisits: question.revisits ?? null,
          label: question.label,
          title: question.title,
          body: question.body,
          options: question.options.map((option, optionIndex) => ({
            id: optionLetter(optionIndex),
            label: option.label,
          })),
          answer,
          decision: null,
          messageId: message.id,
          state: answer ? "answered" : "pending",
        });
      }
      nodes = draft;
      status = "interviewing";
      summary = null;
    } else if (call.name === proposeFinish.name) {
      const parsed = proposeFinish.inputSchema.safeParse(input);
      if (!parsed.success) {
        reject("propose_finish arguments do not match the schema");
        continue;
      }
      const problem = applySettled(draft, parsed.data.settled, awaiting);
      if (problem) {
        reject(problem);
        continue;
      }
      nodes = draft;
      awaiting = [];
      const reply = call.output as { confirmed?: unknown } | null | undefined;
      // "Keep going" returns to the interview, and the summary no longer stands.
      const keptGoing = call.output !== undefined && reply?.confirmed !== true;
      status = keptGoing ? "interviewing" : reply?.confirmed === true ? "finished" : "proposed";
      summary = keptGoing ? null : parsed.data.summary;
    } else {
      reject(`unknown tool: ${call.name}`);
    }
  }

  return { nodes, status, summary, rejected };
}
