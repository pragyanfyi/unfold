import { describe, expect, it } from "vitest";
import { buildCsp, convexOrigins, convexSiteUrl, makeNonce } from "./csp";

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

describe("convexSiteUrl", () => {
  it("infers the HTTP actions origin from a convex.cloud URL alone", () => {
    expect(convexSiteUrl({ url: "https://happy-otter-123.convex.cloud" })).toBe(
      "https://happy-otter-123.convex.site",
    );
  });

  it("keeps an explicit site URL authoritative", () => {
    expect(convexSiteUrl({ url: "http://127.0.0.1:3210", siteUrl: "http://127.0.0.1:3211/" })).toBe(
      "http://127.0.0.1:3211",
    );
  });

  it("returns the HTTP origin when the site URL shares the client URL's origin", () => {
    // The CSP lists the shared origin once; the site URL must still be the https one, never wss.
    const env = { url: "https://convex.example.com", siteUrl: "https://convex.example.com" };
    expect(convexSiteUrl(env)).toBe("https://convex.example.com");
    expect(convexOrigins(env)).toContain(convexSiteUrl(env));
  });

  it("is undefined without a deployment, and always one of the CSP's origins", () => {
    expect(convexSiteUrl({})).toBeUndefined();
    const env = { url: "https://happy-otter-123.convex.cloud" };
    expect(convexOrigins(env)).toContain(convexSiteUrl(env));
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

  it("rejects a site URL that names a different Convex deployment", () => {
    expect(() =>
      convexOrigins({
        url: "https://happy-otter-123.convex.cloud",
        siteUrl: "https://other-fox-456.convex.site",
      }),
    ).toThrow(/different deployments/);
    expect(
      convexOrigins({
        url: "https://happy-otter-123.convex.cloud",
        siteUrl: "https://happy-otter-123.convex.site",
      }),
    ).toHaveLength(3);
  });

  it("rejects a client URL in the site field and the reverse", () => {
    expect(() =>
      convexOrigins({
        url: "https://happy-otter-123.convex.cloud",
        siteUrl: "https://happy-otter-123.convex.cloud",
      }),
    ).toThrow(/VITE_CONVEX_SITE_URL/);
    expect(() => convexOrigins({ url: "https://happy-otter-123.convex.site" })).toThrow(
      /VITE_CONVEX_URL is the HTTP actions URL/,
    );
  });

  it("accepts a regional deployment with its site URL given, and never guesses that URL", () => {
    expect(
      convexOrigins({
        url: "https://calm-cow-456.eu-west-1.convex.cloud",
        siteUrl: "https://calm-cow-456.eu-west-1.convex.site",
      }),
    ).toEqual([
      "https://calm-cow-456.eu-west-1.convex.cloud",
      "wss://calm-cow-456.eu-west-1.convex.cloud",
      "https://calm-cow-456.eu-west-1.convex.site",
    ]);
    expect(() => convexOrigins({ url: "https://calm-cow-456.eu-west-1.convex.cloud" })).toThrow(
      /VITE_CONVEX_SITE_URL is required/,
    );
    expect(() =>
      convexOrigins({
        url: "https://calm-cow-456.eu-west-1.convex.cloud",
        siteUrl: "https://calm-cow-456.convex.site",
      }),
    ).toThrow(/different deployments/);
  });

  it("does not infer the site of a convex.cloud URL on another port", () => {
    expect(() => convexOrigins({ url: "https://happy-otter-123.convex.cloud:8443" })).toThrow(
      /default port/,
    );
    expect(() =>
      convexOrigins({
        url: "https://calm-cow-456.eu-west-1.convex.cloud:8443",
        siteUrl: "https://calm-cow-456.eu-west-1.convex.site",
      }),
    ).toThrow(/default port/);
  });

  it("rejects hosts the browser cannot use as CSP sources", () => {
    expect(() =>
      convexOrigins({ url: "https://my_host.example.com", siteUrl: "https://a.example.com" }),
    ).toThrow(/host/);
    expect(() =>
      convexOrigins({ url: "https://[::1]:3210", siteUrl: "https://a.example.com" }),
    ).toThrow(/host the CSP cannot name/);
  });
});

describe("makeNonce", () => {
  it("is unpredictable and different each time", () => {
    const a = makeNonce();
    expect(a).not.toBe(makeNonce());
    expect(a.length).toBeGreaterThanOrEqual(22);
  });
});
