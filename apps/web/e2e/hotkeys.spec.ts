import { expect, test } from "@playwright/test";
import { signIn } from "./support";

// The shortcuts in the real app: the provider is mounted in the root route, which the component
// tests do not render, and real key presses reach it after hydration.

test.use({ viewport: { width: 1280, height: 800 } });

test("Mod+/ opens the shortcuts list while typing, and Mod+B hides the sidebar", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/");
  const idea = page.getByRole("textbox", { name: "Your idea" });
  await idea.click();
  await idea.press("ControlOrMeta+/");

  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("shortcut-shortcuts.open")).toContainText(
    "Show keyboard shortcuts",
  );
  await expect(dialog.getByTestId("shortcut-sidebar.toggle")).toBeVisible();
  await expect(dialog.getByTestId("shortcut-toasts.focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Focus goes back where it was, so the user can keep typing.
  await expect(idea).toBeFocused();

  // The same from the header button: focus returns to the button.
  const button = page.getByRole("button", { name: "Keyboard shortcuts" });
  await button.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  const sidebar = page.locator("[data-slot=sidebar][data-state]");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await idea.press("ControlOrMeta+b");
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  // Neither shortcut typed a character into the idea box.
  await expect(idea).toHaveValue("");
});
