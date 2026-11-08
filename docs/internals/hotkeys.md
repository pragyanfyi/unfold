# Keyboard shortcuts

Applies to all keyboard handling in `apps/web`.

Unfold uses TanStack Hotkeys for every shortcut, and `Cmd+/` opens a list of all of them. The list must always be complete and accurate, so shortcuts are declared in one place.

## Rules

- Every shortcut is registered through a single registry module (path **TBD**, decided when the first shortcut is added). Do not call `addEventListener("keydown", ...)` or register ad-hoc handlers elsewhere.
- Each registry entry has at least: a stable `id`, the key combination, a human-readable description, and a scope (global, or the screen or component it belongs to).
- The `Cmd+/` list is generated from the registry. Never maintain a second, hand-written list.
- No two shortcuts may use the same combination in the same scope. Add a unit test that fails on duplicates.
- Use `Mod` semantics: Cmd on macOS, Ctrl elsewhere. Show the correct symbol for the user's platform.
- Do not override browser or OS shortcuts (reload, new tab, copy, paste, undo, and so on).
- Shortcuts do not fire while the user is typing in an input, textarea or editable element, unless the entry explicitly opts in and the description says so.
- Every action reachable by a shortcut is also reachable with the pointer.

## Adding a shortcut

1. Add the entry to the registry with a description.
2. Check the duplicate test still passes.
3. Confirm the new shortcut appears in the `Cmd+/` list.
4. Add a test for the action itself.
