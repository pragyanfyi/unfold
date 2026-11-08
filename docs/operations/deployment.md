# Deployment

How Unfold reaches Cloudflare, and how to operate it. Decision: [ADR 0005](../adr/0005-production-deployment.md).

## Overview

Production deploys when the release-please PR is merged and its GitHub Release is published, not on every merge to `main`.

| Workflow                                  | Runs on                                   | Worker   | GitHub environment |
| ----------------------------------------- | ----------------------------------------- | -------- | ------------------ |
| `.github/workflows/deploy-production.yml` | A published GitHub Release, or manual run | `unfold` | `production`       |

There are no PR previews yet (see the ADR for when to revisit).

## Configuration

| Name                    | Kind     | Where                    | Notes                                                                                                              |
| ----------------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Secret   | Environment `production` | Cloudflare API token, **Account → Workers Scripts → Edit**, this account only. Never paste it in chat or an issue. |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Repository               | Not a secret.                                                                                                      |

Set the secret without it touching your shell history or a chat, with the token on the clipboard:

```sh
pbpaste | gh secret set CLOUDFLARE_API_TOKEN --env production --repo pragyanfyi/unfold
```

Check names only (values cannot be read back): `gh secret list --env production`. The name must be exactly `CLOUDFLARE_API_TOKEN`. If the list shows anything that looks like a token, the token was typed as the name: revoke it in Cloudflare and start again.

Add D1 permissions (for migrations in CI) to the token only when a change needs them. KV is not used (ADR 0010).

## First deploy (one-time, manual) — done 2026-11-08

The CI token has **Workers Scripts: Edit**, which Cloudflare maps to the Editor role. Editor can deploy and roll back an existing Worker but cannot create one; creating a Worker needs product-level Admin (source: Cloudflare "Workers permissions", read 2026-11-08). So `unfold` was created once by a maintainer, and CI only updates it.

The Worker was created as a **placeholder**, not by deploying the app from a development checkout: `wrangler deploy` makes the uploaded version live immediately, so deploying from a working tree could publish unreleased or uncommitted code. A small throwaway project (a Worker named `unfold` that returns "Unfold is not released yet.") was deployed with the maintainer's own `wrangler login`. The first release replaces it.

If you ever need to recreate it: make a temporary directory outside the repo with a `wrangler.jsonc` (`name: "unfold"`, `main: "index.js"`, a current `compatibility_date`) and an `index.js` that returns a plain response, then run `pnpm exec wrangler deploy --config <that file>` from `apps/web`.

The account's `workers.dev` subdomain is `pragyan-fyi`, so the Worker answers at `https://unfold.pragyan-fyi.workers.dev`.

Optional hardening: change the CI token to Editor on the single `unfold` Worker instead of account-wide Workers Scripts Edit. Cloudflare does not allow per-Worker access to a Worker that does not exist yet, which is why the order matters.

## Rolling back

Re-run **Deploy production** from an older release tag (Actions → Deploy production → Run workflow → under "Use workflow from" choose the tag, not a branch). The first step rejects branches and unpublished tags, or use `pnpm exec wrangler rollback` from `apps/web` while logged in with `wrangler login`.

## Verified

The "not yet verified" notes in [ADR 0005](../adr/0005-production-deployment.md) are a snapshot from before the first release. An Accepted ADR is not edited, so the current status is recorded here.

- **2026-11-08, first production deploy:** merging release PR #14 published release `v0.1.0`, which started **Deploy production** on its own (so the `release: published` trigger fires for a release created by the release GitHub App). The run passed the release-tag guard, built, and deployed with the Editor-level CI token, replacing the placeholder. `https://unfold.pragyan-fyi.workers.dev` then served the real app, and Cloudflare's deployment list shows version tagged `v0.1.0` with the release commit in its message.

## Known limits

- **Not yet verified:** the manual re-deploy / rollback path (running **Deploy production** from an older tag, and the guard rejecting a branch). Try it when there is a second release.
- The CI token is still account-wide Workers Scripts Edit. Narrowing it to Editor on the single `unfold` Worker is optional and not done.
