import { getConvexClient } from "#/features/auth/convex-client";
import { createConvexStore } from "./convex-store";
import type { ConversationStore } from "./store";

let instance: ConversationStore | null = null;

// One store per tab, on the tab's Convex client, so calls carry the signed-in session. Created on
// first use in the browser; never call this during server rendering.
export function getConversationStore(): ConversationStore {
  instance ??= createConvexStore(getConvexClient());
  return instance;
}
