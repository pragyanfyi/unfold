import { createFileRoute } from "@tanstack/react-router";
import { ConversationScreen } from "#/features/conversations/conversation-screen";

// A pathless layout around `/` and `/c/$id`: both render the same screen, so the chat is not
// remounted when a new idea gets its address.
export const Route = createFileRoute("/_app")({ component: ConversationScreen });
