import { expect, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY } from "./support";

// The interview chat (#27) in a real browser. The model is aimock: each test sends an idea
// that carries its own marker (E2E-IDEA-*), so it matches only its own fixtures in
// e2e/fixtures (ADR 0011). The scripts match on stateless request properties (turn index), so
// tests share one mock server and can run in parallel.

async function saveKey(page: Page) {
  await page.getByRole("button", { name: "Add Anthropic API key" }).click();
  await page.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  // The saved key has no visible control afterwards, so the prompt going away is the signal.
  await expect(page.getByText("Unfold needs your own Anthropic API key.")).toBeHidden();
}

async function sendIdea(page: Page, idea: string) {
  await page.getByRole("textbox", { name: "Your idea" }).fill(idea);
  await page.getByRole("button", { name: "Send" }).click();
}

// The canvas is asserted without motion (ADR 0014).
test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await addPasskeyAuthenticator(page);
  await page.goto("/");
});

test("shows the empty state and example ideas that only fill the composer", async ({ page }) => {
  await expect(page.getByText("Think an idea all the way through")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Anthropic API key" })).toBeVisible();

  await page
    .getByRole("button", { name: "A mobile app that helps neighbours share tools" })
    .click();
  await expect(page.getByRole("textbox", { name: "Your idea" })).toHaveValue(
    "A mobile app that helps neighbours share tools",
  );
  // Picking an example must not send it (a send spends the user's key).
  await expect(page.getByRole("form", { name: "Questions for this round" })).toHaveCount(0);
});

test("asks for a key when sending without one, and keeps the idea", async ({ page }) => {
  const idea = "E2E-IDEA-JOURNEY no key yet";
  await sendIdea(page, idea);

  const dialog = page.getByRole("dialog", { name: "Anthropic API key" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Your idea" })).toHaveValue(idea);
});

test("runs an interview: idea, round, answers, next round, finish", async ({ page }, testInfo) => {
  await saveKey(page);
  await sendIdea(page, "E2E-IDEA-JOURNEY a tool library");

  const round = page.getByRole("form", { name: "Questions for this round" });
  await expect(round.getByText("Question 1 of 2")).toBeVisible();

  // The canvas draws the same tree (ADR 0014): the idea, then the round's questions.
  const canvas = page.getByRole("region", { name: "Decision tree" });
  const node = (id: string) => canvas.getByTestId(`tree-node-${id}`);
  await expect(node("idea")).toContainText("E2E-IDEA-JOURNEY a tool library");
  await expect(node("r1q1")).toHaveAttribute("data-state", "pending");
  await expect(node("r1q1")).toContainText("Audience");
  await expect(node("r1q2")).toHaveAttribute("data-state", "pending");
  await expect(canvas.getByTestId("tree-edge-idea-r1q1")).toHaveAttribute("data-kind", "parent");
  await expect(canvas.getByTestId(/^tree-node-/)).toHaveCount(3);
  // A zoom button sets the user's own view: the next round must not fit the tree over it.
  await canvas.getByRole("button", { name: "Zoom Out" }).click();
  const zoomed = await node("idea").boundingBox();

  await expect(round.getByText("Who is it for?")).toBeVisible();
  // Option A is the recommendation.
  await expect(round.getByText("(Recommended)")).toBeVisible();
  // Next is disabled until the question is answered.
  await expect(round.getByRole("button", { name: "Next" })).toBeDisabled();
  await round.getByRole("radio", { name: /A\s*Families/ }).click();
  await round.getByRole("button", { name: "Next" }).click();

  await expect(round.getByText("Question 2 of 2")).toBeVisible();
  await round.getByRole("radio", { name: /A\s*Word of mouth/ }).click();
  // The note travels in the tool result, and the next fixture matches on it.
  await round.getByRole("textbox", { name: /Your own answer or a note/ }).fill("E2E-NOTE-ROUND-1");
  await round.getByRole("button", { name: "Submit answers" }).click();

  // The answers resume the run; the second round arrives as a new form.
  await expect(page.getByText("How will it make money?")).toBeVisible();
  await expect(page.getByText("Question 1 of 1")).toBeVisible();
  // The model's decisions fill in the first round, and the new question hangs off one of them.
  await expect(node("r1q1")).toHaveAttribute("data-state", "settled");
  await expect(node("r1q1")).toContainText("Families");
  await expect(node("r2q1")).toHaveAttribute("data-state", "pending");
  await expect(canvas.getByTestId("tree-edge-r1q1-r2q1")).toHaveAttribute("data-kind", "parent");
  await expect(canvas.getByTestId(/^tree-node-/)).toHaveCount(4);
  await expect(node("r2q1")).toBeInViewport();
  expect(await node("idea").boundingBox()).toEqual(zoomed);

  // Selecting a node marks it, and the background clears it.
  await node("r1q2").click();
  await expect(canvas.locator(".react-flow__node.selected")).toHaveCount(1);
  await expect(canvas.locator(".react-flow__node.selected")).toContainText("Discovery");

  await page.getByRole("radio", { name: /A\s*Subscription/ }).click();
  await page.getByRole("textbox", { name: /Your own answer or a note/ }).fill("E2E-NOTE-ROUND-2");
  await page.getByRole("button", { name: "Submit answers" }).click();

  await expect(page.getByText("Is this a shared understanding?")).toBeVisible();
  await expect(
    page.getByText("A subscription product for families, found by word of mouth."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  // Confirming resumes the run once more; the model's closing reply has no tool call.
  await expect(page.getByText("Glad we reached a shared understanding.")).toBeVisible();
  await expect(page.getByText("Is this a shared understanding?")).toBeHidden();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(node("r2q1")).toHaveAttribute("data-state", "settled");
  await expect(node("r2q1")).toContainText("Subscription");
  // For a person to look at. Nothing is compared with it.
  await page.screenshot({ path: testInfo.outputPath("journey-end.png") });
});

test("shows a provider error and offers to try again", async ({ page }) => {
  await saveKey(page);
  await sendIdea(page, "E2E-IDEA-PROVIDER-ERROR a failing idea");

  const alert = page.getByRole("alert").filter({ hasText: "The reply failed" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
  // The key must never reach the page, even inside an error message.
  await expect(page.locator("body")).not.toContainText(FAKE_KEY);
});
