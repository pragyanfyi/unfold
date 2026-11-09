import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce } from "./csp";

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

describe("makeNonce", () => {
  it("is unpredictable and different each time", () => {
    const a = makeNonce();
    expect(a).not.toBe(makeNonce());
    expect(a.length).toBeGreaterThanOrEqual(22);
  });
});
