# 5. Production deployment

- Status: Accepted
- Date: 2026-11-08

## Context

ADR 0002 decided that production deploys on release, not on every merge. The app deploys to Cloudflare Workers with the Vite plugin, and will gain D1 and KV bindings (issue #6). We also considered per-PR preview deployments.

## Decision

- **Production:** `deploy-production.yml` runs `wrangler deploy` when a GitHub Release is published, in the `production` GitHub environment. A manual run re-deploys a chosen tag, which is also the rollback path.
- **Credentials:** one Cloudflare API token with **Workers Scripts: Edit** on this account, stored as the `CLOUDFLARE_API_TOKEN` secret of the `production` environment. The account ID is a repository variable. Cloudflare maps Workers Scripts Edit to the Editor role, which can deploy and roll back existing Workers but **cannot create them**; creating a Worker needs product-level Admin. So the `unfold` Worker is created once by a maintainer logged in with `wrangler login`, as a placeholder (deploying the app from a development checkout would publish unreleased code immediately), and CI only updates it afterwards (see `docs/operations/deployment.md`). Source: Cloudflare, "Workers permissions" (developers.cloudflare.com/workers/authorization/workers), read 2026-11-08.
- **wrangler directly, not a third-party action:** `pnpm exec wrangler` uses the wrangler version pinned in the lockfile and avoids another action in the supply chain.
- **No PR previews for now.** The app is a placeholder, there is one maintainer who can run `pnpm dev` (which uses the Workers runtime locally), and previews would add a second Worker, a second credential readable by same-repo PR workflow code, and an unverified workflow. GitHub does not pass secrets to workflows triggered from forks (docs.github.com, "Using secrets in GitHub Actions", read 2026-11-08), so a safe preview for fork PRs would need extra design (for example, building untrusted code without credentials and deploying in a separate trusted step). We have not designed that.

## Consequences

- The first time code runs on real Cloudflare is production, on release. Today's safeguards are deliberate releases (merging the release PR, which runs the required checks), one-step rollback, and local development on the Workers runtime. E2E tests against the local Workers runtime are **planned** (issue #7) and do not exist yet.
- Revisit previews when outside contributors send UI changes, when we want E2E or smoke tests against a deployed URL, or when D1/KV exist and need real bindings. If we add them: use a **separate Worker** with its own preview databases and namespaces, never a version of the production Worker, because a preview version would share its bindings and could touch production data.
- The one-time creation of `unfold` is a manual step with elevated credentials. It was done on 2026-11-08 with a placeholder. Once the Worker exists, the CI token can be narrowed to Editor on that single Worker (Cloudflare does not allow per-Worker access for a Worker that does not exist yet).
- Not yet verified against Cloudflare: the first deploy, including whether the account's `workers.dev` subdomain is set up. Source for the CLI options used: `wrangler deploy --help` (wrangler 4.158.0), read 2026-11-08.
