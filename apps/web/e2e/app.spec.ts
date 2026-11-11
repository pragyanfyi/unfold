import { expect, test } from "@playwright/test";

// The placeholder journey (issue #22): the built app starts in the Workers runtime and
// serves the page and the version file.
test("serves the app and the version file", async ({ page, request }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Unfold/i);
  await expect(page.getByRole("region", { name: "Interview chat" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Decision tree" })).toBeVisible();

  const version = await request.get("/version.json");
  expect(version.status()).toBe(200);
  expect(await version.json()).toEqual({ version: expect.any(String) });
});
