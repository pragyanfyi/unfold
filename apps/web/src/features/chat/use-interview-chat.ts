import { fetchServerSentEvents, type UIMessage, useChat } from "@tanstack/ai-react";
import { getByok } from "#/features/byok/key-store";
import { DEFAULT_PROVIDER } from "./providers";

// The chat client for the interview. `byok` makes the client read the key from the keyring
// and stamp it in the `x-byok-anthropic` header on each send (the key is never in the body).
// With no key, the send fails with ByokBlockedError and the key dialog is requested
// (`byok.getSnapshot().prompt`). Storage (#25) feeds `initialMessages`; we save through our
// own functions, so `persistence` stays off (it is off unless set).
export function useInterviewChat(threadId: string, initialMessages?: Array<UIMessage>) {
  return useChat({
    threadId,
    initialMessages,
    connection: fetchServerSentEvents("/api/chat"),
    byok: getByok(),
    forwardedProps: { provider: DEFAULT_PROVIDER },
  });
}
