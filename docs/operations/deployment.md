# Deployment

How Unfold reaches Convex and Cloudflare, and how to operate it. Decisions: [ADR 0005](../adr/0005-production-deployment.md), amended by [ADR 0015](../adr/0015-convex-end-to-end-backend.md).

## Overview

Production deploys when the release-please PR is merged and its GitHub Release is published, not on every merge to `main`.

| Workflow                                  | Runs on                                   | Worker   | GitHub environment |
| ----------------------------------------- | ----------------------------------------- | -------- | ------------------ |
| `.github/workflows/deploy-production.yml` | A published GitHub Release, or manual run | `unfold` | `production`       |

The workflow runs `convex deploy` in `packages/backend` with `--cmd`, which first builds the app with `VITE_CONVEX_URL` set to the URL of the deployment the deploy key belongs to, then pushes the Convex functions. The Worker deploys last. So the CSP always names the deployment that was deployed, new pages never call functions that do not exist yet, and a failed build or Convex push leaves the Worker as it was.

There are no PR previews yet (see the ADR for when to revisit).

## Configuration

| Name                    | Kind     | Where                    | Notes                                                                                                              |
| ----------------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Secret   | Environment `production` | Cloudflare API token, **Account → Workers Scripts → Edit**, this account only. Never paste it in chat or an issue. |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Repository               | Not a secret.                                                                                                      |
| `CONVEX_DEPLOY_KEY`     | Secret   | Environment `production` | Production deploy key of the Convex project (dashboard → Settings → Deploy keys). Never paste it in chat.          |

Set the secret without it touching your shell history or a chat, with the token on the clipboard:

```sh
pbpaste | gh secret set CLOUDFLARE_API_TOKEN --env production --repo pragyanfyi/unfold
```

Check names only (values cannot be read back): `gh secret list --env production`. The name must be exactly `CLOUDFLARE_API_TOKEN`. If the list shows anything that looks like a token, the token was typed as the name: revoke it in Cloudflare and start again.

The same way for Convex, with the deploy key on the clipboard:

```sh
pbpaste | gh secret set CONVEX_DEPLOY_KEY --env production --repo pragyanfyi/unfold
```

After the release-tag guard, the workflow checks that `CONVEX_DEPLOY_KEY` is set and stops before building if it is not. No deployment URL is configured anywhere: the CLI takes it from the key.

The Cloudflare token needs no other permissions. The Worker deploy runs no D1 migrations, and conversations are planned to move to Convex, not D1 (ADR 0015); until then they stay in the browser.

## First deploy (one-time, manual) — done 2026-11-08

The CI token has **Workers Scripts: Edit**, which Cloudflare maps to the Editor role. Editor can deploy and roll back an existing Worker but cannot create one; creating a Worker needs product-level Admin (source: Cloudflare "Workers permissions", read 2026-11-08). So `unfold` was created once by a maintainer, and CI only updates it.

The Worker was created as a **placeholder**, not by deploying the app from a development checkout: `wrangler deploy` makes the uploaded version live immediately, so deploying from a working tree could publish unreleased or uncommitted code. A small throwaway project (a Worker named `unfold` that returns "Unfold is not released yet.") was deployed with the maintainer's own `wrangler login`. The first release replaces it.

If you ever need to recreate it: make a temporary directory outside the repo with a `wrangler.jsonc` (`name: "unfold"`, `main: "index.js"`, a current `compatibility_date`) and an `index.js` that returns a plain response, then run `pnpm exec wrangler deploy --config <that file>` from `apps/web`.

The account's `workers.dev` subdomain is `pragyan-fyi`, so the Worker answers at `https://unfold.pragyan-fyi.workers.dev`.

Optional hardening: change the CI token to Editor on the single `unfold` Worker instead of account-wide Workers Scripts Edit. Cloudflare does not allow per-Worker access to a Worker that does not exist yet, which is why the order matters.

## Convex project — created 2026-11-18

Project `unfold` in team `pragyan-pandey`, created with the Convex CLI. Its production deployment is `calculating-tern-733` (`https://calculating-tern-733.convex.cloud`), in `aws-us-east-1` (US East, N. Virginia), which cannot be changed later. It is the project's default production deployment, so `convex deploy` targets it. Development uses a local backend (see `docs/operations/development.md`).

## Rolling back

Re-run **Deploy production** from an older release tag (Actions → Deploy production → Run workflow → under "Use workflow from" choose the tag, not a branch). The first step rejects branches and unpublished tags, or use `pnpm exec wrangler rollback` from `apps/web` while logged in with `wrangler login`.

What each path leaves in Convex:

- **`wrangler rollback` only rolls back the Worker.** Convex keeps the newer functions and schema. That is safe because Convex changes must stay backward compatible (ADR 0015, Data model): older pages keep working against newer functions.
- **Re-running an older tag** redeploys that tag's Convex functions too, if its workflow has the Convex step; tags from before Convex deploy only the Worker. A push is refused if the older schema does not match the data already stored, for example a field the older schema does not know.
- **If the Worker deploy fails after Convex deployed**, the old Worker keeps serving, with the new functions, which backward compatibility allows.
- **If the smoke test fails**, the new Worker is already live (the test runs after `wrangler deploy`, and nothing rolls it back), next to the new functions. First check which Worker version is active (`pnpm exec wrangler deployments list` from `apps/web`), then decide: roll the Worker back with `wrangler rollback`, or fix forward.
- In either case, fix forward with a new release rather than pushing older Convex code over newer data.

## Verified

The "not yet verified" notes in [ADR 0005](../adr/0005-production-deployment.md) are a snapshot from before the first release. An Accepted ADR is not edited, so the current status is recorded here.

- **2026-11-08, first production deploy:** merging release PR #14 published release `v0.1.0`, which started **Deploy production** on its own (so the `release: published` trigger fires for a release created by the release GitHub App). The run passed the release-tag guard, built, and deployed with the Editor-level CI token, replacing the placeholder. `https://unfold.pragyan-fyi.workers.dev` then served the real app, and Cloudflare's deployment list shows version tagged `v0.1.0` with the release commit in its message.

## Known limits

- **Not yet verified:** the manual re-deploy / rollback path (running **Deploy production** from an older tag, and the guard rejecting a branch). Try it when there is a second release.
- The CI token is still account-wide Workers Scripts Edit. Narrowing it to Editor on the single `unfold` Worker is optional and not done.
