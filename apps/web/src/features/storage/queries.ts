import { convexQuery } from "@convex-dev/react-query";
import { queryOptions } from "@tanstack/react-query";
import { api } from "@unfold/backend/convex/_generated/api";
import { getConversationStore } from "./store-instance";
import { type ConversationRecord, SCHEMA_VERSION } from "./types";

export const conversationKeys = {
  all: ["conversations"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
};

// The signed-in user's ideas, as a live Convex query (ADR 0015): a save, rename or delete in any
// tab or on any device updates it, so nothing has to invalidate it. Ideas stored by newer code
// are left out. Failures show an error state in the sidebar (docs/internals/data-fetching.md).
export const conversationListQuery = (enabled: boolean) => ({
  ...convexQuery(api.ideas.list, enabled ? {} : "skip"),
  select: (records: Array<ConversationRecord>) =>
    records.filter((record) => record.schemaVersion <= SCHEMA_VERSION),
});

// The messages are read once and handed to the chat client, which ignores later changes, so
// this is a one-off read, never refetched while open. `gcTime: 0` makes the next visit read
// what was saved.
export const conversationQuery = (id: string) =>
  queryOptions({
    queryKey: conversationKeys.detail(id),
    queryFn: () => getConversationStore().load(id),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
