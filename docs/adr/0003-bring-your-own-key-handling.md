# 3. Bring-your-own-key (BYOK) handling

- Status: Proposed
- Date: 2026-11-07

## Context

Unfold has no AI gateway. Users supply their own provider API keys. We must be precise about where keys live and travel, because users will trust us with credentials that have billing attached.

The TanStack AI BYOK documentation (https://tanstack.com/ai/latest/docs/advanced/byok, read 2026-11-07) describes this model:

- Keys are kept in the browser, passkey-encrypted when supported and in tab memory otherwise.
- The browser sends the key in an `x-byok-*` request header to the app's own server route, which calls the provider and does not store the key.
- The only explicit warning in the docs is not to log raw keys.
- The docs do not discuss XSS, CSP or CORS.
- A server-side environment-key fallback exists and can be switched on.

## Decision

Adopt the TanStack AI BYOK mechanism as documented.

1. Keys are never written to D1, KV, logs, analytics or error reports.
2. The server-side env-key fallback stays disabled in the hosted deployment.
3. Raw keys are never logged. Anything key-like is masked before it reaches a log line.
4. We state in `SECURITY.md` that keys pass through our server in transit.
5. Because keys live in script-accessible browser state, we ship a strict Content-Security-Policy and treat XSS as high severity.
6. We add automated checks (tests and lint rules) that logging code paths cannot receive request headers containing key material.

## Consequences

- Simple and consistent with the library, no custom crypto.
- Users must trust that the hosted server does not log headers. Self-hosting remains possible.
- Passkey prompts need a direct user gesture on some browsers, which affects the key entry UI.
- To be verified during implementation: actual data flow, CSP effectiveness, and the behaviour of each supported provider.
