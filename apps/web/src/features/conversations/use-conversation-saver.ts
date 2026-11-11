import type { UIMessage } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { announceChange } from "#/features/storage/channel";
import { conversationKeys } from "#/features/storage/queries";
import { ConversationSaver, type SaveStatus } from "#/features/storage/saver";
import { getConversationStore } from "#/features/storage/store-instance";

// Connects one open conversation to storage (ADR 0013). `stored` is how many messages the
// conversation already has in storage: 0 for a new one.
export function useConversationSaver({
  id,
  stored,
  onFirstSave,
}: {
  id: string;
  stored: number;
  /** Called once, after a new conversation was first written. */
  onFirstSave?: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const firstSave = useRef(onFirstSave);
  firstSave.current = onFirstSave;
  const saver = useRef<ConversationSaver | null>(null);
  const wasSaved = useRef(stored > 0);

  const get = useCallback(() => {
    saver.current ??= new ConversationSaver({
      store: getConversationStore(),
      id,
      stored,
      onStatus: setStatus,
      onSaved: () => {
        announceChange(id);
        void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
        if (!wasSaved.current) {
          wasSaved.current = true;
          // Ask the browser to keep our data. It may say no, and the notice reports that.
          void navigator.storage?.persist?.().finally(() => {
            void queryClient.invalidateQueries({ queryKey: conversationKeys.persisted() });
          });
          firstSave.current?.();
        }
      },
    });
    return saver.current;
  }, [id, stored, queryClient]);

  const onSavable = useCallback((messages: Array<UIMessage>) => void get().sync(messages), [get]);
  const retry = useCallback(() => void get().retry(), [get]);
  return { status, onSavable, retry };
}
