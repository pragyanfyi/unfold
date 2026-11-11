import { toast } from "sonner";
import { createIdbStore } from "./idb-store";
import type { ConversationStore } from "./store";

let instance: ConversationStore | null = null;

// One store per tab, created on first use in the browser. Never call this during server
// rendering: there is no IndexedDB there.
export function getConversationStore(): ConversationStore {
  instance ??= createIdbStore({
    onVersionChange: () =>
      toast.error("Unfold was updated in another tab.", {
        description: "Reload this page to keep saving your conversations.",
        duration: Number.POSITIVE_INFINITY,
      }),
  });
  return instance;
}
