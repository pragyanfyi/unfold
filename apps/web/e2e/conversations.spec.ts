import { expect, type Page, test } from "@playwright/test";
import { addPasskeyAuthenticator, FAKE_KEY } from "./support";

// Saved conversations (#28, ADR 0013) in a real browser: the app stores them in IndexedDB,
// lists them in the sidebar, and restores them after a reload. Each test has its own browser
// context, so its IndexedDB is empty and tests do not see each other's ideas.

async function saveKey(page: Page) {
  await page.getByRole("button", { name: "Add Anthropic API key" }).click();
  await page.getByRole("textbox", { name: "API key" }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Unfold needs your own Anthropic API key.")).toBeHidden();
}

async function sendIdea(page: Page, idea: string) {
  await page.getByRole("textbox", { name: "Your idea" }).fill(idea);
  await page.getByRole("button", { name: "Send" }).click();
}

// How many messages the browser has stored, read straight from IndexedDB. A reload before a
// save has committed would race it, so tests wait for this instead of guessing.
async function storedMessages(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("unfold");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("messages")) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction("messages").objectStore("messages").count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
}

const chat = (page: Page) => page.getByRole("region", { name: "Interview chat" });

const SAVED_URL = /\/c\/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test.beforeEach(async ({ page }) => {
  await addPasskeyAuthenticator(page);
  await page.goto("/");
  await saveKey(page);
});

test("saves an idea, lists it, and restores the interview after each reload", async ({ page }) => {
  const idea = "E2E-IDEA-STORAGE a saved idea";
  await expect(page.getByText("Ideas you explore are saved here")).toBeVisible();
  await sendIdea(page, idea);

  // The first reply gives the idea its own address, without cutting the reply short.
  await expect(page.getByText("Which storage question comes first?").first()).toBeVisible();
  await expect(page).toHaveURL(SAVED_URL);
  await expect(page.getByRole("link", { name: idea })).toBeVisible();

  // A round still waiting for an answer is not stored, so the reload asks it again.
  await expect.poll(() => storedMessages(page)).toBe(1);
  await page.reload();
  await expect(chat(page).getByText(idea, { exact: true })).toBeVisible();
  const stopped = page.getByRole("alert").filter({ hasText: "The reply stopped" });
  await expect(stopped).toBeVisible();
  await stopped.getByRole("button", { name: "Try again" }).click();

  const round = page.getByRole("form", { name: "Questions for this round" });
  await expect(round.getByText("Which storage question comes first?")).toBeVisible();
  await round.getByRole("radio", { name: /A\s*This one/ }).click();
  await round.getByRole("textbox", { name: /Your own answer or a note/ }).fill("E2E-NOTE-STORAGE");
  await round.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("Storage works across reloads.")).toBeVisible();

  // An answered round is stored. The reply that followed it was not, so it can be continued.
  await expect.poll(() => storedMessages(page)).toBe(2);
  await page.reload();
  await expect(page.getByText("Asked 1 question")).toBeVisible();
  await expect(page.getByText("Storage works across reloads.")).toBeHidden();
  await page
    .getByRole("alert")
    .filter({ hasText: "The reply stopped" })
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(page.getByText("Storage works across reloads.")).toBeVisible();
  await expect(page.getByText("Asked 1 question")).toBeVisible();
});

test("opens a saved idea from the list, and starts a new one beside it", async ({ page }) => {
  const idea = "E2E-IDEA-STORAGE a second idea";
  await sendIdea(page, idea);
  await expect(page).toHaveURL(SAVED_URL);
  const address = page.url();

  await page.getByRole("button", { name: "New idea" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Think an idea all the way through")).toBeVisible();

  await page.getByRole("link", { name: idea }).click();
  await expect(page).toHaveURL(address);
  await expect(chat(page).getByText(idea, { exact: true })).toBeVisible();

  // A fresh browser load of the address finds it too.
  await page.goto(address);
  await expect(chat(page).getByText(idea, { exact: true })).toBeVisible();
});

test("renames and deletes an idea", async ({ page }) => {
  const idea = "E2E-IDEA-STORAGE an idea to rename";
  await sendIdea(page, idea);
  await expect(page).toHaveURL(SAVED_URL);
  const address = page.url();
  await expect(page.getByRole("link", { name: idea })).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${idea}` }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename idea" });
  await rename.getByRole("textbox", { name: "Name" }).fill("Renamed idea");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Renamed idea" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Renamed idea" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Renamed idea" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete this idea?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("link", { name: "Renamed idea" })).toBeHidden();
  await expect(page).toHaveURL("/");

  // The address of a deleted idea says so, and does not recreate it.
  await page.goto(address);
  await expect(page.getByText("Idea not found")).toBeVisible();
  await expect(page.getByText("Ideas you explore are saved here")).toBeVisible();
});
