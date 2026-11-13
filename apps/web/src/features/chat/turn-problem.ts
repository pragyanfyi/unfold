import type { UIMessage } from "@tanstack/ai-react";
import type { Tree } from "#/features/tree/derive-tree";

// Why the model's last turn cannot be used, or null (ADR 0012, Validation). The chat shows
// this as an error in place of the questionnaire, because a turn the tree rejects would give
// the user questions that never reach the tree and shift the id of every later round.
//
// `deriveTree` judges every turn that has a tool call. It cannot judge a reply with no tool
// call: from the messages alone, that looks the same as a reply still streaming. The chat
// knows which replies are complete, so that check is made here.
//
// Only the last turn is looked at: it is the one the user would act on.
export function turnProblem(
  messages: ReadonlyArray<UIMessage>,
  tree: Tree,
  /** True for an assistant message that will not change any more. */
  isComplete: (messageId: string) => boolean,
): string | null {
  // Empty assistant messages are leftovers of a failed turn.
  const last = messages
    .filter((message) => message.role !== "assistant" || message.parts.length > 0)
    .at(-1);
  if (last?.role !== "assistant") return null;

  const rejected = tree.rejected.find((turn) => turn.messageId === last.id);
  if (rejected) return rejected.reason;

  // After a confirmed finish, the closing reply has no tool call on purpose.
  const hasCall = last.parts.some((part) => part.type === "tool-call");
  if (!hasCall && isComplete(last.id) && tree.status !== "finished") return "no tool call";

  return null;
}
