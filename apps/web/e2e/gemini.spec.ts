import { expect, test } from "@playwright/test";
import { addPasskeyAuthenticator, signIn } from "./support";

// The interview on Google Gemini (#48). The real Gemini adapter runs in the local Convex
// backend and talks to aimock's Gemini endpoint, so the interview tools (`ask_round`, and the
// answers as a tool result) make the round trip in Gemini's own wire format. It reuses the
// E2E-IDEA-JOURNEY fixtures, which aimock serves in every provider's format.
const GEMINI_KEY = "AIzaFAKE-E2E-GEMINI-KEY-000000000000000";

test.use({ reducedMotion: "reduce" });

test("runs the interview with a Gemini key, and the Anthropic key it replaced is gone", async ({
  page,
}) => {
  await addPasskeyAuthenticator(page);
  await signIn(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add your API key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Google Gemini" }).click();
  await expect(dialog.getByRole("link", { name: /Create a key at Google Gemini/ })).toBeVisible();
  await dialog.getByRole("textbox", { name: "API key" }).fill(GEMINI_KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Unfold needs your own API key")).toBeHidden();
  // The header names no provider, but shows the Gemini key's mask.
  await expect(page.getByRole("button", { name: /^API key / })).toContainText("0000");

  await page.getByRole("textbox", { name: "Your idea" }).fill("E2E-IDEA-JOURNEY on Gemini");
  await page.getByRole("button", { name: "Send" }).click();

  // Round 1 arrived as a Gemini function call.
  const round = page.getByRole("form", { name: "Questions for this round" });
  await expect(round.getByText("Who is it for?")).toBeVisible();
  await round.getByRole("radio", { name: /A\s*Families/ }).click();
  await round.getByRole("button", { name: "Next" }).click();
  await round.getByRole("radio", { name: /A\s*Word of mouth/ }).click();
  await round.getByRole("textbox", { name: /Your own answer or a note/ }).fill("E2E-NOTE-ROUND-1");
  await round.getByRole("button", { name: "Submit answers" }).click();

  // The answers went back as a Gemini function response, and round 2 came from it.
  await expect(round.getByText("How will it make money?")).toBeVisible();
});
