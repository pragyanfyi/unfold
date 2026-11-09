# 9. Database: Cloudflare D1 with Drizzle

- Status: Accepted
- Date: 2026-11-08

## Context

Accounts and synced conversations need a database that runs on Cloudflare's free tier next to the Worker. Better Auth (ADR 0008) needs tables of its own.

## Decision

- **D1** (SQLite), bound to the Worker as `DB`.
- **Drizzle ORM, stable line:** `drizzle-orm` 0.45.x and `drizzle-kit` 0.31.x. Drizzle 1.0 was still at release-candidate stage on npm on 2026-11-08, and Drizzle's own D1 page now tells you to install `@rc`; follow the 0.45 documentation, not the page's `@rc` snippets. Better Auth 1.7.x accepts both ranges (source: npm registry metadata for `drizzle-orm`, `drizzle-kit` and `better-auth`, read 2026-11-08).
- **Schema flow:** `auth generate` (Better Auth CLI) produces the Drizzle schema for the auth tables; our own tables sit beside them; `drizzle-kit generate` writes SQL migrations that are committed. Better Auth's programmatic `getMigrations` does not work with the Drizzle adapter (source: Better Auth, "Database", read 2026-11-08).
- **Applying migrations:** `wrangler d1 migrations apply DB --local` in development, and `--remote` for production, run **by the maintainer by hand** for now. Automating it in the release workflow needs D1 edit permission on the CI token (ADR 0005) and is a later decision. Wrangler needs `migrations_dir` pointed at Drizzle's output, and `migrations_pattern` if the layout is nested (source: Cloudflare, "D1 migrations", read 2026-11-08).
- **CI check:** when the first migration lands, CI applies all migrations to a disposable local D1 database (`wrangler d1 migrations apply DB --local`, no secrets needed) so a broken migration fails the PR. This is built with the first schema, since there are no migrations yet. Production application stays manual and separate.
- **Migrations must be backward compatible.** Each migration must work with the code of the previous release (add before use, remove only after nothing reads it), because the old code serves traffic between a migration and the next deploy, and rolling code back does not roll the schema back. D1 Time Travel gives point-in-time recovery: 7 days on the free plan, 30 on paid (source: Cloudflare, "D1 limits", read 2026-11-08).
- **Bindings:** read through `import { env } from "cloudflare:workers"`, which is allowed at module scope (source: Cloudflare, "Bindings", read 2026-11-08). Build the Drizzle instance in a helper, and keep no request-derived state at module scope. This replaces the stricter wording in `docs/internals/data-fetching.md`.
- **Read replication (the D1 Sessions API, beta) is not used.**

## Consequences

- **Free-tier budget:** 100,000 rows written per day, 5 million rows read per day, **500 MB per database** and 5 GB per account; paid raises the database cap to 10 GB (source: Cloudflare, "D1 pricing" and "D1 limits", read 2026-11-08). Storage is the likely first limit, so store conversation trees compactly.
- **A single row is capped at 2 MB** (same source). A whole conversation tree as one JSON value could outgrow that; design the sync schema around nodes or chunks, not one blob.
- Developers need to run local migrations after pulling schema changes. This goes in `docs/operations/development.md` when the database lands.
- Not yet verified: how local D1 is persisted with the Cloudflare Vite plugin, and whether Drizzle 0.45's migration folder layout needs `migrations_pattern`. Both are checked in the first implementation.
