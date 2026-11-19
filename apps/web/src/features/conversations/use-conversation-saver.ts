import type { UIMessage } from "@tanstack/ai-react";
import { useCallback, useRef, useState } from "react";
import { ConversationSaver, type SaveStatus } from "#/features/storage/saver";
import { getConversationStore } from "#/features/storage/store-instance";

// Connects one open conversation to storage (ADR 0013, 0015). The saver writes only what the
// browser knows, before each run; Convex writes everything the model says (see `ConversationSaver`).
export function useConversationSaver({
  id,
  existed,
  onFirstSave,
}: {
  id: string;
  /** True when the conversation was already stored when the screen opened it. */
  existed: boolean;
  /** Called once, after a new conversation was first written. */
  onFirstSave?: () => void;
}) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const firstSave = useRef(onFirstSave);
  firstSave.current = onFirstSave;
  const saver = useRef<ConversationSaver | null>(null);
  const wasSaved = useRef(false);

  const get = useCallback(() => {
    saver.current ??= new ConversationSaver({
      store: getConversationStore(),
      id,
      existed,
      onStatus: setStatus,
      onSaved: () => {
        if (!wasSaved.current) {
          wasSaved.current = true;
          firstSave.current?.();
        }
      },
    });
    return saver.current;
  }, [id, existed]);

  const beforeRun = useCallback(
    (messages: ReadonlyArray<UIMessage>) => get().beforeRun(messages),
    [get],
  );
  const stopRun = useCallback(() => void get().stopRun(), [get]);
  const retry = useCallback(() => void get().retry(), [get]);
  return { status, beforeRun, stopRun, retry };
}
