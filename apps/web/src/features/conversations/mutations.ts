import { useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationKeys } from "#/features/storage/queries";
import { getConversationStore } from "#/features/storage/store-instance";
import type { ConversationRecord } from "#/features/storage/types";

// The list of ideas is a live query, so neither mutation refreshes it: Convex pushes the change.
export function useRenameConversation() {
  return useMutation({
    mutationFn: ({ record, title }: { record: ConversationRecord; title: string }) =>
      getConversationStore().rename(record.id, title, record.titleRev),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getConversationStore().remove(id),
    // A later visit to the address must read again and find it gone.
    onSettled: (_data, _error, id) => {
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}
