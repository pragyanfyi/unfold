# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo. Keep it short; link to `docs/` for detail.

## What this is

Unfold: a chat app where an AI interviews the user about an idea and a decision tree grows on a React Flow canvas. Bring-your-own-key, no AI gateway. Public MIT repo. See `README.md`.

## Stack and status

- **Decided:** TanStack Start/Query/Hotkeys/AI, React Flow, shadcn/ui (toasts via Sonner), Better Auth, Cloudflare D1 + Drizzle + KV, pnpm workspace (no Turborepo), Biome, Vitest, Playwright.
- **Set up:** shadcn/ui, Tailwind v4 and the Sonner `<Toaster />` (ADR 0004).
- **Not built yet:** auth, database, AI chat, canvas, hotkeys, deploy. The app is a placeholder page.
- **Roadmap:** GitHub milestone `v0.1.0` (`gh issue list`). Releases: release-please, see `docs/operations/releasing.md`.

## Layout

- `apps/web`: TanStack Start app deployed to Cloudflare Workers
- `packages/*`: shared code, created only when a second consumer exists
- `docs/adr`: decisions. `docs/internals`: coding rules by area. `docs/operations`: runbooks.

## Commands (from repo root)

```sh
pnpm install
pnpm dev          # web app on :3000
pnpm check        # Biome lint + format (use `pnpm format` to fix)
pnpm build        # also generates the TanStack route tree
pnpm typecheck    # run AFTER build; needs the generated route tree
pnpm test
```

Run `pnpm check`, `pnpm build`, `pnpm typecheck` and `pnpm test` before declaring work done.

## Rules

- **Commits / PR titles:** Conventional Commits, enforced in CI. Scopes: `web auth db ai canvas chat hotkeys deps release`. Sign off commits (`git commit -s`).
- **Never** commit directly to `main`. Branch, PR, squash-merge. Do not edit `CHANGELOG.md`; release-please generates it.
- **One problem per PR.** Add tests for new behaviour.
- **Secrets:** never commit or log API keys, `.env` or `.dev.vars`. BYOK keys must never be logged or stored server-side. Read `docs/adr/0003-bring-your-own-key-handling.md` before touching AI or key code.
- **Formatting:** Biome owns lint and format. Do not add ESLint or Prettier.
- Do not hand-edit `apps/web/src/routeTree.gen.ts`.
- Prefer small, focused changes. Do not add dependencies without a reason in the PR.
- Read the matching file in `docs/internals/` before changing UI, data fetching, hotkeys, secrets or tests.

## Working agreements

- Ask the maintainer before anything outward-facing or hard to undo: pushing, opening or merging PRs, creating GitHub or Cloudflare resources, changing repo settings.
- Report honestly: say what was verified and what was not. Wait for CI and CodeRabbit before asking to merge.
- Gotchas: build before typecheck; tests use `vitest.config.ts` (not the Vite config); Biome uses `"preset": "recommended"`.

## Docs hygiene

Keep this file under ~60 lines. Put decisions in ADRs and procedures in `docs/operations`.
