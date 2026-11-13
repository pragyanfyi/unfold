import { fetchServerSentEvents, type UIMessage } from "@tanstack/ai-react";
import { deriveTree } from "#/features/tree/derive-tree";
import { buildOutline } from "#/features/tree/outline";

// The connection to the chat route. It adds the tree outline (ADR 0012) to every request,
// next to `provider` in `forwardedProps`.
//
// The outline is built here, from the very messages being sent, and not passed through the
// `forwardedProps` option: the hook copies that option to the client in an effect, so a
// request that resumes right after an answer would carry the outline of the render before it.
export function interviewConnection(url = "/api/chat") {
  const base = fetchServerSentEvents(url);
  const connect: typeof base.connect = (messages, data, abortSignal, runContext) => {
    // The chat client always sends UI messages (the other form is for calling an adapter
    // directly).
    const outline = buildOutline(deriveTree(messages as ReadonlyArray<UIMessage>));
    return base.connect(messages, { ...data, outline }, abortSignal, runContext);
  };
  return { ...base, connect };
}
