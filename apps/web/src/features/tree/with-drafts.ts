import { type Answer, isAnswered, optionLetter } from "#/features/chat/round-answers";
import type { Tree } from "./derive-tree";

// The tree as the user sees it while they answer a round (#31): each question they have
// answered in the questionnaire shows that answer before the round is submitted. The drafts
// are never stored. Once the round is submitted the real answers are in the messages, its
// nodes are no longer pending, and this changes nothing.

/** The answers typed so far for the round asked in message `messageId`, in question order. */
export type RoundDrafts = { messageId: string; drafts: ReadonlyArray<Answer> };

export function withDrafts(tree: Tree, round: RoundDrafts | null): Tree {
  if (!round) return tree;
  let index = 0;
  let changed = false;
  const nodes = tree.nodes.map((node) => {
    if (node.kind !== "question" || node.messageId !== round.messageId) return node;
    const draft = round.drafts[index++];
    if (node.state !== "pending" || !draft || !isAnswered(draft)) return node;
    const letters = node.options.map((_, optionIndex) => optionLetter(optionIndex));
    const optionId = draft.optionId && letters.includes(draft.optionId) ? draft.optionId : null;
    const text = draft.text?.trim() || null;
    if (!optionId && !text) return node;
    changed = true;
    return { ...node, answer: { optionId, text }, state: "answered" as const };
  });
  return changed ? { ...tree, nodes } : tree;
}
