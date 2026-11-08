# BYOK and secrets

Applies to everything that touches API keys, tokens or other credentials. Background and reasoning: [ADR 0003](../adr/0003-bring-your-own-key-handling.md) and [SECURITY.md](../../.github/SECURITY.md).

## What is true by design

Unfold has no AI gateway. Users bring their own provider key. Following the TanStack AI BYOK mechanism, the key is kept in the browser (passkey-encrypted when supported, tab memory otherwise). On each AI request it is sent in a request header to Unfold's own server route, which calls the provider and does not store the key. So the key transits our server but is never persisted by us.

If you change anything that alters this, update ADR 0003 and `SECURITY.md` in the same PR.

## Rules

1. Provider keys are never written to D1, KV, logs, analytics, error reports or any file.
2. Never log request headers wholesale. Log named, safe fields only.
3. If a key could appear in a string (an error message, a URL, a stack trace), mask it before it reaches a log or an error report.
4. The server-side environment-key fallback in the BYOK helper stays disabled in the hosted deployment.
5. Keys never go in URLs, query strings, cookies, `localStorage`, query keys, or persisted TanStack Query cache.
6. Do not send keys to any host other than the provider the user selected.
7. Treat XSS as a key-theft risk: no `dangerouslySetInnerHTML` without sanitising, and keep the Content-Security-Policy strict.
8. Tests and fixtures use obviously fake keys. Never paste a real key into code, tests, issues, PRs or screenshots.
9. Use the library's key helpers rather than custom key storage or crypto.

## Repo secrets

- Secrets for CI and deployment live in GitHub Actions secrets or variables, never in the repo.
- `.env`, `.dev.vars` and similar are git-ignored; commit only `*.example` files with fake values.
- Pin third-party GitHub Actions to a commit SHA; give each job the minimum `permissions`.

## Before merging a change that touches keys

- Read ADR 0003.
- Check the TanStack AI BYOK docs for behaviour changes.
- Confirm no new log line can contain a key.
