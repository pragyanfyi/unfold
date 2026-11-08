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

Add KV or D1 permissions to the token only when a change needs them.

## First deploy (one-time, manual)

The CI token has **Workers Scripts: Edit**, which Cloudflare maps to the Editor role. Editor can deploy and roll back an existing Worker but cannot create one; creating a Worker needs product-level Admin (source: Cloudflare "Workers permissions", read 2026-11-08). So create `unfold` once yourself, then let CI take over:

1. If the account has no `workers.dev` subdomain yet, set one in the Cloudflare dashboard (Workers & Pages), or the deploy can fail on the `workers.dev` route.
2. From `apps/web`, logged in with `wrangler login` (your own login has the needed rights):

   ```sh
   pnpm run build
   pnpm exec wrangler deploy
   ```

3. Optional hardening once the Worker exists: change the CI token to Editor on the single `unfold` Worker instead of account-wide Workers Scripts Edit. Cloudflare does not allow per-Worker access to a Worker that does not exist yet, which is why the order matters.

## Rolling back

Re-run **Deploy production** from an older release tag (Actions → Deploy production → Run workflow → under "Use workflow from" choose the tag, not a branch). The first step rejects branches and unpublished tags, or use `pnpm exec wrangler rollback` from `apps/web` while logged in with `wrangler login`.

## Known limits

- **Not verified until the first run.** The workflow was checked with actionlint, and `wrangler deploy --dry-run` succeeds locally; it has not run against Cloudflare. Update this section after the first production deploy.
