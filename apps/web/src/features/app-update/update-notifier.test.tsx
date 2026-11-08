// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "#/components/ui/sonner";
import { UpdateNotifier } from "./update-notifier";

// __APP_VERSION__ is "test-current" (see vitest.config.ts).
function deployedVersionIs(version: string) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderNotifier() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <UpdateNotifier />
    </QueryClientProvider>,
  );
  return queryClient;
}

// Resolves once the version query has finished, so "nothing appeared" is a real result.
async function versionCheckSettled(queryClient: QueryClient, fetchMock: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

describe("UpdateNotifier", () => {
  const reload = vi.fn();

  beforeEach(() => {
    // The version check is switched off in development, which is what Vitest reports.
    vi.stubEnv("DEV", false);
    vi.stubGlobal("location", { ...window.location, reload });
    // jsdom has no matchMedia, which Sonner reads for its theme.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    toast.dismiss();
    reload.mockClear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("offers a refresh when a newer version is deployed, and Refresh reloads the page", async () => {
    deployedVersionIs("newer-build");
    renderNotifier();

    expect(await screen.findByText("A new version is ready")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when the deployed version is the one already running", async () => {
    const fetchMock = deployedVersionIs("test-current");
    const queryClient = renderNotifier();

    await versionCheckSettled(queryClient, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/version.json", expect.anything());
    expect(queryClient.getQueryState(["app-version", "latest"])?.data).toBe("test-current");
    expect(screen.queryByText("A new version is ready")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows nothing and does not crash when the check fails", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = renderNotifier();

    await versionCheckSettled(queryClient, fetchMock);

    expect(queryClient.getQueryState(["app-version", "latest"])?.status).toBe("error");
    expect(screen.queryByText("A new version is ready")).toBeNull();
  });

  it("offers a refresh when a lazy chunk fails to load, even if the versions match", async () => {
    deployedVersionIs("test-current");
    renderNotifier();

    window.dispatchEvent(new Event("vite:preloadError"));

    expect(await screen.findByText("A new version is ready")).toBeTruthy();
  });

  it("never reloads on its own", async () => {
    deployedVersionIs("newer-build");
    renderNotifier();

    await screen.findByText("A new version is ready");

    expect(reload).not.toHaveBeenCalled();
  });
});
