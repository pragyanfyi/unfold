import type { UIMessage } from "@tanstack/ai-react";

export type TurnState = {
  status: "ready" | "submitted" | "streaming" | "error";
  /** The last turn failed because there is no key, so nothing was sent. */
  blocked: boolean;
  /** Id of the assistant message that the library reported as finished (`onFinish`). */
  finishedId: string | null;
};

const toolCalls = (message: UIMessage) => message.parts.filter((part) => part.type === "tool-call");

// A message is saved once it will no longer change (ADR 0013). Rounds and finish proposals
// change when the user answers (the answer becomes the tool result on the same message,
// ADR 0012), so they count from then on. The library calls `onFinish` only for the run that
// ends the conversation, not for runs that end waiting for the user, so a plain closing reply
// is final when `onFinish` named it.
function isFinal(message: UIMessage, isLast: boolean, turn: TurnState): boolean {
  if (message.role === "user") {
    // The idea counts once the server has begun to answer, or the request failed after being
    // sent. A send refused for lack of a key is cleared again, so it must not be saved.
    return !isLast || turn.status === "streaming" || (turn.status === "error" && !turn.blocked);
  }
  if (message.parts.length === 0) return false;
  const calls = toolCalls(message);
  if (calls.length > 0) return calls.every((call) => call.output !== undefined);
  return !isLast || (turn.status === "ready" && turn.finishedId === message.id);
}

// The longest prefix of `messages` that may be stored. Storage is append-only and ordered
// by `seq`, so the first message that is not final ends the prefix.
export function savablePrefix(
  messages: ReadonlyArray<UIMessage>,
  turn: TurnState,
): Array<UIMessage> {
  const last = messages.length - 1;
  const end = messages.findIndex((message, index) => !isFinal(message, index === last, turn));
  return messages.slice(0, end === -1 ? messages.length : end);
}
