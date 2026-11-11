import { useMutation, useQueryClient } from "@tanstack/react-query";
import { announceChange } from "#/features/storage/channel";
import { conversationKeys } from "#/features/storage/queries";
import { getConversationStore } from "#/features/storage/store-instance";
import type { ConversationRecord } from "#/features/storage/types";

// Both mutations refresh the list explicitly, and tell other tabs (ADR 0013).
export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ record, title }: { record: ConversationRecord; title: string }) =>
      getConversationStore().rename(record.id, title, record.titleRev),
    // On success or failure the list is stale: a conflict means someone else changed it.
    onSettled: async (_data, _error, { record }) => {
      announceChange(record.id);
      await queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getConversationStore().remove(id),
    onSettled: async (_data, _error, id) => {
      announceChange(id);
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
  });
}
