# Development

## Prerequisites

- Node.js 24 (see `.nvmrc`; with nvm run `nvm use`)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)

You do **not** need a Cloudflare or Convex account to run Unfold locally.

## First checkout

```sh
git clone https://github.com/pragyanfyi/unfold.git
cd unfold
corepack enable
pnpm install
pnpm dev
```

The app runs at http://localhost:3000. `pnpm dev` also starts a local Convex backend (see below).

## Convex

The backend lives in `packages/backend` (`@unfold/backend`), shared by every app that will need it ([ADR 0015](../adr/0015-convex-end-to-end-backend.md)). Its `convex/` folder holds the schema and the functions.

- `pnpm dev` runs `convex dev` there next to the web app. The first run downloads the Convex backend binary and starts a **local** deployment with no account, at `http://127.0.0.1:3210` (HTTP actions on `:3211`). Its data lives in `packages/backend/.convex/`, its settings in `packages/backend/.env.local`; both are git-ignored. Delete `.convex/` to start from an empty database.
- `convex dev` watches `convex/`, pushes every change to the local backend and regenerates `convex/_generated`. **Commit the generated files**: CI fails when they are out of date.
- To use a cloud development deployment instead, run `pnpm --filter @unfold/backend exec convex dev --configure` once and log in. A configured deployment is kept; the local default applies only before one is chosen.
- `pnpm --filter @unfold/backend run deploy:check` does what the CI job **Convex deploy check** does: typecheck and push once, then exit. It pushes to whichever deployment `.env.local` names.

The web app reads its Convex deployment from `VITE_CONVEX_URL` and, when that is not a `*.convex.cloud` URL, `VITE_CONVEX_SITE_URL`, needed unless the client URL is `<name>.convex.cloud` (in `apps/web/.env.local` or the environment). The build puts exactly those origins in the CSP's `connect-src` and fails on a malformed value. Development's CSP already allows any `http:` and `ws:` connection, so for the local backend you can leave them unset until the web app calls Convex.

### Sign-in (Convex Auth)

Accounts use Convex Auth v2 with Google ([ADR 0016](../adr/0016-sign-up-and-onboarding.md)). The backend declares two required environment variables, `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`, and Convex refuses a push to a deployment that lacks them.

- `pnpm dev` and `deploy:check` run `scripts/ensure-local-env.mjs` first. It gives the local backend **placeholder** values for any of them that are missing and keeps real ones. With placeholders the backend deploys and the tests run, but Google sign-in does not work.
- To try real Google sign-in, create a Google OAuth client with the redirect URI `http://127.0.0.1:3211/oauth/google/callback` and set it on the local backend: `pnpm --filter @unfold/backend exec convex env set AUTH_GOOGLE_CLIENT_ID` (and `..._SECRET`), typing the value at the prompt so it stays out of your shell history. Never commit or paste these values.
- Production's redirect URI is `https://calculating-tern-733.convex.site/oauth/google/callback`. The origins the app may return to are listed in `convex/auth.ts` (`ALLOWED_REDIRECT_ORIGINS`); add an origin there when the app is served from a new one.
- `E2E_PASSWORD_SIGN_UP=1` turns on the password sign-up that E2E tests use instead of Google. Set it only on the local E2E backend. **Never set it on production**; the deploy workflow fails if it is.
- `pnpm --filter @unfold/backend test` runs the backend unit tests (`convex-test`, in memory).

Schema changes must stay backward compatible (ADR 0015, Data model): add a field before code uses it, migrate, and remove the old one only when nothing reads it.

## Everyday commands

| Command              | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm dev`           | Start the web app and a local Convex backend                      |
| `pnpm check`         | Biome lint and format check                                       |
| `pnpm format`        | Auto-format everything                                            |
| `pnpm build`         | Production build (also generates `apps/web/src/routeTree.gen.ts`) |
| `pnpm typecheck`     | TypeScript check. Run after `build` on a fresh checkout           |
| `pnpm test`          | Unit tests (Vitest)                                               |
| `pnpm test:e2e`      | Build, then Chromium E2E tests against a fake AI provider         |
| `pnpm test:coverage` | Unit test coverage report (no threshold)                          |

CI runs the same steps: lint, build, typecheck, test, plus the Convex deploy check. A separate, not-yet-required `E2E (Playwright)` job runs the E2E tests. The first time, install the browser with `pnpm --filter @unfold/web exec playwright install chromium`. E2E uses a fake AI provider, so it needs no key and no account (see `docs/internals/testing.md`).

## Making a change

1. `git switch -c fix/short-topic`
2. Make the change, add tests
3. `pnpm check && pnpm build && pnpm typecheck && pnpm test`
4. `git commit -s` with a Conventional Commit message
5. Open a PR. The title must follow Conventional Commits; see [CONTRIBUTING](../../CONTRIBUTING.md).

## Notes

- `apps/web/vitest.config.ts` is separate from `vite.config.ts` because the Cloudflare plugin cannot run inside Vitest. Tests that need the Workers runtime will use a dedicated setup when we add them.
- `apps/web/src/routeTree.gen.ts` is generated by TanStack Router and committed. Do not edit it by hand.
