import { AppHotkeysStore, type HotkeyPlatform, normalizeHotkey } from "@tanstack/react-hotkeys";
import { describe, expect, it } from "vitest";
import { appHotkeys } from "./registry";

const entries = Object.values(appHotkeys);
const platforms: Array<HotkeyPlatform> = ["mac", "windows", "linux"];

// Browser and OS shortcuts Unfold must leave alone (docs/internals/hotkeys.md). Not every one,
// just the ones a new entry is likely to reach for.
const reserved = [
  "Mod+A",
  "Mod+C",
  "Mod+D",
  "Mod+F",
  "Mod+L",
  "Mod+N",
  "Mod+P",
  "Mod+Q",
  "Mod+R",
  "Mod+S",
  "Mod+T",
  "Mod+V",
  "Mod+W",
  "Mod+X",
  "Mod+Z",
  "Mod+Shift+N",
  "Mod+Shift+O",
  "Mod+Shift+T",
  "Mod+Shift+Z",
];

describe("hotkey registry", () => {
  it("has entries", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(platforms)("has no two shortcuts on the same keys in one scope (%s)", (platform) => {
    const store = new AppHotkeysStore(appHotkeys, { platform });
    for (const entry of entries) {
      if (entry.hotkey === null) continue;
      const clashes = store.findConflicts(entry.id, entry.hotkey).map((other) => other.id);
      expect(clashes, `${entry.id} clashes`).toEqual([]);
    }
  });

  it("catches a duplicate, so the check above can fail", () => {
    const store = new AppHotkeysStore(appHotkeys, { platform: "mac" });
    expect(store.findConflicts("shortcuts.open", "Mod+B").map((other) => other.id)).toEqual([
      "sidebar.toggle",
    ]);
  });

  it.each(platforms)("does not take a browser shortcut (%s)", (platform) => {
    const taken = new Set(reserved.map((hotkey) => normalizeHotkey(hotkey, platform)));
    for (const entry of entries) {
      if (entry.hotkey === null || Array.isArray(entry.hotkey)) continue;
      expect(taken.has(normalizeHotkey(entry.hotkey as string, platform)), entry.id).toBe(false);
    }
  });

  it("gives every shortcut a name, a description and a group for the list", () => {
    for (const entry of entries) {
      expect(entry.meta?.name, entry.id).toBeTruthy();
      expect(entry.meta?.description, entry.id).toBeTruthy();
      expect(entry.meta?.group, entry.id).toBeTruthy();
    }
  });

  it("says so in the description when a shortcut works while typing", () => {
    for (const entry of entries) {
      const typing = entry.options?.ignoreInputs === false;
      expect(entry.meta?.description?.includes("Works while typing"), entry.id).toBe(typing);
    }
  });
});
