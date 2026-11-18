# Data fetching

Applies to `apps/web/src/**/*.{ts,tsx}`.

## TanStack Query

- Server state lives in TanStack Query. Do not fetch inside `useEffect`, and do not mirror query data into other state.
- Define query keys and query options in one module per feature (for example a `queries.ts` next to the feature), not inline at call sites.
- Query keys are arrays that start with the feature name and contain only serialisable, non-sensitive values.
- Mutations invalidate or update the affected queries explicitly. No fire-and-forget mutations.
- Handle loading, error and empty states in the UI. A query that can fail must have an error state.
- Set `staleTime` deliberately. Do not rely on the default for data that rarely changes.

## Never put credentials in the cache

- Provider API keys must never appear in a query key, query data, a mutation variable that is persisted, or any persisted query cache. See [byok-and-secrets.md](byok-and-secrets.md).

## Server functions and loaders

- Validate all input at the boundary (server function or route handler). Do not trust client data.
- Return only the fields the client needs. Do not return database rows wholesale.
- Route loaders may prefetch into the query client; the component then reads the same query. Do not fetch the same data twice by two different paths.
- Data lives in Convex (ADR 0015), in `packages/backend/convex`. Every function checks the signed-in user with `getAuthUserId` and acts only on what that user owns; someone else's document looks like a missing one. Validate every argument, and return only the fields the client needs, never owner or Convex ids.
- Read data that should stay current with `convexQuery(...)` from `@convex-dev/react-query`: it is a TanStack query that stays subscribed, so it needs no invalidation. One-off reads and writes go through the feature's own seam (for ideas, `ConversationStore` in `features/storage`), so components and tests do not depend on Convex.
- Convex errors cross to the browser as `ConvexError({ code })` only, never with user content. The client turns codes into its own typed errors.
- Do not keep request-derived state, such as a user, session or request, at module scope.

## Errors

- Throw or return typed errors. Do not swallow errors silently.
- User-facing messages are plain language. Technical detail goes to logs, with secrets removed (see [byok-and-secrets.md](byok-and-secrets.md)).
