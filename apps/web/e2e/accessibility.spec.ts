import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY, signIn } from "./support";

// The accessibility pass (#32) in a real browser: axe on each screen of an interview, and the
// keyboard paths jsdom cannot show (focus after a control goes away, the canvas arrow keys).
// It reuses the E2E-IDEA-JOURNEY fixtures in e2e/fixtures/interview.json.

test.use({ reducedMotion: "reduce" });

/** No axe violations (WCAG 2.x A and AA, and best practices) on the page as it is now. */
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const summary = violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
  expect(summary).toEqual([]);
}

/** Waits for a dialog's open animation, so axe does not measure a half-faded colour. */
async function settled(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

async function saveKey(page: Page) {
  await page.getByRole("button", { name: "Add your API key" }).click();
  const dialog = page.getByRole("dialog");
  await settled(dialog);
  await expectNoViolations(page);
  await dialog.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Unfold needs your own API key")).toBeHidden();
}

async function answerFirstRound(page: Page) {
  const round = page.getByRole("form", { name: "Questions for this round" });
  await round.getByRole("radio", { name: /A\s*Families/ }).click();
  await round.getByRole("button", { name: "Next" }).click();
  await round.getByRole("radio", { name: /A\s*Word of mouth/ }).click();
  await round.getByRole("textbox", { name: /Your own answer or a note/ }).fill("E2E-NOTE-ROUND-1");
  await round.getByRole("button", { name: "Submit answers" }).click();
}

const focusedNode = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-id") ?? null);

test.describe("desktop 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("an interview has no axe violations, and focus follows the questions", async ({ page }) => {
    await addPasskeyAuthenticator(page);
    await signIn(page);
    await page.goto("/");
    await expectNoViolations(page);
    await saveKey(page);

    // Send goes away with the idea: focus moves to the first question's options.
    await page.getByRole("textbox", { name: "Your idea" }).fill("E2E-IDEA-JOURNEY a11y");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("radio", { name: /A\s*Families/ })).toBeFocused();
    await expectNoViolations(page);

    // So does the questionnaire once it is sent: focus waits in the messages, then moves to the
    // next round's options.
    await answerFirstRound(page);
    await expect(page.getByText("How will it make money?")).toBeVisible();
    await expect(page.getByRole("radio", { name: /A\s*Subscription/ })).toBeFocused();
    await expectNoViolations(page);

    await page.keyboard.press("ControlOrMeta+/");
    const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await settled(shortcuts);
    await expect(shortcuts.getByTestId("shortcut-canvas.parent")).toBeVisible();
    await expectNoViolations(page);
  });

  test("arrow keys move between nodes, and Escape keeps focus on the canvas", async ({ page }) => {
    await addPasskeyAuthenticator(page);
    await signIn(page);
    await page.goto("/");
    await saveKey(page);
    await page.getByRole("textbox", { name: "Your idea" }).fill("E2E-IDEA-JOURNEY a11y keys");
    await page.getByRole("button", { name: "Send" }).click();
    await answerFirstRound(page);
    await expect(page.getByText("How will it make money?")).toBeVisible();

    const canvas = page.getByRole("region", { name: "Decision tree" });
    const node = canvas.locator(".react-flow__node[data-id=idea]");
    await expect(node).toHaveAccessibleDescription(/Arrow keys move between nodes/);
    await node.focus();
    // Right to the first child, Down to its sibling, Left back to the parent, Home to the idea.
    // A move with nowhere to go stays put.
    await page.keyboard.press("ArrowRight");
    expect(await focusedNode(page)).toBe("r1q1");
    await page.keyboard.press("ArrowDown");
    expect(await focusedNode(page)).toBe("r1q2");
    await page.keyboard.press("ArrowDown");
    expect(await focusedNode(page)).toBe("r1q2");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    expect(await focusedNode(page)).toBe("r2q1");
    await page.keyboard.press("ArrowLeft");
    expect(await focusedNode(page)).toBe("r1q1");
    await page.keyboard.press("Home");
    expect(await focusedNode(page)).toBe("idea");

    // Enter selects the node and shows its turn; Escape clears it and focus stays.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    const selected = canvas.locator(".react-flow__node.selected");
    await expect(selected).toHaveAttribute("data-id", "r1q1");
    const chat = page.getByRole("region", { name: "Interview chat" });
    await expect(chat.locator("[aria-current=true]")).toContainText("Who is it for?");
    await page.keyboard.press("Escape");
    await expect(selected).toHaveCount(0);
    expect(await focusedNode(page)).toBe("r1q1");
  });
});

test.describe("phone 390x800", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("a node picked with the keyboard opens the chat tab, and focus goes with it", async ({
    page,
  }) => {
    await addPasskeyAuthenticator(page);
    await signIn(page);
    await page.goto("/");
    await saveKey(page);
    await page.getByRole("textbox", { name: "Your idea" }).fill("E2E-IDEA-JOURNEY a11y phone");
    await page.getByRole("button", { name: "Send" }).click();
    await answerFirstRound(page);
    await expect(page.getByText("How will it make money?")).toBeVisible();

    await page.getByRole("tab", { name: "Canvas" }).click();
    const canvas = page.getByRole("region", { name: "Decision tree" });
    await canvas.locator(".react-flow__node[data-id=r1q2]").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Messages" })).toBeFocused();
    await expectNoViolations(page);
  });
});
