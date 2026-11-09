// @vitest-environment jsdom
import type { KeyringStorage } from "@tanstack/ai-react/byok";
import { defineByok } from "@tanstack/ai-react/byok";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyDialog } from "./key-dialog";

const FAKE_KEY = "sk-ant-FAKE-DIALOG-KEY-0123456789";

function storage(overrides: Partial<KeyringStorage> = {}): KeyringStorage & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    id: "test",
    label: "Test",
    persistent: true,
    load: () => ({}),
    save: (keys) => {
      saved.push(keys);
    },
    clear: () => {},
    ...overrides,
    saved,
  };
}

async function openAndType(key: string) {
  fireEvent.click(screen.getByRole("button", { name: /add anthropic api key/i }));
  fireEvent.change(await screen.findByLabelText("API key"), { target: { value: key } });
}

afterEach(cleanup);

describe("KeyDialog", () => {
  it("saves a key and shows it masked", async () => {
    const store = storage();
    const byok = defineByok({ storage: store });
    render(<KeyDialog byok={byok} />);
    await openAndType(FAKE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(store.saved).toHaveLength(1));
    const trigger = await screen.findByRole("button", { name: /anthropic key:/i });
    expect(trigger.textContent).not.toContain(FAKE_KEY);
  });

  it("uses a password field", async () => {
    render(<KeyDialog byok={defineByok({ storage: storage() })} />);
    await openAndType("x");
    expect(screen.getByLabelText("API key").getAttribute("type")).toBe("password");
  });

  it("on a no-PRF failure explains it, keeps the dialog open and stores nothing", async () => {
    const save = vi.fn(() => {
      throw new Error("This authenticator does not support the WebAuthn PRF extension");
    });
    const byok = defineByok({ storage: storage({ save }) });
    render(<KeyDialog byok={byok} />);
    await openAndType(FAKE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/does not keep the key any other way/);
    expect(byok.keys()).toEqual({});
    expect(save).toHaveBeenCalledTimes(1); // no second attempt into another store
    // A failed save must not look like a saved key.
    expect(screen.queryByRole("button", { name: /anthropic key:/i })).toBeNull();
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe(FAKE_KEY);
  });

  it("says a cancelled unlock left the saved key stored, not that it was not saved", async () => {
    const store = storage({
      unlockable: true,
      peek: () => ({ anthropic: "6789" }),
      load: () => {
        throw Object.assign(new Error("cancelled"), { name: "NotAllowedError" });
      },
    });
    render(<KeyDialog byok={defineByok({ storage: store })} />);
    fireEvent.click(await screen.findByRole("button", { name: /anthropic key:/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Unlock saved key" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not be unlocked/);
    expect(alert.textContent).not.toMatch(/not saved/);
  });

  it("does not enable Save for a blank key", async () => {
    render(<KeyDialog byok={defineByok({ storage: storage() })} />);
    await openAndType("   ");
    expect((screen.getByRole("button", { name: "Save key" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("removes a saved key", async () => {
    const store = storage();
    const byok = defineByok({ storage: store });
    render(<KeyDialog byok={byok} />);
    await openAndType(FAKE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    fireEvent.click(await screen.findByRole("button", { name: /anthropic key:/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove key" }));
    await waitFor(() => expect(byok.keys()).toEqual({}));
  });
});
