import type { Page } from "@playwright/test";

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
