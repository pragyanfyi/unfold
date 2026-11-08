import { describe, expect, it, vi } from "vitest";
import { createUpdateNotifier, fetchLatestVersion, parseVersionPayload } from "./version";

describe("parseVersionPayload", () => {
  it("returns the version from a valid payload", () => {
    expect(parseVersionPayload({ version: "abc123" })).toBe("abc123");
  });

  it.each([
    ["null", null],
    ["a string", "abc123"],
    ["a missing field", {}],
    ["a non-string version", { version: 5 }],
    ["an empty version", { version: "" }],
  ])("returns null for %s", (_name, payload) => {
    expect(parseVersionPayload(payload)).toBeNull();
  });
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init);
}

describe("fetchLatestVersion", () => {
  it("requests /version.json without using the HTTP cache", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "v2" }));
    await expect(fetchLatestVersion(undefined, fetchImpl)).resolves.toBe("v2");
    expect(fetchImpl).toHaveBeenCalledWith("/version.json", {
      cache: "no-store",
      signal: undefined,
    });
  });

  it("rejects on a non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(fetchLatestVersion(undefined, fetchImpl)).rejects.toThrow("503");
  });

  it("rejects when the body is not JSON, as when an HTML page is served instead", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html></html>"));
    await expect(fetchLatestVersion(undefined, fetchImpl)).rejects.toThrow();
  });

  it("rejects on an unexpected payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    await expect(fetchLatestVersion(undefined, fetchImpl)).rejects.toThrow("unexpected payload");
  });

  it("rejects when the request itself fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(fetchLatestVersion(undefined, fetchImpl)).rejects.toThrow("offline");
  });
});

describe("createUpdateNotifier", () => {
  function setup() {
    const notify = vi.fn();
    return { notify, notifier: createUpdateNotifier({ currentVersion: "v1", notify }) };
  }

  it("stays quiet when the deployed version is the one already running", () => {
    const { notify, notifier } = setup();
    expect(notifier.check("v1")).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies once when a newer version exists", () => {
    const { notify, notifier } = setup();
    expect(notifier.check("v2")).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not repeat for the same newer version, so a dismissed toast stays dismissed", () => {
    const { notify, notifier } = setup();
    notifier.check("v2");
    expect(notifier.check("v2")).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies again when an even newer version appears", () => {
    const { notify, notifier } = setup();
    notifier.check("v2");
    expect(notifier.check("v3")).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("force always notifies, even after the user dismissed the earlier toast", () => {
    const { notify, notifier } = setup();
    notifier.check("v2");
    notifier.force();
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
