# Testing

Applies to `**/*.test.{ts,tsx}` and E2E tests.

> The strategy is decided in ADR 0011. Unit, component and E2E tests exist, and the post-deploy smoke test runs in `deploy-production.yml`.

## Rules

- Unit tests live next to the code under `apps/web/src` as `*.test.ts` / `*.test.tsx`. Vitest only discovers `src/**/*.test.{ts,tsx}` (see `apps/web/vitest.config.ts`); a test file anywhere else is silently skipped, and `--passWithNoTests` would still report success. The config is separate from `vite.config.ts` because the Cloudflare plugin cannot run inside Vitest.
- Tests that need a DOM (components, hooks) put `// @vitest-environment jsdom` at the top of the file and use Testing Library (`@testing-library/react`); everything else runs in node. Stub `fetch` and `window.location` rather than touching the network.
- New behaviour comes with tests. A bug fix comes with a regression test that fails without the fix.
- Test behaviour, not implementation details. Prefer queries by role and label over test ids; use `data-testid` for the canvas, where roles do not apply.
- Tests must be deterministic. No real network, no real clock dependence, no reliance on test order.
- **Never use real AI provider keys or calls in tests.** Use a fake provider with scripted responses.
- Use clearly fake keys and data in fixtures.
- A flaky test is a bug. Quarantine it with a linked issue; do not retry it silently.
- Do not weaken or delete a test to make CI pass.

## Layers

| Layer     | Tool                             | Use it for                                       |
| --------- | -------------------------------- | ------------------------------------------------ |
| Unit      | Vitest, node                     | Logic: stream-to-tree conversion, state, parsing |
| Component | Vitest + jsdom + Testing Library | UI behaviour                                     |
| E2E       | Playwright, Chromium only        | A few critical journeys                          |

Storage (`features/storage`) is tested in node against `fake-indexeddb`, behind the `ConversationStore` interface, so chat and UI tests do not need IndexedDB. Quota, eviction, private browsing and cross-tab races cannot be reproduced there.

Most tests belong at the bottom. Add an E2E test only for a journey a lower layer cannot cover.

## Fake AI provider

- **Unit and integration:** `fakeText()` from `@tanstack/ai/testing`. Script answers with `setResponses([...])` (text, tool calls, thinking or an error; an entry may be a function of the request). End the test by asserting `fake.pendingResponses() === 0` so an unconsumed script fails, and check `fake.state.callCount` when the number of model calls matters. An empty queue produces a `RUN_ERROR`; treat it as a test bug. Structured output is supported (`structuredOutput()` answers with the next queued response, whose `text` must be JSON); this was read from the source, not exercised yet.
- **E2E:** aimock (`@copilotkit/aimock`), a local server that speaks real provider formats from fixtures in `apps/web/e2e/fixtures/*.json`. It runs with `--strict`, so a request no fixture matches fails loudly (look for `STRICT: No fixture matched` in the web server output; Playwright does not turn it into a test failure by itself).
- **Isolation between tests:** tests share one aimock server and run in parallel. Each test sends an idea that carries its own marker (`E2E-IDEA-<NAME>`), and fixtures match on that marker plus **stateless** request properties: `hasToolResult` for the first reply, `toolResultContains` for the reply to a given answer. Avoid `turnIndex` (a resumed request carries more assistant messages than rounds, and aimock silently relaxes the match) and `sequenceIndex` (a server-side counter that breaks under parallel tests). The `X-Test-Id` header is not used: the browser would have to send it and the Worker forward it to the provider, which would put test code in the key path for no gain.
- **How the Worker reaches the mock:** the server reads `UNFOLD_TEST_PROVIDER_URL` from its own environment (never from the request) and passes it as `baseURL` to the Anthropic adapter (`features/chat/test-provider-url.ts`). Only `http://` loopback hosts are honoured, so a mistaken production setting cannot send a key to a remote host. `playwright.config.ts` sets it with `wrangler dev --var`.

## E2E

- Playwright, Chromium only, against the production build served by `wrangler dev` on `dist/server/wrangler.json` (the local Workers runtime), with aimock as the provider. No Cloudflare account or secrets. There is no server database yet; when D1 is bound (ADR 0009), the same local runtime provides a local D1. Saved conversations live in the browser's IndexedDB (ADR 0013); each test has its own browser context, so each starts empty.
- Run `pnpm test:e2e` from the repo root (it builds first). Specs are in `apps/web/e2e`. Vitest does not run them, and Playwright does not run `src`.
- The app is served at `http://localhost:4173`, not `127.0.0.1`: WebAuthn rejects an IP address as the origin.
- **Passkeys:** saving a key uses a passkey whose PRF output encrypts it (ADR 0003). Chromium's virtual authenticator supports PRF (`hasPrf: true`, see `e2e/support.ts`), so tests can save a key through the real dialog. Add it before the first navigation.
- Keys in tests are clearly fake (`FAKE_KEY` in `e2e/support.ts`). Never use a real key.
- CI job `E2E (Playwright)` runs on every PR, retries once and records a trace on that retry. It is **not** in the required `Check` yet. A test that passes only on retry is flaky: open an issue, mark it `test.fixme` with the link.
- Assert the canvas through `data-testid` (nodes, their text, edges). No screenshot comparison. The layout spec saves screenshots to `test-results/` for a human to look at; it asserts on bounding boxes and visibility, never on pixels.
- **Layout needs a real browser.** jsdom has no layout engine, so a CSS ordering bug (the Tabs `flex-col` beating `md:flex-row`) passed every component test. Layout rules belong in `e2e/layout.spec.ts`.
- Signing in: Google cannot run in CI. The approach is decided with the auth work.

## Required tests

- **Key-leak checks:** `features/chat/chat-handler.test.ts` runs the chat route with a sentinel fake key, captures `console` and stdout/stderr, and asserts the sentinel never appears in logs, the response body or headers, including when a provider error quotes the key. It also asserts the capture is not empty, so a broken spy cannot pass silently. The lint rule lives in `biome-plugins/`. Both are needed: a test alone passes if a header is logged but masked. Never log request headers on the chat route. When you add a log path, add it to the sentinel test.
- **Post-deploy smoke test:** the last step of `deploy-production.yml` checks that `/` returns 200 and the `version` field of `/version.json` (`{"version": "<sha>"}`) equals the released commit SHA. It retries for about a minute, since a new version takes a moment to spread. Failure fails the deploy run; rollback stays manual. This step has only been run against a local build, not yet by a real release.

## Coverage

`pnpm test:coverage` reports unit and component coverage (V8, text summary and an HTML report in `apps/web/coverage`), with no numeric threshold. CI runs it in the E2E job and uploads the report. New behaviour comes with tests; a bug fix comes with a regression test that fails without the fix.
