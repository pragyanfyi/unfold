# 5. Production deployment

- Status: Accepted
- Date: 2026-11-08

## Context

ADR 0002 decided that production deploys on release, not on every merge. The app deploys to Cloudflare Workers with the Vite plugin, and will gain D1 and KV bindings (issue #6). We also considered per-PR preview deployments.

## Decision

- **Production:** `deploy-production.yml` runs `wrangler deploy` when a GitHub Release is published, in the `production` GitHub environment. A manual run re-deploys a chosen tag, which is also the rollback path.
- **Credentials:** one Cloudflare API token, scoped to Workers Scripts Edit on this account, stored as the `CLOUDFLARE_API_TOKEN` secret of the `production` environment. The account ID is a repository variable.
- **wrangler directly, not a third-party action:** `pnpm exec wrangler` uses the wrangler version pinned in the lockfile and avoids another action in the supply chain.
- **No PR previews for now.** The app is a placeholder, there is one maintainer who can run `pnpm dev` (which uses the Workers runtime locally), and previews would add a second Worker, a second credential readable by same-repo PR workflow code, and an unverified workflow. They also never exist for fork PRs, which are the contributors who would benefit most.

## Consequences

- The first time code runs on real Cloudflare is production, on release. We rely on deliberate releases (merging the release PR), one-step rollback, and E2E tests against the local Workers runtime (issue #7).
- Revisit previews when outside contributors send UI changes, when we want E2E or smoke tests against a deployed URL, or when D1/KV exist and need real bindings. If we add them: use a **separate Worker** with its own preview databases and namespaces, never a version of the production Worker, because a preview version would share its bindings and could touch production data.
- Not yet verified against Cloudflare: the first deploy, including whether the account's `workers.dev` subdomain is set up. Source for the CLI options used: `wrangler deploy --help` (wrangler 4.158.0), read 2026-11-08.
