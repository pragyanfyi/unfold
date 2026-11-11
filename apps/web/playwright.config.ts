import { defineConfig, devices } from "@playwright/test";

// E2E runs against the production build in the local Workers runtime (wrangler dev on the
// build output), with the AI provider replaced by aimock (ADR 0011). No Cloudflare account,
// no secrets, no real provider. `pnpm test:e2e` builds first; CI builds in an earlier step.
const APP_PORT = 4173;
const MOCK_PORT = 4010;

// Servers are never reused (Playwright's default): a stale app server could lack the provider
// override and reach the real provider, and a stale mock may not use these fixtures or --strict.
export default defineConfig({
  testDir: "e2e",
  // Output stays out of `src`, which Vitest scans.
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One retry in CI, with a trace on that retry. A test that needs it is flaky (ADR 0011).
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // WebAuthn (the passkey that encrypts the key) rejects an IP address, so use `localhost`.
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Strict: a request no fixture matches is an error, never a silent default reply.
      command: `pnpm exec llmock --fixtures e2e/fixtures --strict --port ${MOCK_PORT} --log-level warn`,
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
    },
    {
      // The variable points the server's provider adapter at the mock (loopback only).
      command: `pnpm exec wrangler dev --config dist/server/wrangler.json --port ${APP_PORT} --var UNFOLD_TEST_PROVIDER_URL:http://127.0.0.1:${MOCK_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      timeout: 120_000,
    },
  ],
});
