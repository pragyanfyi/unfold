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
  // Moving between nodes of the decision tree (features/canvas/tree-navigation.ts). They fire
  // only while focus is on the canvas, which is what lets them be plain keys (WCAG 2.1.4).
  "canvas.parent": {
    hotkey: "ArrowLeft",
    scope: "canvas",
    meta: {
      name: "Go to the parent node",
      description: "When a node on the canvas has focus.",
      group: "Canvas",
    },
  },
  "canvas.child": {
    hotkey: "ArrowRight",
    scope: "canvas",
    meta: {
      name: "Go to the first child node",
      description: "When a node on the canvas has focus.",
      group: "Canvas",
    },
  },
  "canvas.previous": {
    hotkey: "ArrowUp",
    scope: "canvas",
    meta: {
      name: "Go to the previous sibling",
      description: "When a node on the canvas has focus.",
      group: "Canvas",
    },
  },
  "canvas.next": {
    hotkey: "ArrowDown",
    scope: "canvas",
    meta: {
      name: "Go to the next sibling",
      description: "When a node on the canvas has focus.",
      group: "Canvas",
    },
  },
  "canvas.root": {
    hotkey: "Home",
    scope: "canvas",
    meta: {
      name: "Go to your idea",
      description: "When a node on the canvas has focus.",
      group: "Canvas",
    },
  },
  // Caught before React Flow, which would also blur the node and leave focus on <body>.
  "canvas.clear": {
    hotkey: "Escape",
    scope: "canvas",
    meta: {
      name: "Clear the selection",
      description: "When a node on the canvas has focus. Focus stays on the node.",
      group: "Canvas",
    },
    options: { capture: true },
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
