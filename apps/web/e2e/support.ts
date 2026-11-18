import type { Page } from "@playwright/test";
import { api } from "@unfold/backend/convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";

// A clearly fake key. The mock provider never checks it, and it must never be a real one.
export const FAKE_KEY = "sk-ant-FAKE-E2E-KEY-0000000000";

// The key is saved encrypted with a passkey (ADR 0003). Headless Chromium has no
// authenticator, so each test adds a virtual one. `hasPrf` is needed because the library
// derives the encryption key from the passkey's PRF output.
export async function addPasskeyAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
}

// The E2E Convex backend (packages/backend/scripts/e2e-backend.mjs), as in apps/web/.env.e2e.
export const E2E_CONVEX_URL = "http://127.0.0.1:3230";
export const E2E_CONVEX_SITE_URL = "http://127.0.0.1:3231";

/**
 * Signs the page's browser context in as a new user of its own (ADR 0016). Google cannot run in
 * tests, so the user is created with the test-only password method, which only the E2E backend
 * allows, and the session is handed to the app where Convex Auth keeps it: `localStorage`,
 * keyed by the deployment URL. Call it before the first navigation.
 *
 * A user per test keeps parallel tests apart: they never share a session or refresh token.
 *
 * Returns the user's access token, for tests that read the backend as that user.
 */
export async function signIn(page: Page): Promise<string> {
  const client = new ConvexHttpClient(E2E_CONVEX_URL);
  const result = await client.mutation(api.auth.signUpWithUsernamePassword, {
    username: `e2e-${crypto.randomUUID()}`,
    password: "correct horse battery staple",
  });
  if (result.status !== "complete") throw new Error(`E2E sign-up failed: ${result.status}`);
  const suffix = E2E_CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "");
  await page.context().addInitScript(
    ({ suffix, accessToken, refreshToken }) => {
      // Only once per context: later pages keep what the app did since (a sign-out, a token
      // the app has rotated).
      if (localStorage.getItem("e2e-session-seeded")) return;
      localStorage.setItem("e2e-session-seeded", "1");
      localStorage.setItem(`__convexAuthJWT_${suffix}`, accessToken);
      localStorage.setItem(`__convexAuthRefreshToken_${suffix}`, refreshToken);
    },
    { suffix, accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken },
  );
  return result.tokens.accessToken;
}

/** A Convex client signed in as the user `signIn` created. */
export function backendAs(accessToken: string): ConvexHttpClient {
  const client = new ConvexHttpClient(E2E_CONVEX_URL);
  client.setAuth(accessToken);
  return client;
}
