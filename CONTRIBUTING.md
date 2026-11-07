# Contributing to Unfold

Thanks for your interest. Contributions of all sizes are welcome: bug reports, fixes, docs, tests and features.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs:** search existing [issues](https://github.com/pragyanfyi/unfold/issues), then open a bug report.
- **Ideas and features:** start a thread in [Discussions → Ideas](https://github.com/pragyanfyi/unfold/discussions/categories/ideas) so we can agree on direction before you invest time.
- **Questions:** use [Discussions → Q&A](https://github.com/pragyanfyi/unfold/discussions/categories/q-a), not issues.
- **Security problems:** never use public issues. See [SECURITY.md](.github/SECURITY.md).
- **Small fixes** (typos, docs, obvious bugs) can go straight to a PR.

## Development setup

```sh
corepack enable
pnpm install
pnpm dev
```

You need Node (version in `.nvmrc`) and pnpm, and nothing else. You do not need a Cloudflare account to run Unfold locally. Full details are in [docs/operations/development.md](docs/operations/development.md).

## Workflow

Unfold uses **trunk-based development**. `main` is always releasable.

1. Fork the repo (or branch, if you are a maintainer).
2. Create a short-lived branch: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, etc.
3. Make focused commits, signed off (see below).
4. Open a PR against `main`. Fill in the template.
5. Wait for CI and review. Address feedback with new commits.
6. A maintainer squash-merges. The PR title becomes the commit message on `main`.

### One problem per PR

A PR should solve one underlying problem. Unrelated cleanups belong in their own PR. Include the tests and docs for that change in the same PR.

## Commit and PR title convention

We follow [Conventional Commits](https://www.conventionalcommits.org). Because PRs are squash-merged, **the PR title is what matters** and CI checks it.

```
<type>(<scope>): <summary in lower case, imperative>
```

| Type                                                                  | Use for                   | Release effect |
| --------------------------------------------------------------------- | ------------------------- | -------------- |
| `feat`                                                                | A user-visible feature    | minor          |
| `fix`                                                                 | A bug fix                 | patch          |
| `perf`                                                                | A performance improvement | patch          |
| `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert` | Everything else           | none           |

Allowed scopes: `web`, `auth`, `db`, `ai`, `canvas`, `chat`, `hotkeys`, `deps`, `release`. Scopes are optional. To add one, change [`.github/workflows/pr-title.yml`](.github/workflows/pr-title.yml) in a PR.

Breaking changes use `!` (`feat(api)!: ...`) or a `BREAKING CHANGE:` footer.

Examples: `feat(canvas): collapse resolved branches`, `fix(auth): refresh expired sessions`, `docs: explain local setup`.

## Sign your commits (DCO)

Unfold uses the [Developer Certificate of Origin](https://developercertificate.org) instead of a CLA. It certifies that you wrote the change or have the right to submit it. Sign off every commit:

```sh
git commit -s -m "fix(chat): keep draft after reconnect"
```

This adds `Signed-off-by: Your Name <you@example.com>`. Forgot? Run `git rebase --signoff main` and force-push your branch. CI fails PRs with unsigned commits (bots are exempt).

## Quality bar

- All CI checks pass (lint, format, typecheck, tests, build).
- New behaviour has tests. Bug fixes have a regression test.
- UI changes include before/after screenshots in the PR.
- Docs are updated when behaviour changes.
- No secrets, API keys or personal data in code, tests, logs or screenshots.

## AI-assisted contributions

AI tools are fine. You are responsible for every line you submit: understand it, test it, and be able to explain it. If an agent did substantial work, say which model and tool at the end of the PR description.

## Releases

Maintainers do not tag by hand. [release-please](https://github.com/googleapis/release-please) reads merged commits, opens a release PR with the version bump and `CHANGELOG.md`, and merging that PR publishes the release. Never edit `CHANGELOG.md` manually.

## Architecture decisions

Significant decisions are recorded as ADRs in [docs/adr](docs/adr). If your change alters architecture, add one.
