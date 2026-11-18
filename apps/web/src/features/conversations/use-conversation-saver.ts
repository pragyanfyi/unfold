import type { UIMessage } from "@tanstack/ai-react";
import { useCallback, useRef, useState } from "react";
import { ConversationSaver, type SaveStatus } from "#/features/storage/saver";
import { getConversationStore } from "#/features/storage/store-instance";

// Connects one open conversation to storage (ADR 0013, 0015). `stored` is how many messages the
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
      // The list of ideas is a live query, so a save needs to tell nobody but this screen.
      onSaved: () => {
        if (!wasSaved.current) {
          wasSaved.current = true;
          firstSave.current?.();
        }
      },
    });
    return saver.current;
  }, [id, stored]);

  const onSavable = useCallback((messages: Array<UIMessage>) => void get().sync(messages), [get]);
  const retry = useCallback(() => void get().retry(), [get]);
  return { status, onSavable, retry };
}
