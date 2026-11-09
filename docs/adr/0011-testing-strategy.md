# 11. Testing strategy

- Status: Accepted
- Date: 2026-11-09

## Context

Unfold has a chat that streams from an AI provider, a canvas that renders a tree, and a server that must never leak provider keys (ADR 0003). We need tests that are deterministic, free to run, and need no real keys, and a plan small enough for a project this size. This ADR records the plan; the tooling is built in a follow-up issue.

What we checked (all read 2026-11-09):

- TanStack AI ships a scripted fake model, `fakeText()`, at `@tanstack/ai/testing` (a subpath of `@tanstack/ai`). It answers from a queue (`setResponses`, `appendResponses`), supports text, tool calls, thinking and errors, accepts functions that see the request, and exposes `state.callCount` and `pendingResponses()`. An empty queue ends the call with a `RUN_ERROR`. It is a text adapter only. Source: TanStack AI, "Test with a Fake Model".
- TanStack's own E2E suite drives a Start app with Playwright against **aimock** (`@copilotkit/aimock`, MIT), a local server that answers in real provider wire formats from fixtures, with a per-test `X-Test-Id` header for isolation and a record mode. It runs Chromium, retries twice in CI and traces on first retry. Source: `testing/e2e` in the TanStack/ai repository, and the aimock README.

## Decision

1. **Three layers, most tests at the bottom.**
   - **Unit** (Vitest, node): logic such as stream-to-tree conversion, state and parsing. Use `fakeText()` wherever a model is needed.
   - **Component** (Vitest, jsdom, Testing Library): UI behaviour, queried by role and label.
   - **E2E** (Playwright, **Chromium only**): a handful of critical journeys, for example start an interview, watch the tree grow, reload and find it again; stop a generation; show a provider error; a missing key gives 401.
2. **Fake AI provider.** `fakeText()` for unit and integration tests. **aimock** for E2E, so the real provider adapter and the BYOK header path run, with a test-only provider base URL. We do not write our own fake server. Real keys and real provider calls are never used in tests.
3. **E2E target.** The production build running in the local Workers runtime with a local D1 database, no Cloudflare account or secrets.
4. **Canvas.** Assert semantic state through `data-testid` (which nodes exist, their text, which edges connect them). No screenshot or pixel comparison for now.
5. **Coverage.** Reported once tooling exists, with **no numeric threshold**. The rule is behaviour-based: new behaviour comes with tests, a bug fix with a regression test.
6. **Flaky tests.** CI retries E2E once and records a trace on that retry. A test that passes only on retry is flaky and needs a linked issue. Quarantine is `test.fixme` plus that issue; never a silent retry and never deleting the test.
7. **CI.** E2E runs on every pull request once at least one real journey exists, and becomes a required check only after it has proven stable (a separate decision). Unit and component tests stay in the existing required `Check`.
8. **Key-leak test.** One test runs the chat route with a sentinel fake key, captures everything written to logs and error output, and asserts the sentinel never appears. This implements item 6 of ADR 0003.
9. **Post-deploy smoke test.** After `deploy-production`, a `curl` step checks that `/` returns 200 and that `/version.json` equals the released commit SHA. A failure fails the deploy run; rollback stays manual (`docs/operations/deployment.md`). No browser, no sign-in, no AI.
10. **Auth in E2E.** Google sign-in cannot run in CI. How tests sign in (likely a seeded session) is decided in the Better Auth spike, then recorded in a new ADR.

## Consequences

- Tests are free, offline and repeatable; CI needs no secrets.
- One new dev dependency family (Playwright, aimock), added by the follow-up issue, not by this ADR.
- The key-leak and smoke tests give ADR 0003 and the update toast (ADR 0007) an automated check.
- Not yet verified, to be settled when the tooling is built: that the TanStack AI provider adapters accept a base URL override; that a local Worker can reach a mock on localhost; whether Chromium's emulated passkey authenticator supports the PRF extension that TanStack's passkey key storage needs (the fallback is the in-memory mode); whether `fakeText()` supports structured output (`outputSchema`); and that `@tanstack/ai/testing` exists in the released package version we install (we read the repository's main branch, which showed 1.2.0).
