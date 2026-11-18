// @vitest-environment jsdom
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "#/components/ui/sidebar";
import { FakeSessionProvider } from "#/features/auth/fake-session";
import { appHotkeys } from "#/features/hotkeys/registry";
import { AppHeader } from "./app-header";

function SidebarState() {
  return <p data-testid="sidebar">{useSidebar().state}</p>;
}

// Ctrl, because the provider is told this is not a Mac.
function press(target: Element | Document, key: string, code: string) {
  act(() => {
    fireEvent.keyDown(target, { key, code, ctrlKey: true });
  });
}

function renderHeader() {
  render(
    <FakeSessionProvider>
      <HotkeysProvider appHotkeys={appHotkeys} defaultOptions={{ platform: "linux" }}>
        <SidebarProvider>
          <AppHeader />
          <SidebarState />
          <textarea aria-label="Your idea" />
        </SidebarProvider>
      </HotkeysProvider>
    </FakeSessionProvider>,
  );
}

beforeEach(() => {
  // jsdom has no matchMedia, which the sidebar reads to tell a phone from a desktop.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppHeader", () => {
  it("opens the shortcuts list from its button, listing every shortcut in the registry", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const entry of Object.values(appHotkeys)) {
      const row = within(dialog).getByTestId(`shortcut-${entry.id}`);
      expect(row.textContent).toContain(entry.meta?.name);
    }
    expect(within(dialog).getByTestId("shortcut-shortcuts.open").textContent).toContain("Ctrl+/");
    expect(within(dialog).getByTestId("shortcut-toasts.focus").textContent).toContain("Alt+T");
  });

  it("opens and closes the shortcuts list with Mod+/, even while typing", () => {
    renderHeader();
    const box = screen.getByLabelText("Your idea");
    box.focus();
    press(box, "/", "Slash");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    press(document.activeElement ?? document, "/", "Slash");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows and hides the sidebar with Mod+B, even while typing", () => {
    renderHeader();
    expect(screen.getByTestId("sidebar").textContent).toBe("expanded");
    const box = screen.getByLabelText("Your idea");
    box.focus();
    press(box, "b", "KeyB");
    expect(screen.getByTestId("sidebar").textContent).toBe("collapsed");
    press(document.body, "b", "KeyB");
    expect(screen.getByTestId("sidebar").textContent).toBe("expanded");
  });

  it("leaves the plain key alone", () => {
    renderHeader();
    act(() => {
      fireEvent.keyDown(document.body, { key: "/", code: "Slash" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
