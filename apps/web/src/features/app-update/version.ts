// How often a visible tab re-checks for a new version. Releases are infrequent, so
// this is deliberately slow. Lower it if releases become daily. Focus and reconnect
// also trigger a check (see queries.ts), so a tab left idle checks when you return.
export const VERSION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// A check on focus is skipped if the last one is newer than this, so alt-tabbing
// does not repeat the request.
export const VERSION_STALE_TIME_MS = 60 * 1000;

/** Returns the version from a /version.json payload, or null if it is not valid. */
export function parseVersionPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const version = (payload as { version?: unknown }).version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

/** Fetches the latest deployed version. Rejects on any failure; callers treat that as "no news". */
export async function fetchLatestVersion(
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl("/version.json", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Version check failed with status ${response.status}`);
  const version = parseVersionPayload(await response.json());
  if (!version) throw new Error("Version check returned an unexpected payload");
  return version;
}

/**
 * Decides when to tell the user a new version exists. It notifies at most once per
 * newer version; `force` is for a hard failure (a chunk that no longer exists), where
 * the old bundle is already broken and the user should always be told.
 */
export function createUpdateNotifier(options: { currentVersion: string; notify: () => void }) {
  let notifiedFor: string | null = null;
  return {
    check(latestVersion: string): boolean {
      if (latestVersion === options.currentVersion || latestVersion === notifiedFor) return false;
      notifiedFor = latestVersion;
      options.notify();
      return true;
    },
    force(): void {
      options.notify();
    },
  };
}
