# 8. Authentication: Better Auth with Google sign-in

- Status: Accepted
- Date: 2026-11-08

## Context

Unfold works without an account. Provider API keys stay in the browser (ADR 0003), and conversations can live in the browser too. Accounts exist for one purpose: syncing conversations across devices. Nothing is built yet. We want the smallest sign-in surface that does this, on Cloudflare's free tier, with no email infrastructure.

## Decision

- **Library:** Better Auth (current release 1.7.x), mounted as a server route at `/api/auth/$` with the `tanstackStartCookies` plugin listed last. Routes that need a session are protected with `beforeLoad` plus a server function, so the check also runs on client-side navigation. Source: Better Auth, "TanStack Start Integration", read 2026-11-08.
- **Sign-in method: Google only.** No email and password: it would need an email provider (verification, reset), password storage and a reset flow, for an optional feature. Passkeys fit the BYOK story (ADR 0003) and can be added later by a new ADR. Another social provider is configuration, not a redesign.
- **Accounts are optional.** Signed out, the app is fully usable. Signing in only enables sync. Local-first storage (browser) is built first; sync and accounts come when cross-device use is prioritised.
- **Sessions live in D1, not KV.** Better Auth's secondary storage would move sessions, verification records and rate-limit counters out of the database (source: Better Auth, "Database", read 2026-11-08); see ADR 0010 for why we do not use KV. A short-lived signed cookie cache reduces session reads (source: Better Auth, "Session Management", read 2026-11-08). Session lifetime starts at Better Auth's default of 7 days; the refresh interval is set when the feature is built.
- **Rate limiting:** Better Auth's default store is memory, which its documentation says may not be suitable, particularly in serverless environments (source: Better Auth, "Rate Limit", read 2026-11-08). Use its database storage for auth endpoints. Revisit if D1 write volume matters or Cloudflare rate-limiting rules become available to us.
- **Configuration:** `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are Worker secrets in production, set once by the maintainer with `wrangler`, and live in `.dev.vars` locally. They are never logged or committed. `baseURL` is set explicitly. Redirect URIs registered with Google: `http://localhost:3000/api/auth/callback/google` and the production origin's `/api/auth/callback/google` (source: Better Auth, "Google", read 2026-11-08).
- **Keys never sync.** Sync covers conversations and trees only. Provider API keys are never part of anything sent to or stored by the server (ADR 0003, `docs/internals/byok-and-secrets.md`).

## Consequences

- Someone without a Google account cannot sync. Acceptable while accounts are optional.
- Creating the Google OAuth client and consent screen is a manual maintainer step.
- Better Auth has its own tables (user, session, account, verification, and a rate-limit table), generated for Drizzle (ADR 0009).
- Not yet verified: Better Auth running on Workers with the Vite plugin in development and production, the exact scopes requested by default, and the write cost of database-backed rate limiting. A short spike comes before any feature depends on this.
