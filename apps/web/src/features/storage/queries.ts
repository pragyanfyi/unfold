import { queryOptions } from "@tanstack/react-query";
import { getConversationStore } from "./store-instance";

export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
  persisted: () => [...conversationKeys.all, "persisted"] as const,
};

// Local data: there is no network to wait for, and this tab's own saves invalidate the list.
// Failures show an error state in the sidebar (docs/internals/data-fetching.md).
export const conversationListQuery = () =>
  queryOptions({
    queryKey: conversationKeys.list(),
    queryFn: () => getConversationStore().list(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

// The messages are read once and handed to the chat client, which ignores later changes, so
// this is never refetched while open. `gcTime: 0` makes the next visit read what was saved.
export const conversationQuery = (id: string) =>
  queryOptions({
    queryKey: conversationKeys.detail(id),
    queryFn: () => getConversationStore().load(id),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

// Whether the browser promised to keep our data (`navigator.storage.persist()`).
export const storagePersistedQuery = () =>
  queryOptions({
    queryKey: conversationKeys.persisted(),
    queryFn: async () => (await navigator.storage?.persisted?.()) ?? false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
