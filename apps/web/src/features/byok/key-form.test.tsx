// @vitest-environment jsdom
import type { KeyringStorage } from "@tanstack/ai-react/byok";
import { defineByok } from "@tanstack/ai-react/byok";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyForm } from "./key-form";

// Clearly fake keys, one per provider.
const ANTHROPIC_KEY = "sk-ant-FAKE-FORM-KEY-0123456789";
const GEMINI_KEY = "AIzaFAKE-GEMINI-FORM-KEY-0123456789abcd";

function storage(overrides: Partial<KeyringStorage> = {}): KeyringStorage {
  return {
    id: "test",
    label: "Test",
    persistent: true,
    load: () => ({}),
    save: () => {},
    clear: () => {},
    ...overrides,
  };
}

// Radix radio groups measure their items; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

function pick(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function typeAndSave(key: string) {
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: key } });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));
}

describe("KeyForm: providers (#48)", () => {
  it("offers each provider, starting on the first, with a link to create a key there", () => {
    render(<KeyForm byok={defineByok({ storage: storage() })} />);
    expect(screen.getByRole("radio", { name: "Anthropic" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: /Create a key at Anthropic/ })).toBeTruthy();
    pick("Google Gemini");
    const link = screen.getByRole("link", { name: /Create a key at Google Gemini/ });
    expect(link.getAttribute("href")).toBe("https://aistudio.google.com/app/apikey");
  });

  it("starts on the saved key's provider, so a replacement keeps it", async () => {
    const byok = defineByok({ storage: storage() });
    await byok.update("gemini", GEMINI_KEY);
    render(<KeyForm byok={byok} />);
    expect(screen.getByRole("radio", { name: "Google Gemini" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("saves a Gemini key and removes the Anthropic one: one key at a time", async () => {
    const byok = defineByok({ storage: storage() });
    await byok.update("anthropic", ANTHROPIC_KEY);
    const onSaved = vi.fn();
    render(<KeyForm byok={byok} onSaved={onSaved} />);
    pick("Google Gemini");
    typeAndSave(GEMINI_KEY);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(byok.keys()).toEqual({ gemini: GEMINI_KEY });
  });

  it("removes a Gemini key when an Anthropic one is saved", async () => {
    const byok = defineByok({ storage: storage() });
    await byok.update("gemini", GEMINI_KEY);
    const onSaved = vi.fn();
    render(<KeyForm byok={byok} onSaved={onSaved} />);
    pick("Anthropic");
    typeAndSave(ANTHROPIC_KEY);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(byok.keys()).toEqual({ anthropic: ANTHROPIC_KEY });
  });

  it("keeps the old key when the new one cannot be saved", async () => {
    let saves = 0;
    const byok = defineByok({
      storage: storage({
        save: () => {
          saves += 1;
          // The first save stores the existing key; the next one fails.
          if (saves > 1)
            throw new Error("This authenticator does not support the WebAuthn PRF extension");
        },
      }),
    });
    await byok.update("anthropic", ANTHROPIC_KEY);
    const onSaved = vi.fn();
    render(<KeyForm byok={byok} onSaved={onSaved} />);
    pick("Google Gemini");
    typeAndSave(GEMINI_KEY);
    expect((await screen.findByRole("alert")).textContent).toMatch(/was not saved/);
    expect(byok.keys()).toEqual({ anthropic: ANTHROPIC_KEY });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("says so when the new key is saved but the old one cannot be removed", async () => {
    let saves = 0;
    const byok = defineByok({
      storage: storage({
        save: () => {
          saves += 1;
          // Saves 1 and 2 store the old and the new key; the removal's save fails.
          if (saves > 2) throw new Error("storage failed");
        },
      }),
    });
    await byok.update("anthropic", ANTHROPIC_KEY);
    const onSaved = vi.fn();
    render(<KeyForm byok={byok} onSaved={onSaved} />);
    pick("Google Gemini");
    typeAndSave(GEMINI_KEY);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Google Gemini key was saved, but your other key could not/);
    expect(alert.textContent).not.toContain("storage failed");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
