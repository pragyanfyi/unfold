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
- Anything that talks to D1 or KV opens its binding per request (see the auth and database ADRs when they land). No module-scope database handles.

## Errors

- Throw or return typed errors. Do not swallow errors silently.
- User-facing messages are plain language. Technical detail goes to logs, with secrets removed (see [byok-and-secrets.md](byok-and-secrets.md)).
