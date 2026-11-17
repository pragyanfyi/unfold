import { defineAppHotkeys } from "@tanstack/react-hotkeys";

// Every keyboard shortcut in Unfold, in the order the shortcuts list shows them
// (docs/internals/hotkeys.md). Components register an entry with
// `useHotkey(appHotkeys["id"], callback)`; nothing else listens for keys. `Mod` is Cmd on
// macOS and Ctrl elsewhere.
//
// `ignoreInputs: false` lets a shortcut fire while the user is typing; its description says
// so. A plain key must never set it.
export const appHotkeys = defineAppHotkeys({
  "shortcuts.open": {
    hotkey: "Mod+/",
    scope: "global",
    meta: {
      name: "Show keyboard shortcuts",
      description: "Opens or closes this list. Works while typing.",
      group: "General",
    },
    options: { ignoreInputs: false },
  },
  "sidebar.toggle": {
    hotkey: "Mod+B",
    scope: "global",
    meta: {
      name: "Show or hide the sidebar",
      description: "Works while typing.",
      group: "General",
    },
    options: { ignoreInputs: false },
  },
  // Sonner binds this itself (components/ui/sonner.tsx), so it is declared here for the list and
  // the duplicate check, and never registered with `useHotkey`.
  "toasts.focus": {
    hotkey: "Alt+T",
    scope: "global",
    meta: {
      name: "Move to notifications",
      description: "Moves focus to the notifications, when any are shown.",
      group: "General",
    },
  },
});

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
