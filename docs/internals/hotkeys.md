# Keyboard shortcuts

Applies to all keyboard handling in `apps/web`.

No shortcuts exist yet. Unfold will use TanStack Hotkeys for every shortcut, and `Cmd+/` will open a list of all of them. The list must always be complete and accurate, so shortcuts will be declared in one place.

## Rules

- Every shortcut is registered through a single registry module (path **TBD**, decided when the first shortcut is added). Do not call `addEventListener("keydown", ...)` or register ad-hoc handlers elsewhere.
- Each registry entry has at least: a stable `id`, the key combination, a human-readable description, and a scope (global, or the screen or component it belongs to).
- The `Cmd+/` list is generated from the registry. Never maintain a second, hand-written list.
- No two shortcuts may use the same combination in the same scope. Add a unit test that fails on duplicates.
- Use `Mod` semantics: Cmd on macOS, Ctrl elsewhere. Show the correct symbol for the user's platform.
- Do not override browser or OS shortcuts (reload, new tab, copy, paste, undo, and so on).
- Shortcuts do not fire while the user is typing in an input, textarea or editable element, unless the entry explicitly opts in and the description says so.
- Every action reachable by a shortcut is also reachable with the pointer.

## Third-party shortcuts

- Sonner binds `Alt+T` to focus the toast region. Keep it enabled (it is the only keyboard route to toasts) and list it in the `Cmd+/` list when that exists. Do not bind `Alt+T` to anything else.
- The shadcn `sidebar` ships a `Cmd+B` handler and a cookie write. Both were removed from `components/ui/sidebar.tsx` (the registry rule above), and the sidebar opens with its trigger button. Re-add `Cmd+B` through the registry when it exists, and remove the handler again after any `shadcn add` that overwrites the file.
- Before adding a UI library that registers its own key handlers, check for conflicts with the registry and list its shortcuts.

## Adding a shortcut

1. Add the entry to the registry with a description.
2. Check the duplicate test still passes.
3. Confirm the new shortcut appears in the `Cmd+/` list.
4. Add a test for the action itself.
