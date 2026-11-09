# Testing

Applies to `**/*.test.{ts,tsx}` and E2E tests.

> The strategy is decided in ADR 0011. Unit and component tests exist today; the E2E tooling, the fake-provider setup and the smoke test are built in issue #22 and are described here as **planned**.

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

| Layer         | Tool                             | Use it for                                       |
| ------------- | -------------------------------- | ------------------------------------------------ |
| Unit          | Vitest, node                     | Logic: stream-to-tree conversion, state, parsing |
| Component     | Vitest + jsdom + Testing Library | UI behaviour                                     |
| E2E (planned) | Playwright, Chromium only        | A few critical journeys                          |

Most tests belong at the bottom. Add an E2E test only for a journey a lower layer cannot cover.

## Fake AI provider (planned)

- **Unit and integration:** `fakeText()` from `@tanstack/ai/testing`. Script answers with `setResponses([...])` (text, tool calls, thinking or an error; an entry may be a function of the request). End the test by asserting `fake.pendingResponses() === 0` so an unconsumed script fails, and check `fake.state.callCount` when the number of model calls matters. An empty queue produces a `RUN_ERROR`; treat it as a test bug.
- **E2E:** aimock (`@copilotkit/aimock`), a local server that speaks real provider formats from fixtures. Each test sends an `X-Test-Id` header, which isolates that test's sequence counter only; fixtures that match the same requests are still shared, so give each test distinct match criteria (or another way to isolate fixture matching). Fixtures live next to the E2E tests.
- Neither is available until `@tanstack/ai` and the E2E tooling are installed. Check the open items in ADR 0011 first.

## E2E (planned)

- Playwright, Chromium only, against the production build in the local Workers runtime with a local D1 database. No Cloudflare account or secrets.
- CI retries once and records a trace on that retry. A test that passes only on retry is flaky: open an issue, mark it `test.fixme` with the link.
- Assert the canvas through `data-testid` (nodes, their text, edges). No screenshot comparison.
- Signing in: Google cannot run in CI. The approach is decided with the auth work.

## Required tests

- **Key-leak checks:** `features/chat/chat-handler.test.ts` runs the chat route with a sentinel fake key, captures `console` and stdout/stderr, and asserts the sentinel never appears in logs, the response body or headers, including when a provider error quotes the key. It also asserts the capture is not empty, so a broken spy cannot pass silently. The lint rule lives in `biome-plugins/`. Both are needed: a test alone passes if a header is logged but masked. Never log request headers on the chat route. When you add a log path, add it to the sentinel test.
- **Post-deploy smoke test (planned):** after `deploy-production`, `curl` checks that `/` returns 200 and the `version` field of `/version.json` (`{"version": "<sha>"}`) equals the released commit SHA. Failure fails the deploy run; rollback stays manual.

## Coverage

Reported once tooling exists, with no numeric threshold. New behaviour comes with tests; a bug fix comes with a regression test that fails without the fix.
