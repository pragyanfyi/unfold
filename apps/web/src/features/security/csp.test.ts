import { describe, expect, it } from "vitest";
import { buildCsp, convexOrigins, makeNonce } from "./csp";

function directive(csp: string, name: string) {
  return csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

describe("buildCsp", () => {
  const csp = buildCsp("abc123");

  it("allows scripts only from our origin or with the nonce", () => {
    const script = directive(csp, "script-src");
    expect(script).toBe("script-src 'self' 'nonce-abc123'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("lets the browser talk only to our own origin", () => {
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("blocks plugins, base tag changes and framing", () => {
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("only loosens connect-src in development, for the dev server", () => {
    expect(directive(buildCsp("n", { dev: true }), "connect-src")).toContain("ws:");
    expect(csp).not.toContain("ws:");
  });
});

describe("buildCsp with our Convex deployment", () => {
  const connect = convexOrigins({ url: "https://happy-otter-123.convex.cloud" });

  it("adds exactly that deployment to connect-src, in production too", () => {
    expect(directive(buildCsp("n", { connect }), "connect-src")).toBe(
      "connect-src 'self' https://happy-otter-123.convex.cloud wss://happy-otter-123.convex.cloud https://happy-otter-123.convex.site",
    );
  });

  it("never allows a wildcard host", () => {
    expect(buildCsp("n", { connect })).not.toContain("*");
  });
});

describe("convexOrigins", () => {
  it("is empty when no deployment is configured", () => {
    expect(convexOrigins({})).toEqual([]);
  });

  it("derives the HTTP actions origin of a convex.cloud deployment", () => {
    expect(convexOrigins({ url: "https://happy-otter-123.convex.cloud/" })).toEqual([
      "https://happy-otter-123.convex.cloud",
      "wss://happy-otter-123.convex.cloud",
      "https://happy-otter-123.convex.site",
    ]);
  });

  it("takes an explicit site URL, and needs one off convex.cloud", () => {
    expect(
      convexOrigins({ url: "http://127.0.0.1:3210", siteUrl: "http://127.0.0.1:3211" }),
    ).toEqual(["http://127.0.0.1:3210", "ws://127.0.0.1:3210", "http://127.0.0.1:3211"]);
    expect(() => convexOrigins({ url: "https://convex.example.com" })).toThrow(/SITE_URL/);
  });

  it("rejects plain http off localhost, wildcards and non-URLs", () => {
    expect(() => convexOrigins({ url: "http://happy-otter-123.convex.cloud" })).toThrow(/https/);
    expect(() => convexOrigins({ url: "https://*.convex.cloud" })).toThrow();
    expect(() => convexOrigins({ url: "convex" })).toThrow(/not a URL/);
    expect(() => convexOrigins({ siteUrl: "https://x.convex.site" })).toThrow();
  });
});

describe("makeNonce", () => {
  it("is unpredictable and different each time", () => {
    const a = makeNonce();
    expect(a).not.toBe(makeNonce());
    expect(a.length).toBeGreaterThanOrEqual(22);
  });
});
