import { expect, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY } from "./support";

// The two-pane layout in a real browser (ADR 0012). jsdom has no layout engine, so a CSS
// ordering bug (flex-col beating md:flex-row in the Tabs) passed every component test.

async function startInterview(page: Page) {
  await addPasskeyAuthenticator(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add Anthropic API key" }).click();
  await page.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  // The saved key has no visible control afterwards, so the prompt going away is the signal.
  await expect(page.getByText("Unfold needs your own Anthropic API key.")).toBeHidden();
  await page.getByRole("textbox", { name: "Your idea" }).fill("E2E-IDEA-LAYOUT a layout check");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Which layout question comes first?").first()).toBeVisible();
}

test.describe("desktop 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows chat and canvas side by side, without tabs", async ({ page }, testInfo) => {
    await startInterview(page);
    await expect(page.getByRole("tab", { name: "Chat" })).toBeHidden();

    const chat = await page.getByRole("region", { name: "Interview chat" }).boundingBox();
    const canvas = await page.getByRole("region", { name: "Decision tree" }).boundingBox();
    if (!chat || !canvas) throw new Error("a pane has no box");
    // Side by side: the canvas starts to the right of the chat, and both span the viewport height.
    expect(canvas.x).toBeGreaterThanOrEqual(chat.x + chat.width - 1);
    expect(chat.height).toBeGreaterThan(700);
    expect(canvas.height).toBeGreaterThan(700);

    await page.screenshot({ path: testInfo.outputPath("desktop-1280x800.png") });
  });
});

test.describe("mobile 390x800", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("shows one pane at a time and switches with the tabs", async ({ page }, testInfo) => {
    await startInterview(page);
    const chat = page.getByRole("region", { name: "Interview chat" });
    const canvas = page.getByRole("region", { name: "Decision tree" });

    await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(chat).toBeVisible();
    await expect(canvas).toBeHidden();
    // No horizontal scroll at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("mobile-chat-390x800.png") });

    await page.getByRole("tab", { name: "Canvas" }).click();
    await expect(canvas).toBeVisible();
    await expect(chat).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("mobile-canvas-390x800.png") });

    // The hidden chat stays mounted: its round is still there after switching back.
    await page.getByRole("tab", { name: "Chat" }).click();
    await expect(page.getByText("Which layout question comes first?").first()).toBeVisible();
  });
});
