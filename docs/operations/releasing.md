# Releasing

Releases are automated by [release-please](https://github.com/googleapis/release-please). Nobody tags by hand and nobody edits `CHANGELOG.md`.

## How it works

1. PRs are squash-merged to `main` with Conventional Commit titles.
2. On every push to `main`, the `Release Please` workflow reads the commits since the last release and opens or updates a single **release PR** (`chore(release): X.Y.Z`) with the version bump and the generated `CHANGELOG.md`.
3. When a maintainer merges the release PR, release-please creates the `vX.Y.Z` tag and the GitHub Release. Production deploys are triggered by that release (see the deploy runbook once it exists).

| Commit type                                     | Effect while `0.x`             | Effect from `1.0.0` |
| ----------------------------------------------- | ------------------------------ | ------------------- |
| `feat`                                          | minor (0.1.0 → 0.2.0)          | minor               |
| `fix`, `perf`                                   | patch                          | patch               |
| `feat!` / `BREAKING CHANGE:`                    | minor (`bump-minor-pre-major`) | major               |
| `docs`, `chore`, `ci`, `build`, `test`, `style` | none, hidden from changelog    | none                |

`fix(deps)` commits from Dependabot count as `fix`, so dependency updates to production dependencies can open a release PR. That is intended. The PR simply stays open until a maintainer decides to ship.

The release also bumps `version` in the root `package.json` and `apps/web/package.json`, so the running app can report the version it was built from.

## Why a GitHub App token

Events created with the default `GITHUB_TOKEN` do not trigger other workflows. A release PR opened with it would never run `Check`, `DCO` or `Validate PR title`, and branch protection would block it forever. The workflow therefore uses a short-lived token minted from a GitHub App.

## One-time setup: GitHub App

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fields:
   - Name: `Unfold Release Bot` (must be globally unique; add a suffix if taken)
   - Homepage URL: `https://github.com/pragyanfyi/unfold`
   - Webhook: **uncheck Active**
   - Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Issues: Read and write** (release-please manages labels), Metadata: Read (automatic)
   - Where can this app be installed: **Only on this account**
3. Create the app. Note the **Client ID** (starts with `Iv`).
4. On the app page, **Generate a private key**. A `.pem` file downloads.
5. **Install App** on your account, selecting **only** the `unfold` repository.
6. Store the credentials in the repo:

   ```sh
   gh variable set RELEASE_APP_CLIENT_ID --repo pragyanfyi/unfold --body "<client id>"
   gh secret set RELEASE_APP_PRIVATE_KEY --repo pragyanfyi/unfold < path/to/downloaded.pem
   ```
7. Delete the downloaded `.pem` from your machine.

If the repository moves to an organisation, transfer or recreate the app under the org and update the variable and secret.

## Operating it

- **First release:** nothing is released until there is a `feat` or `fix` commit. release-please finds the last release from git tags, not from the manifest, so with no tag yet it proposes `1.0.0` regardless of the manifest's `0.0.0`. `initial-version: 0.1.0` in `release-please-config.json` sets the first version. Remove it only if you want a different first version. (Found on 2026-11-08, when the first `feat` proposed `1.0.0`; source: release-please `initialReleaseVersion()`.)
- **Force a version:** add a `Release-As: 0.1.0` footer to a commit on `main`.
- **Re-run:** push any commit, or re-run the workflow from the Actions tab.
- **Release PR checks not running?** Confirm the App is installed on the repo and the variable and secret exist.
- **Never** edit `CHANGELOG.md` or the manifest manually.

## Troubleshooting

| Symptom                            | Likely cause                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `create-github-app-token` fails    | Variable or secret missing, or the App is not installed on this repo                                |
| Release PR opens but has no checks | The PR was opened by `GITHUB_TOKEN`; check the workflow uses the App token                          |
| Release PR title check fails       | `pull-request-title-pattern` in `release-please-config.json` must stay `chore(release): ${version}` |
| Biome fails on the release PR      | `CHANGELOG.md` must stay in the Biome ignore list                                                   |
