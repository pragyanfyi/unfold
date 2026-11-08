# Deployment

How Unfold reaches Cloudflare, and how to operate it.

## Overview

| What        | Workflow                                  | Runs on                                   | Worker           | GitHub environment |
| ----------- | ----------------------------------------- | ----------------------------------------- | ---------------- | ------------------ |
| Production  | `.github/workflows/deploy-production.yml` | A published GitHub Release, or manual run | `unfold`         | `production`       |
| PR previews | `.github/workflows/preview.yml`           | Same-repo PRs (opened, pushed, reopened)  | `unfold-preview` | `preview`          |

Production deploys when the release-please PR is merged and its GitHub Release is published, not on every merge to `main` (ADR 0002). Previews are separate versions of a **separate Worker**, so they never share bindings with production (see ADR 0005).

PRs from forks, Dependabot and release-please are skipped by the preview workflow: forks and Dependabot do not receive the environment secrets, and release PRs only change versions.

## Configuration

| Name                    | Kind     | Where                                | Notes                                                                                                              |
| ----------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Secret   | Environments `production`, `preview` | Cloudflare API token, **Account → Workers Scripts → Edit**, this account only. Never paste it in chat or an issue. |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Repository                           | Not a secret.                                                                                                      |

Set a secret without it touching your shell history or a chat, with the token on the clipboard:

```sh
pbpaste | gh secret set CLOUDFLARE_API_TOKEN --env production --repo pragyanfyi/unfold
pbpaste | gh secret set CLOUDFLARE_API_TOKEN --env preview --repo pragyanfyi/unfold
```

Check names only (values cannot be read back): `gh secret list --env production`. The secret name is `CLOUDFLARE_API_TOKEN`; if `gh secret list` shows anything that looks like a token, the token was typed as the name. Revoke it in Cloudflare and start again.

Add bindings' permissions (KV, D1) to the token only when a change needs them.

## One-time bootstrap

`wrangler versions upload` fails with error 10007 when the Worker does not exist yet, so the preview Worker must exist before previews work. The production Worker is created by its first deploy.

1. Make sure the account has a `workers.dev` subdomain (Cloudflare dashboard → Workers & Pages). Preview URLs depend on it.
2. Create the preview Worker once, from `apps/web` while logged in with `wrangler login`:

   ```sh
   pnpm run build
   pnpm exec wrangler deploy --name unfold-preview
   ```

## Rolling back

Re-run **Deploy production** from an older release tag (Actions → Deploy production → Run workflow → choose the tag), or use `pnpm exec wrangler rollback` from `apps/web` while logged in.

## Known limits

- **Not verified until the first run.** The workflows were checked with actionlint and by dry-running wrangler locally; neither has run against Cloudflare yet. Update this section after the first production deploy and the first preview.
- Previews are uploaded by workflow code from the PR itself. Only people with write access can open same-repo PRs, but any of them could change the workflow to read the `preview` environment secret. Keep that token narrowly scoped, and do not give it access to anything production uses.
- Preview aliases (`pr-<number>`) are not removed when a PR closes. Old preview versions of `unfold-preview` expire under Cloudflare's version retention.
- When D1 or KV bindings arrive, `unfold-preview` needs its own preview databases and namespaces, never the production ones.
