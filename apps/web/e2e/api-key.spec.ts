import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY, signIn } from "./support";

// Replacing and removing a saved key from the header (#47). Both keys are clearly fake.
const SECOND_KEY = "sk-ant-FAKE-E2E-KEY-REPLACED-1111";

test.use({ reducedMotion: "reduce" });

test("the header shows the saved key, masked, and replaces and removes it", async ({ page }) => {
  await addPasskeyAuthenticator(page);
  await signIn(page);
  await page.goto("/");
  // The app header sits inside <main>, so it is not a banner landmark; the names are unique.
  const addInHeader = page.getByRole("button", { name: "Add API key", exact: true });

  // No key yet: the header offers to add one.
  await expect(addInHeader).toBeVisible();
  await page.getByRole("button", { name: "Add your API key" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await page.getByRole("dialog").getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Unfold needs your own API key")).toBeHidden();

  // Set: the header shows that, never the key itself.
  const keyButton = page.getByRole("button", { name: /^API key / });
  await expect(keyButton).toContainText("0000");
  await expect(keyButton).not.toContainText(FAKE_KEY);

  // Replace.
  await keyButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Saving a new key replaces it");
  const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  await dialog.getByRole("textbox", { name: "API key" }).fill(SECOND_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(dialog).toBeHidden();
  await expect(keyButton).toContainText("1111");
  await expect(page.locator("body")).not.toContainText(SECOND_KEY);

  // Remove: the app is back to having no key, and focus is on the key field.
  await keyButton.click();
  await dialog.getByRole("button", { name: "Remove key" }).click();
  await expect(dialog.getByRole("button", { name: "Remove key" })).toBeHidden();
  await expect(dialog.getByRole("textbox", { name: "API key" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(addInHeader).toBeVisible();
  await expect(page.getByText("Unfold needs your own API key")).toBeVisible();

  // Still gone after a reload.
  await page.reload();
  await expect(addInHeader).toBeVisible();
});
