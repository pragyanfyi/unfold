import { createFileRoute } from "@tanstack/react-router";
import { handleChatRequest } from "#/features/chat/chat-handler";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleChatRequest(request),
    },
  },
});
