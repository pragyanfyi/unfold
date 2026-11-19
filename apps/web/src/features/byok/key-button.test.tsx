// @vitest-environment jsdom
import type { KeyringStorage } from "@tanstack/ai-react/byok";
import { defineByok } from "@tanstack/ai-react/byok";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FakeSessionProvider, fakeSession } from "#/features/auth/fake-session";
import type { Session } from "#/features/auth/session";
import { KeyButton } from "./key-button";

const FAKE_KEY = "sk-ant-FAKE-HEADER-KEY-0123456789";
const SECOND_KEY = "sk-ant-FAKE-REPLACED-KEY-9876543210";

function storage(): KeyringStorage {
  return {
    id: "test",
    label: "Test",
    persistent: true,
    load: () => ({}),
    save: () => {},
    clear: () => {},
  };
}

function renderButton(byok: ReturnType<typeof defineByok>, session: Session = fakeSession()) {
  render(
    <FakeSessionProvider session={session}>
      <KeyButton byok={byok} />
    </FakeSessionProvider>,
  );
}

afterEach(cleanup);

describe("KeyButton", () => {
  it("shows nothing until the user is signed in", () => {
    const byok = defineByok({ storage: storage() });
    renderButton(byok, fakeSession({ status: "loading" }));
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    renderButton(byok, fakeSession({ status: "signed-out" }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers to add a key when none is set", async () => {
    const byok = defineByok({ storage: storage() });
    renderButton(byok);
    fireEvent.click(screen.getByRole("button", { name: "Add API key" }));
    expect(await screen.findByLabelText("API key")).toBeTruthy();
  });

  it("shows that a key is set, masked, never the key itself", async () => {
    const byok = defineByok({ storage: storage() });
    await byok.update("anthropic", FAKE_KEY);
    renderButton(byok);
    const button = await screen.findByRole("button", { name: /^API key / });
    expect(button.textContent).toContain("6789");
    expect(button.textContent).not.toContain(FAKE_KEY);
  });

  it("replaces the saved key", async () => {
    const byok = defineByok({ storage: storage() });
    await byok.update("anthropic", FAKE_KEY);
    renderButton(byok);
    fireEvent.click(await screen.findByRole("button", { name: /^API key / }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/replaces the one you have/);
    fireEvent.change(within(dialog).getByLabelText("API key"), { target: { value: SECOND_KEY } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(byok.keys()).toEqual({ anthropic: SECOND_KEY }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /^API key / }).textContent).toContain("3210");
  });

  it("removes the saved key, then offers to add one, with focus on the key field", async () => {
    const byok = defineByok({ storage: storage() });
    await byok.update("anthropic", FAKE_KEY);
    renderButton(byok);
    fireEvent.click(await screen.findByRole("button", { name: /^API key / }));
    const remove = await screen.findByRole("button", { name: "Remove key" });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(byok.keys()).toEqual({}));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove key" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("API key")));
    expect(screen.getByRole("button", { name: "Add API key", hidden: true })).toBeTruthy();
  });
});
