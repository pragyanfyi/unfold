# 2. Repository structure and release model

- Status: Accepted
- Date: 2026-11-07

## Context

Unfold starts as a web app. A CLI (Go or Rust), a plugin, and a mobile app are possible but undecided. We want a structure that does not need a painful migration if they happen.

## Decision

- **Layout:** a pnpm workspace with `apps/web` from day one. `packages/*` is added only when a second consumer needs shared code. Future non-JS surfaces (for example a Go or Rust CLI) live in their own `apps/<name>` directory with their own toolchain.
- **Branching:** trunk-based development on `main`, short-lived branches, squash merge only, linear history.
- **Commits:** Conventional Commits, enforced on the PR title because PRs are squash-merged.
- **Versioning:** SemVer, staying on `0.x` until the data model and key-handling flow settle.
- **Releases:** release-please in manifest mode with a single root package initially. Merging the release PR creates the tag and GitHub Release. Production deploys happen on release, not on every merge.
- **Sign-off:** DCO instead of a CLA.
- **Licence:** MIT.

## Consequences

- Adding a CLI or mobile app is a config change in release-please plus a new directory.
- release-please PRs created with the default `GITHUB_TOKEN` do not trigger other workflows, so required checks would never run. The release workflow must use a GitHub App token or fine-grained PAT. This is handled in the release-plumbing step.
- Contributors need to learn the commit and sign-off conventions, which tooling and CI help enforce.
