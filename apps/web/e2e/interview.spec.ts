import { expect, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY, signIn } from "./support";

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
  await signIn(page);
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

test("asks for a key on send, then starts the interview on its own", async ({ page }) => {
  await sendIdea(page, "E2E-IDEA-JOURNEY no key yet");

  // Signed in without a key: the onboarding dialog opens at its key step (ADR 0016).
  const dialog = page.getByRole("dialog", { name: "Before your first interview" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[aria-current=step]")).toHaveText(/Add your key/);
  await dialog.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("form", { name: "Questions for this round" })).toBeVisible();
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

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("grows the tree with a move, and the view follows to where it ends", async ({ page }) => {
    await saveKey(page);
    await sendIdea(page, "E2E-IDEA-JOURNEY a tool library");

    const round = page.getByRole("form", { name: "Questions for this round" });
    const canvas = page.getByRole("region", { name: "Decision tree" });
    const node = (id: string) => canvas.getByTestId(`tree-node-${id}`);
    await expect(node("r1q2")).toBeInViewport({ ratio: 1 });

    // Every opacity the second round's node is given. Each frame of the move writes one, so
    // this does not depend on how fast the frames come.
    await canvas.evaluate((element) => {
      const seen: Array<string> = [];
      Object.assign(window, { seenOpacity: seen });
      new MutationObserver(() => {
        const added = element.querySelector<HTMLElement>('.react-flow__node[data-id="r2q1"]');
        if (added) seen.push(added.style.opacity || "1");
      }).observe(element, { subtree: true, childList: true, attributeFilter: ["style"] });
    });

    await round.getByRole("radio", { name: /A\s*Families/ }).click();
    await round.getByRole("button", { name: "Next" }).click();
    await round.getByRole("radio", { name: /A\s*Word of mouth/ }).click();
    await round
      .getByRole("textbox", { name: /Your own answer or a note/ })
      .fill("E2E-NOTE-ROUND-1");
    await round.getByRole("button", { name: "Submit answers" }).click();

    // The move ends with every node whole in the view, and the new one fully visible.
    for (const id of ["idea", "r1q1", "r1q2", "r2q1"]) {
      await expect(node(id)).toBeInViewport({ ratio: 1 });
    }
    const added = canvas.locator('.react-flow__node[data-id="r2q1"]');
    await expect(added).toHaveCSS("opacity", "1");
    const seen = await page.evaluate(
      () => (window as unknown as { seenOpacity: Array<string> }).seenOpacity,
    );
    // It faded in: it was drawn at least once on the way.
    expect(seen.some((opacity) => Number(opacity) < 1)).toBe(true);
    expect(seen.at(-1)).toBe("1");
  });

  test("the fit button fits where the tree ends, even during the move", async ({ page }) => {
    await saveKey(page);
    await sendIdea(page, "E2E-IDEA-JOURNEY a tool library");

    const round = page.getByRole("form", { name: "Questions for this round" });
    const canvas = page.getByRole("region", { name: "Decision tree" });
    const node = (id: string) => canvas.getByTestId(`tree-node-${id}`);
    await expect(node("r1q2")).toBeInViewport({ ratio: 1 });

    await round.getByRole("radio", { name: /A\s*Families/ }).click();
    await round.getByRole("button", { name: "Next" }).click();
    await round.getByRole("radio", { name: /A\s*Word of mouth/ }).click();
    await round
      .getByRole("textbox", { name: /Your own answer or a note/ })
      .fill("E2E-NOTE-ROUND-1");

    // Click Fit view in the page, one frame after the second round's node is drawn, and note
    // how visible that node was then. Below 1 proves the click came during the move, however
    // fast the test itself runs.
    await canvas.evaluate((element) => {
      const observer = new MutationObserver(() => {
        const added = element.querySelector<HTMLElement>('.react-flow__node[data-id="r2q1"]');
        if (!added) return;
        observer.disconnect();
        requestAnimationFrame(() => {
          const button = element.querySelector<HTMLButtonElement>(".react-flow__controls-fitview");
          Object.assign(window, {
            opacityAtClick: button ? added.style.opacity || "1" : "no button",
          });
          button?.click();
        });
      });
      observer.observe(element, { subtree: true, childList: true });
    });
    await round.getByRole("button", { name: "Submit answers" }).click();

    const opacityAtClick = () =>
      page.evaluate(() => (window as unknown as { opacityAtClick?: string }).opacityAtClick);
    await expect.poll(opacityAtClick).toBeDefined();
    expect(Number(await opacityAtClick())).toBeLessThan(1);
    await expect(canvas.getByRole("button", { name: "Fit view" })).toBeVisible();
    // The move has ended once the new node is fully visible. Only then is the fit final.
    await expect(canvas.locator('.react-flow__node[data-id="r2q1"]')).toHaveCSS("opacity", "1");
    // Not 1: after this fit a node can measure 0.9999996 from sub-pixel rounding, while it sits
    // well inside the pane. A node the fit missed is far below 0.99.
    for (const id of ["idea", "r1q1", "r1q2", "r2q1"]) {
      await expect(node(id)).toBeInViewport({ ratio: 0.99 });
    }
  });
});
