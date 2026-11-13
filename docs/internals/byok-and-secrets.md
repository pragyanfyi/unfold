# BYOK and secrets

Applies to everything that touches API keys, tokens or other credentials. Background and reasoning: [ADR 0003](../adr/0003-bring-your-own-key-handling.md) and [SECURITY.md](../../.github/SECURITY.md).

## How it works

Unfold has no AI gateway. Users bring their own provider key (Anthropic only for now). The key is kept in the browser by the TanStack AI keyring (`features/byok/key-store.ts`): passkey-encrypted when supported, tab memory otherwise. On each chat request the client sends it in the `x-byok-anthropic` header to Unfold's own route (`routes/api/chat.ts`, handler in `features/chat/chat-handler.ts`), which calls the provider and does not store the key. So the key transits our server but is never persisted by us. What was verified, and what was not, is in the implementation notes of [ADR 0003](../adr/0003-bring-your-own-key-handling.md).

If you change anything that alters this, update ADR 0003 and `SECURITY.md` in the same PR.

## On the chat path (`features/chat`, `features/byok`, `routes/api`)

- Log only through `logSafe` (`features/chat/safe-log.ts`). It takes named primitive fields and masks key-shaped text. Biome plugins in `biome-plugins/` reject `console` calls and `.headers` passed to a log call here; do not disable them. They are lexical, so review is still needed.
- Do not log, return or attach to an error anything from a provider error or a request header. Error responses are fixed strings.
- The same goes for the user's conversation: messages and the tree outline (`forwardedProps.outline`) go to the model and never to a log or an error response. `chat-handler.test.ts` checks the outline with a sentinel.
- The AI library logs caught errors itself. The chat route replaces that logger (`libraryLogger`); any new `chat()` call on the server must pass the same `debug` option. `libraryLogger` keeps the library's own label for the error and drops the error itself, because a provider's message can quote the user's conversation. `chat-handler.test.ts` checks this with a sentinel; if it fails after a library upgrade, the library has started putting error text in the label.
- Read the key with `getByokKey(request, "<slug>")` (header only). Never pass a `ByokProvider` descriptor that has `env` names to the server helpers: that turns on the environment fallback.
- Changing the CSP (`features/security/csp.ts`) needs the key risk in mind: do not add `unsafe-inline` or `unsafe-eval` to `script-src`, or a host to `connect-src`.

## Rules

1. Provider keys are never written to D1, KV, logs, analytics, error reports or any file.
2. Never log request headers wholesale. Log named, safe fields only.
3. If a key could appear in a string (an error message, a URL, a stack trace), mask it before it reaches a log or an error report.
4. The server-side environment-key fallback in the BYOK helper stays disabled in the hosted deployment.
5. Keys never go in URLs, query strings, cookies, `localStorage`, query keys, or persisted TanStack Query cache.
6. A key may be sent only to Unfold's own server route (the documented hop) and from there to the provider the user selected. Never send it to any other host.
7. Treat XSS as a key-theft risk: no `dangerouslySetInnerHTML` without sanitising, and keep the Content-Security-Policy strict.
8. Tests and fixtures use obviously fake keys. Never paste a real key into code, tests, issues, PRs or screenshots.
9. Use the library's key helpers rather than custom key storage or crypto.
10. Handle a failed key save explicitly (`describeSaveError`, `key-dialog.tsx`). Per the TanStack AI docs, the memory-only fallback applies only when WebAuthn is unavailable. If WebAuthn is available but the authenticator lacks PRF support, the first save throws (a rejected promise from `byok.update()`), and the docs describe no way to detect this in advance. Catch the error, show a clear message, and never silently store the key anywhere else. Any decision to offer a memory-only option on this failure needs an ADR 0003 update first.

## Repo secrets

- Secrets for CI and deployment live in GitHub Actions secrets or variables, never in the repo.
- `.env`, `.dev.vars` and similar are git-ignored; commit only `*.example` files with fake values.
- Pin third-party GitHub Actions to a commit SHA; give each job the minimum `permissions`.

## Before merging a change that touches keys

- Read ADR 0003.
- Check the TanStack AI BYOK docs for behaviour changes.
- Confirm no new log line can contain a key.
