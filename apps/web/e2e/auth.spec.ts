import { expect, type Page, test } from "@playwright/test";
import { E2E_CONVEX_SITE_URL, E2E_CONVEX_URL, signIn } from "./support";

// Signing in and out (ADR 0016). Google cannot run in tests: it refuses automated browsers, and
// its endpoints are fixed in Convex Auth. So these tests stop the browser at Google's door and
// check what the app sent there, and sign in with the test-only password method instead
// (see `signIn` in support.ts).

const GOOGLE = "https://accounts.google.com/**";

/** Clicks Sign in and returns the Google URL the app navigated to. Google is never reached. */
async function startGoogleSignIn(page: Page): Promise<URL> {
  await page.route(GOOGLE, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Google (stub)</title>" }),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(GOOGLE);
  return new URL(page.url());
}

test("Sign in leaves for Google with our backend's callback and PKCE", async ({ page }) => {
  await page.goto("/");
  const google = await startGoogleSignIn(page);
  expect(google.searchParams.get("client_id")).toBe("placeholder-google-client-id");
  expect(google.searchParams.get("redirect_uri")).toBe(
    `${E2E_CONVEX_SITE_URL}/oauth/google/callback`,
  );
  expect(google.searchParams.get("code_challenge_method")).toBe("S256");
  expect(google.searchParams.get("state")).toBeTruthy();
});

test("a cancelled Google sign-in comes back signed out, with a message", async ({ page }) => {
  await page.goto("/");
  const google = await startGoogleSignIn(page);
  // What Google does when the user cancels: back to our backend's callback with an error.
  const callback = new URL(google.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("error", "access_denied");
  callback.searchParams.set("state", google.searchParams.get("state") ?? "");
  await page.goto(callback.href);
  await expect(page).toHaveURL(/^http:\/\/localhost:4173\//);
  await expect(page.getByText("Google sign-in was cancelled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("a session survives a reload, and Sign out ends it", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const suffix = E2E_CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `__convexAuthRefreshToken_${suffix}`),
  ).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
