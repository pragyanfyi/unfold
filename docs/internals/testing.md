# Testing

Applies to `**/*.test.{ts,tsx}` and E2E tests.

> **Status: stub.** The full strategy (issue #7) lands as `docs/adr` plus an expanded version of this file. The rules below are the ones already decided.

## Rules

- Unit tests live next to the code under `apps/web/src` as `*.test.ts` / `*.test.tsx`. Vitest only discovers `src/**/*.test.{ts,tsx}` (see `apps/web/vitest.config.ts`); a test file anywhere else is silently skipped, and `--passWithNoTests` would still report success. The config is separate from `vite.config.ts` because the Cloudflare plugin cannot run inside Vitest.
- New behaviour comes with tests. A bug fix comes with a regression test that fails without the fix.
- Test behaviour, not implementation details. Prefer queries by role and label over test ids; use `data-testid` for the canvas, where roles do not apply.
- Tests must be deterministic. No real network, no real clock dependence, no reliance on test order.
- **Never use real AI provider keys or calls in tests.** Use a fake provider with scripted responses.
- Use clearly fake keys and data in fixtures.
- A flaky test is a bug. Quarantine it with a linked issue; do not retry it silently.
- Do not weaken or delete a test to make CI pass.

## TBD (decided in issue #7)

- E2E runner setup (Playwright against the local Workers runtime with local D1 and KV)
- Fake AI provider design
- Coverage expectations
- Post-deploy smoke test
