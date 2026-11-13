import { z } from "zod";
import { describeAnswer } from "#/features/chat/round-answers";
import type { Tree } from "./derive-tree";

// The compact outline of the tree that travels with every chat request (ADR 0012, "Context
// sent each turn"). The model reads it to name earlier ids and to see which questions are
// still open and which were already asked again. The browser builds it from `deriveTree`, so
// it holds the same ids the app will check the model's next call against.
//
// It is the user's conversation: the server never logs it (ADR 0003).

// Long enough to recognise the idea. The model has the full text in the first message.
const IDEA_LABEL_LENGTH = 200;

export const outlineSchema = z.array(
  z.object({
    id: z.string().min(1),
    label: z.string(),
    /** The user's answer in words: "A. Families", "A. Families: a note" or their own text. */
    answer: z.string().nullable(),
    decision: z.string().nullable(),
    parent: z.string().nullable(),
    state: z.enum(["pending", "answered", "settled", "open"]),
    /** The open question this one asks again. */
    revisits: z.string().nullable(),
  }),
);

export type Outline = z.infer<typeof outlineSchema>;

export function buildOutline(tree: Tree): Outline {
  return tree.nodes.map((node) => {
    if (node.kind === "idea") {
      // The idea is its own label, answer and decision. Send it once, and shortened.
      const label =
        node.label.length > IDEA_LABEL_LENGTH
          ? `${node.label.slice(0, IDEA_LABEL_LENGTH)}…`
          : node.label;
      return {
        id: node.id,
        label,
        answer: null,
        decision: null,
        parent: null,
        state: node.state,
        revisits: null,
      };
    }
    return {
      id: node.id,
      label: node.label,
      answer: node.answer ? describeAnswer(node, node.answer) : null,
      decision: node.decision,
      parent: node.parentId,
      state: node.state,
      revisits: node.revisits,
    };
  });
}

// The outline as the model reads it: a heading, then one node per line as JSON. Empty fields
// are left out to keep it short.
export function renderOutline(outline: Outline): string {
  const lines = outline.map((node) => JSON.stringify(node, (_, value) => value ?? undefined));
  return ["Outline of the tree so far, one node per line:", ...lines].join("\n");
}
