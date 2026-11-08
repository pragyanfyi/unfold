# 7. New-version notification

- Status: Accepted
- Date: 2026-11-08

## Context

A tab that stays open keeps running the JavaScript it loaded, even after a new release is deployed. After a deploy the old lazily loaded chunks can disappear, and later server calls can mismatch the old client. Releases are infrequent and the project runs on Cloudflare's free tier, so the check must be cheap and quiet.

## Decision

- **Version id:** the commit SHA, from `GITHUB_SHA` in CI (`dev` locally), injected into the client as `__APP_VERSION__` and written to `/version.json` at build time (`apps/web/vite.config.ts`).
- **Static file, not a route:** `/version.json` is an emitted static asset, with `Cache-Control: no-store` set by `apps/web/public/_headers`. Requests to static assets do not invoke the Worker and are free and unlimited. Source: Cloudflare, "Static Assets: Billing and limitations" and "Headers" (developers.cloudflare.com/workers/static-assets), read 2026-11-08. `_headers` applies only to static asset responses, never to Worker-generated ones, so this must stay a real file and the Worker must not be configured with `run_worker_first` for it.
- **When we check** (TanStack Query, `features/app-update/queries.ts`):
  - on the tab becoming visible again, if the last check is older than 1 minute;
  - on reconnect;
  - every 6 hours while the tab is visible. Query's interval skips background tabs unless `refetchIntervalInBackground` is set, and it refetches on `visibilitychange`. Source: `@tanstack/query-core` 5.107.1 `focusManager.js` and `queryObserver.js`, read 2026-11-08. The interval is one constant (`VERSION_CHECK_INTERVAL_MS`); lower it if releases become frequent.
- **What the user sees:** one Sonner toast, "A new version is ready", with a **Refresh** action and a close button. It stays until acted on. Nothing else is added to the UI, and there is no release-notes link.
- **No automatic reload, ever.** A reload can destroy a half-written message and drops an in-memory BYOK key (ADR 0003).
- **Notify once per newer version.** A dismissed toast does not return until a newer version appears, so no localStorage is needed: a reload picks up the new version anyway.
- **Hard failure:** `vite:preloadError` (a lazy chunk failed to load) shows the toast every time, since the old bundle is already broken. We do not call `preventDefault`, so the router's normal error handling still runs.
- **Failures are silent:** a failed check has no UI; the next trigger tries again. This is a courtesy feature, so it is a deliberate exception to "a query that can fail must have an error state".
- **Dev:** the check is disabled in `vite dev`, where there is no deployed build to compare with.

## Planned, not built

- Once server functions exist, each response should carry the build id in a header and the client compare it with its own, which detects skew at the moment it matters without polling.

## Consequences

- A tab can run an old version for up to ~6 hours while it stays in front and no other trigger fires. Acceptable at the current release cadence.
- Multiple tabs each show their own toast.
- Adds `@tanstack/react-query` and `@tanstack/react-router-ssr-query` (the integration TanStack provides to supply the query client and carry the cache from server to browser). Both are needed for any server state later.
- Not tested in this change: behaviour against a real deploy (the first release containing it). The logic has unit tests, and the flow was exercised once by hand against a local production build in headless Chromium.
