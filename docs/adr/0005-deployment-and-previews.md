# 5. Deployment and PR previews

- Status: Accepted
- Date: 2026-11-08

## Context

ADR 0002 decided that production deploys on release, not on every merge. We also want a runnable preview of each PR. The app deploys to Cloudflare Workers with the Vite plugin, and will gain D1 and KV bindings (issue #6).

## Decision

- **Production:** `deploy-production.yml` runs `wrangler deploy` when a GitHub Release is published, in the `production` GitHub environment. A manual run re-deploys a chosen tag.
- **Previews:** `preview.yml` runs `wrangler versions upload --name unfold-preview --preview-alias pr-<number>` for same-repo PRs, in the `preview` environment, and comments the alias URL on the PR.
- **Separate preview Worker:** previews go to `unfold-preview`, not to a version of `unfold`. A preview version of the production Worker would share its bindings, so once D1 and KV exist a preview could read or write production data.
- **Credentials:** one Cloudflare API token per environment, scoped to Workers Scripts Edit on this account. Account ID is a repository variable.
- **wrangler directly, not a third-party action:** `pnpm exec wrangler` uses the wrangler version pinned in the lockfile and avoids another action in the supply chain.

## Consequences

- The preview Worker must be created once by hand (error 10007 otherwise); see `docs/operations/deployment.md`.
- Previews of fork PRs do not exist. Maintainers can check out a fork PR locally.
- Preview aliases accumulate until Cloudflare's retention removes old versions.
- Adding D1 or KV requires a separate preview database and namespace, bound to `unfold-preview` only.
- Not yet verified against Cloudflare: that preview URLs are enabled for the account and that `versions upload` reports `preview_alias_url`. Source for the output shape: wrangler 4.158.0 `version-upload` output entry (`preview_url`, `preview_alias_url`) and its `--preview-alias` option, read 2026-11-08.
