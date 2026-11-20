import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY, signIn } from "./support";

// The onboarding flow of ADR 0016 in a real browser: the signed-out home, the idea kept across
// the Google redirect, the stepper dialog, and the interview starting once the key is saved.
// Google itself is stopped at the door (see auth.spec.ts); the return is played by signing the
// browser in with the test-only method and loading the page again, as Google's redirect would.

test.use({ reducedMotion: "reduce" });

const IDEA = "E2E-IDEA-JOURNEY onboarding";

// The composer by its label, not its role: an open modal dialog hides the page behind it from
// role queries, and the idea is checked while the dialog is open.
const composer = (page: Page) => page.locator('textarea[aria-label="Your idea"]');

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

/** Lets the dialog finish its open animation, so axe does not measure a half-faded colour. */
async function settled(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await addPasskeyAuthenticator(page);
  await page.route("https://accounts.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Google (stub)</title>" }),
  );
});

test("a new user: idea, sign in, key, and the interview starts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Think an idea all the way through")).toBeVisible();
  await expect(page.getByText(/sign in with Google, then add your own API key/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole("textbox", { name: "Your idea" }).fill(IDEA);
  await page.getByRole("textbox", { name: "Your idea" }).press("Enter");
  let dialog = await settled(page);
  await expect(dialog.getByRole("heading", { name: "Before your first interview" })).toBeVisible();
  await expect(dialog.locator("[aria-current=step]")).toHaveText(/Sign in/);
  await expectNoViolations(page);

  await dialog.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("https://accounts.google.com/**");

  // Google sends the user back signed in.
  await signIn(page);
  await page.goto("/");
  dialog = await settled(page);
  await expect(composer(page)).toHaveValue(IDEA);
  await expect(dialog.locator("[aria-current=step]")).toHaveText(/Add your key/);
  await expect(dialog.getByRole("link", { name: /Create a key at Anthropic/ })).toBeVisible();
  await expectNoViolations(page);

  await dialog.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("form", { name: "Questions for this round" })).toBeVisible();
  // The idea shows as sent, and is no longer kept for a redirect.
  await expect(page.locator("[data-slot=bubble-content]", { hasText: IDEA })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("unfold.pendingIdea"))).toBeNull();
});

test("cancelling the dialog keeps the idea in the composer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your idea" }).fill(IDEA);
  await page.getByRole("button", { name: "Send" }).click();
  await settled(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Your idea" })).toHaveValue(IDEA);
});

test("signed out on a saved idea's address, asks to sign in from home", async ({ page }) => {
  await page.goto("/c/0190f0f0-0000-7000-8000-000000000000");
  await expect(page).toHaveURL(/localhost:4173\/$/);
  const dialog = await settled(page);
  await expect(dialog.locator("[aria-current=step]")).toHaveText(/Sign in/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Saved ideas" })).toContainText(
    "Sign in to see your ideas.",
  );
});

test("signing out from an interview goes back to an empty home", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your idea" }).fill(IDEA);
  await page.getByRole("button", { name: "Send" }).click();
  const dialog = await settled(page);
  await dialog.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("form", { name: "Questions for this round" })).toBeVisible();
  await expect(page).toHaveURL(/\/c\//);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/localhost:4173\/$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Think an idea all the way through")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});
