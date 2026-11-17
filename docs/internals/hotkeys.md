# Keyboard shortcuts

Applies to all keyboard handling in `apps/web`.

Unfold uses TanStack Hotkeys (`@tanstack/react-hotkeys`) for every shortcut. `Mod+/` opens a list of all of them, and so does the keyboard button in the header. The list must always be complete and accurate, so shortcuts are declared in one place.

The shortcuts themselves are listed only in the registry (below) and in the app's list; this file does not repeat them.

## Rules

- Every shortcut is declared in the registry, `apps/web/src/features/hotkeys/registry.ts` (`defineAppHotkeys`), and bound with `useHotkey(appHotkeys["id"], callback)`. Do not call `addEventListener("keydown", ...)`, pass a raw key string to `useHotkey`, or register ad-hoc handlers elsewhere. `HotkeysProvider` is mounted in `routes/__root.tsx`.
- Each registry entry has: a stable `id`, the key combination, a `scope` (`global`, or the screen or component it belongs to), and `meta` with a `name`, `description` and `group`.
- The `Mod+/` list (`features/hotkeys/shortcuts-dialog.tsx`) is generated from the registry with `useAppHotkeyList`. Never maintain a second, hand-written list in the app.
- No two shortcuts may use the same combination in the same scope. `registry.test.ts` fails on duplicates (on macOS, Windows and Linux) and on a short list of browser shortcuts.
- Use `Mod` semantics: Cmd on macOS, Ctrl elsewhere. Show the correct symbol for the user's platform.
- Do not override browser or OS shortcuts (reload, new tab, copy, paste, undo, and so on).
- Shortcuts do not fire while the user is typing in an input, textarea or editable element, unless the entry explicitly opts in (`options: { ignoreInputs: false }`) and the description says "Works while typing". The registry test checks the two match.
- No global single-character shortcuts (such as `/` or `?`) until users can turn them off or change them (WCAG 2.1.4). Use a modifier. A plain key is fine when it fires only while a component has focus (the canvas arrow keys): give it that component's `scope`, mount a `HotkeysProvider scope="..."` around the component, and pass `target` (a ref to its element) to `useHotkey`.
- Every action reachable by a shortcut is also reachable with the pointer.

## Third-party shortcuts

- Sonner binds `Alt+T` to focus the toast region. Keep it enabled (it is the only keyboard route to toasts). It is declared in the registry (`toasts.focus`), so it appears in the list and the duplicate test protects it, but it is never passed to `useHotkey`. Do not bind `Alt+T` to anything else.
- The shadcn `sidebar` ships a `Cmd+B` handler and a cookie write. Both were removed from `components/ui/sidebar.tsx`; `Mod+B` is bound through the registry instead (`sidebar.toggle`). Remove the handler again after any `shadcn add` that overwrites the file. In Firefox, `Mod+B` normally opens the bookmarks sidebar; Unfold takes it over on its own pages.
- Before adding a UI library that registers its own key handlers, check for conflicts with the registry and list its shortcuts.

## Adding a shortcut

1. Add the entry to `registry.ts` with a name, description, group and scope.
2. Bind it with `useHotkey(appHotkeys["id"], callback)` in the component that owns the action, and make sure a button or menu item does the same thing.
3. Check `registry.test.ts` still passes (duplicates, browser shortcuts, metadata).
4. Confirm the new shortcut appears in the `Mod+/` list.
5. Add a test for the action itself (see `features/conversations/app-header.test.tsx`).
