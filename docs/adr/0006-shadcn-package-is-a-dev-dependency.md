# 6. The `shadcn` package is a dev dependency

- Status: Accepted
- Date: 2026-11-08
- Amends: [ADR 0004](0004-shadcn-ui-and-tailwind.md), which listed `shadcn` among the runtime packages the CLI installs. ADR 0004 is otherwise unchanged.

## Context

`shadcn init` added the `shadcn` package to `dependencies`. We only use it at build time: the stylesheet imports `shadcn/tailwind.css` from it, and its CLI adds components. Nothing from it ships in the Worker bundle (checked: no `shadcn` in the built server entry).

It brings a large transitive tree (`ts-morph` and others). Two Dependabot alerts exist only through it:

- `minimatch` 10.2.6, GHSA-g3hv-75wg-m249 (medium): pattern amplification in glob parsing. Fixed in 11.x, but `ts-morph` pins 10.x, so Dependabot reports "security update not possible".
- `deepmerge` 4.3.1, GHSA-gcqx-w48m-w2h4 (low): prototype poisoning in `mergeObject()`. No patched version exists.

Source: `pnpm why minimatch deepmerge`, the two GitHub advisories, and Dependabot alerts #1 and #2, read 2026-11-08.

## Decision

- `shadcn` is a **dev dependency** of `apps/web`.
- The two alerts stay open. They affect the CLI's handling of attacker-controlled input, not users of the app, and they clear when upstream updates. We do not add a `pnpm` override for `minimatch` 11: it could break the CLI, and we have not tested it.
- Re-check the alerts when `shadcn` is upgraded.

## Consequences

- Production dependencies no longer include the CLI's tree.
- Dependabot still reports the alerts, now with a development scope.
- CI and deploy workflows must install dev dependencies, because the build needs `shadcn/tailwind.css`. They already do (`pnpm install --frozen-lockfile`).
