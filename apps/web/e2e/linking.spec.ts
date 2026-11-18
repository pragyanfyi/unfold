import { expect, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY, signIn } from "./support";

// The canvas and the chat linked by node (#31), in a real browser against aimock. It reuses
// the E2E-IDEA-JOURNEY fixtures in e2e/fixtures/interview.json.

async function startInterview(page: Page) {
  await addPasskeyAuthenticator(page);
  await signIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add Anthropic API key" }).click();
  await page.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Unfold needs your own Anthropic API key.")).toBeHidden();
  await page.getByRole("textbox", { name: "Your idea" }).fill("E2E-IDEA-JOURNEY linking");
  await page.getByRole("button", { name: "Send" }).click();
}

// The canvas is asserted without motion (ADR 0014).
test.use({ reducedMotion: "reduce" });

test("links the questionnaire, the canvas and the chat history", async ({ page }, testInfo) => {
  await startInterview(page);
  const round = page.getByRole("form", { name: "Questions for this round" });
  const canvas = page.getByRole("region", { name: "Decision tree" });
  const node = (id: string) => canvas.getByTestId(`tree-node-${id}`);
  const selected = canvas.locator(".react-flow__node.selected");

  // The question on screen is the selected node.
  await expect(round.getByText("Question 1 of 2")).toBeVisible();
  await expect(selected).toHaveAttribute("data-id", "r1q1");

  // An answer shows on its node before the round is sent.
  await round.getByRole("radio", { name: /A\s*Families/ }).click();
  await expect(node("r1q1")).toHaveAttribute("data-state", "answered");
  await expect(node("r1q1")).toContainText("Families");
  await expect(node("r1q2")).toHaveAttribute("data-state", "pending");

  // Picking a node of the round moves the questionnaire to it, and Next moves the selection.
  await node("r1q2").click();
  await expect(round.getByText("Question 2 of 2")).toBeVisible();
  await round.getByRole("button", { name: "Back" }).click();
  await expect(selected).toHaveAttribute("data-id", "r1q1");
  await round.getByRole("button", { name: "Next" }).click();
  await expect(selected).toHaveAttribute("data-id", "r1q2");

  await round.getByRole("radio", { name: /A\s*Word of mouth/ }).click();
  await round.getByRole("textbox", { name: /Your own answer or a note/ }).fill("E2E-NOTE-ROUND-1");
  await round.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("How will it make money?")).toBeVisible();
  await expect(selected).toHaveAttribute("data-id", "r2q1");

  // Picking an answered node opens its round in the chat and marks its question.
  await node("r1q2").click();
  const chat = page.getByRole("region", { name: "Interview chat" });
  const marked = chat.locator("[aria-current=true]");
  await expect(marked).toContainText("How do they find it?");
  await expect(marked).toContainText("Word of mouth");
  await expect(marked).toBeInViewport();
  // For a person to look at. Nothing is compared with it.
  await page.screenshot({ path: testInfo.outputPath("linked.png") });
  // Clicking it again after closing the round shows it again.
  await chat.getByRole("button", { name: "Asked 2 questions" }).click();
  await expect(marked).toBeHidden();
  await node("r1q2").click();
  await expect(marked).toBeVisible();
  await node("idea").click();
  await expect(chat.locator("[aria-current=true]")).toContainText("E2E-IDEA-JOURNEY linking");
});

test.describe("phone 390x800", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("a tapped node opens the chat tab at its turn", async ({ page }) => {
    await startInterview(page);
    await expect(page.getByText("Question 1 of 2")).toBeVisible();
    await page.getByRole("tab", { name: "Canvas" }).click();
    const canvas = page.getByRole("region", { name: "Decision tree" });
    await canvas.getByTestId("tree-node-r1q2").click();

    await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Question 2 of 2")).toBeVisible();
    // Clearing the selection does not switch tabs.
    await page.getByRole("tab", { name: "Canvas" }).click();
    await canvas.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    await expect(canvas.locator(".react-flow__node.selected")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Canvas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
