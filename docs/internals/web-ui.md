# Web UI

Applies to `apps/web/src/**/*.{tsx,css}`.

## Components

- Use [shadcn/ui](https://ui.shadcn.com) for UI primitives (buttons, dialogs, inputs, toasts). Do not hand-roll a primitive that shadcn provides.
- Add shadcn components with the CLI (`pnpm dlx shadcn@latest add <name>`), run from `apps/web`. Add only what a change needs.
- The CLI writes `@/` imports and may reformat files it overwrites. Rewrite `@/` to `#/` (Vitest has no `@/` alias) and run `pnpm format`; revert overwrites that only change formatting.
- Generated components live in `src/components/ui`. Edit them only when a change truly needs it, and say so in the PR. Product-specific components live outside `ui/`.
- Toasts use Sonner through the shadcn component. Do not add a second toast library.
- One component per file, named exports, props typed explicitly.

## Styling

- Use the theme tokens (CSS variables) defined by the shadcn setup. No hard-coded colours or one-off hex values in components.
- Layouts must work at phone width. Do not rely on hover for any essential action.
- Dark mode support is **TBD**: no theme provider is mounted yet, so Sonner follows the system theme. Do not add a bespoke solution before the decision.
- Tailwind v4 is configured in `src/styles.css`; there is no `tailwind.config` file.

## Accessibility

- Every interactive element is reachable and operable by keyboard, with a visible focus state.
- Inputs have labels; icon-only buttons have an accessible name.
- Do not convey state by colour alone.
- Respect `prefers-reduced-motion` for animation.

## Decision-tree canvas (React Flow)

- Custom nodes and edges are components in their own files. Wrap them in `memo` and keep the node `data` serialisable.
- Tree state is the source of truth; React Flow state is derived from it. Do not store domain data only inside React Flow.
- Give nodes and key controls stable `data-testid` values so E2E tests never depend on pixel positions.
- Keep per-render work cheap: no layout computation or sorting inside node components.

## State

- Server data belongs in TanStack Query (see [data-fetching.md](data-fetching.md)). Local UI state stays local. Do not copy server data into a separate client store.
