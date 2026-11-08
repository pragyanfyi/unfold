import { queryOptions } from "@tanstack/react-query";
import { fetchLatestVersion, VERSION_CHECK_INTERVAL_MS, VERSION_STALE_TIME_MS } from "./version";

export const appVersionKeys = {
  all: ["app-version"] as const,
  latest: () => [...appVersionKeys.all, "latest"] as const,
};

// Failures are deliberately silent: this is a courtesy check, there is no UI for a
// failed check, and the next focus, reconnect or interval tries again.
// Refetching on focus and reconnect is on by default; the interval only runs while
// the tab is visible.
export const latestVersionQuery = () =>
  queryOptions({
    queryKey: appVersionKeys.latest(),
    queryFn: ({ signal }) => fetchLatestVersion(signal),
    staleTime: VERSION_STALE_TIME_MS,
    refetchInterval: VERSION_CHECK_INTERVAL_MS,
    retry: false,
    // There is no deployed build to compare with during local development.
    enabled: !import.meta.env.DEV,
  });
