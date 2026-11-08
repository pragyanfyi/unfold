import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { latestVersionQuery } from "./queries";
import { createUpdateNotifier } from "./version";

function showUpdateToast() {
  toast("A new version is ready", {
    id: "app-update",
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    action: { label: "Refresh", onClick: () => window.location.reload() },
  });
}

/** Renders nothing. Shows a toast when a newer deploy exists; never reloads on its own. */
export function UpdateNotifier() {
  const { data: latestVersion } = useQuery(latestVersionQuery());
  const notifier = useMemo(
    () => createUpdateNotifier({ currentVersion: __APP_VERSION__, notify: showUpdateToast }),
    [],
  );

  useEffect(() => {
    if (latestVersion) notifier.check(latestVersion);
  }, [latestVersion, notifier]);

  // Vite fires this when a lazily loaded chunk fails to load, which after a deploy
  // usually means the old chunk no longer exists.
  useEffect(() => {
    const onPreloadError = () => notifier.force();
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, [notifier]);

  return null;
}
