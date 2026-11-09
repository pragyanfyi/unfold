# 3. Bring-your-own-key (BYOK) handling

- Status: Proposed
- Date: 2026-11-07

## Context

Unfold has no AI gateway. Users supply their own provider API keys. We must be precise about where keys live and travel, because users will trust us with credentials that have billing attached.

The TanStack AI BYOK documentation (https://tanstack.com/ai/latest/docs/advanced/byok, read 2026-11-07) describes this model:

- Keys are kept in the browser. `defaultByokStorage()` uses passkey-encrypted storage when WebAuthn is available in a secure context, and tab memory otherwise (with a warning).
- If WebAuthn is available but the authenticator has no PRF support, the first save throws. It does not fall back to memory. The docs name no capability check or error class for this case (https://tanstack.com/ai/latest/docs/api/ai-client, read 2026-11-08).
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
- The key entry UI must handle a failed save explicitly (the no-PRF case above): catch the error, explain it, and never silently store the key elsewhere. Whether to offer an opt-in memory-only mode for that case is an open question to settle by amending this ADR before building it; a custom storage implementation could provide it, but the docs do not present that as the recommended route.
- To be verified during implementation: actual data flow, CSP effectiveness, and the behaviour of each supported provider.

## Implementation notes (#26)

Checked 2026-11-09 against `@tanstack/ai` 1.3.0, `@tanstack/ai-client` 1.1.0, `@tanstack/ai-react` 1.0.2 and `@tanstack/ai-anthropic` 1.1.1 (installed source, tests, and one run of the built Worker). The first provider is Anthropic only.

**Decided**

- **No-PRF failure: fail explicitly, no fallback.** Decided by the maintainer on 2026-11-09. The key dialog catches the error from `byok.update()`, shows a fixed message that the key was not saved and is not kept any other way, and keeps the dialog open. There is no memory-only mode. If one is wanted later, amend this ADR first.
- **Chat route validation.** The route parses the AG-UI body with the library's `chatParamsFromRequestBody`, then adds its own limits: body at most 1,000,000 bytes (checked on the declared length, and counted while streaming so a chunked body is cut off at the limit), 1 to 400 messages, provider from an allow-list, key at most 512 characters. Tools declared by the client are ignored; the model gets only ours. Error responses are fixed strings and never echo the body or headers.

**Verified**

- **Key flow.** The key travels only in `x-byok-anthropic`, never in the body, and reaches only the Anthropic adapter (test: `client-to-route.test.ts`, real chat client against the real handler, fake model).
- **No env fallback.** `getByokKey(request, "anthropic")` with a plain slug is header-only, per the library's own doc comment in `byok/get-key.d.ts`. The handler uses the slug form, and a test sets `ANTHROPIC_API_KEY` and still gets 401.
- **The library logs errors by default, with the whole error object.** `@tanstack/ai` writes caught errors to `console.error` unless told otherwise (seen in a run of the built Worker). The route sets `debug.logger` to a logger that keeps only a scrubbed message and turns every other category off. A test fails if that option is removed.
- **A thrown error becomes a `RUN_ERROR` message in the response.** The route rethrows a fresh error with a scrubbed message, and scrubs `RUN_ERROR` chunks, so a key quoted by a provider or proxy does not return to the browser.
- **Lint rule.** Two Biome GritQL plugins (`biome-plugins/`) apply to the chat path: no `console` calls, and no `.headers` passed to a log call. `safe-log.ts` is the only place that writes logs. The rules are lexical, so they catch obvious mistakes, not every route to a log; the sentinel test is the backstop.
- **CSP.** `src/start.ts` sets a per-response nonce policy (`script-src 'self' 'nonce-…'`, `connect-src 'self'`, no `unsafe-eval`). In a run of the built Worker the header was present on pages and API responses, and every inline script carried the nonce. `style-src` keeps `'unsafe-inline'` because Radix and React Flow set inline styles; that weakens style injection, not script execution.

**Not verified**

- Real passkey and PRF behaviour. Tests use a fake keyring storage and throw the library's error by hand; the no-PRF check reads the library's message text (`"This authenticator does not support the WebAuthn PRF extension"`), so a reworded message falls back to a generic "not saved" message. No real authenticator, and not Chromium's emulated one (ADR 0011), was run.
- That the page hydrates and the dialog works in a real browser under the CSP. The headers and nonces were checked with `curl`, not a browser.
- Behaviour against a real Anthropic model. One request with an obviously fake key reached the real Anthropic API and came back as a 401 `RUN_ERROR`; nothing else was sent. A real key was never used.
- Items left open by ADR 0011 (read 2026-11-09, from the installed package source, not the docs site): `@tanstack/ai/testing` exists in `@tanstack/ai` 1.3.0 and exports `fakeText` (`dist/esm/testing.d.ts`), so that item is settled. `FakeTextAdapter` declares a `structuredOutput` method that answers with the next queued response, whose text must be JSON (`dist/esm/testing/fake-text.d.ts`); we did not run it, so structured output with `fakeText()` stays unverified. `createAnthropicChat(model, key, config)` takes a `config` derived from the Anthropic SDK's client options (`@tanstack/ai-anthropic` 1.1.1, `dist/esm/adapters/text.d.ts` and `utils/client.d.ts`), so a base URL override looks possible, but we did not exercise it; that belongs to the E2E tooling (#22). ADR 0011 is Accepted and immutable, so these answers are recorded here.
- That the passkey keyring is not readable by script. The library stores the encrypted keyring in IndexedDB (database `byok` by default); rule 5 forbids `localStorage`, and this is the library's own store, not ours. We did not audit its crypto.
