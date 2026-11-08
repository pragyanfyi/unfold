# 10. Caching: Workers KV is not used yet

- Status: Accepted
- Date: 2026-11-08

## Context

KV was part of the original stack list, mainly for caching and as a possible home for Better Auth's sessions. Before building on it we checked what the free plan and its consistency model allow.

## Decision

- **No KV namespace, binding or token permission for now.**
- **Not for auth.** Sessions and rate-limit counters stay in D1 (ADRs 0008 and 0009).
- **Why:**
  - The free plan allows **1,000 key writes per day** and 100,000 reads (source: Cloudflare, "KV pricing", read 2026-11-08). A rate-limit counter written on every request, or a session written on each sign-in and refresh, would use that quickly.
  - KV is eventually consistent. A change is usually visible where it was made, but may take **60 seconds or more** elsewhere, and "key not found" answers are cached too (source: Cloudflare, "How KV works", read 2026-11-08). For sessions that means a sign-out or revocation can lag, and a new session can look missing.
- **When KV is worth adding.** The data is read often and changes rarely, ~60 seconds of staleness is harmless, and writes stay well under the free limit. Each use gets its own ADR with a write-budget estimate.
- `/version.json` (ADR 0007) is a static asset, not KV.

## Consequences

- The stack in `AGENTS.md` and the README no longer lists KV as in use.
- No KV setup, no extra token permission, and nothing to keep in sync.
- If a caching need appears, the HTTP cache and static assets (free and unlimited) come first, then KV.
