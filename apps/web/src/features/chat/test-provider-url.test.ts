import { describe, expect, it } from "vitest";
import { testProviderBaseUrl } from "./test-provider-url";

describe("testProviderBaseUrl", () => {
  it("is unset by default", () => {
    expect(testProviderBaseUrl(undefined)).toBeUndefined();
    expect(testProviderBaseUrl("")).toBeUndefined();
  });

  it.each(["http://127.0.0.1:4010", "http://localhost:4010", "http://[::1]:4010"])(
    "accepts the loopback address %s",
    (value) => {
      expect(testProviderBaseUrl(value)).toBe(value);
    },
  );

  it.each([
    "https://api.anthropic.com",
    "http://example.com",
    "http://127.0.0.1.example.com",
    "https://localhost:4010",
    "not a url",
  ])("ignores %s, so a key can never be sent to a remote host", (value) => {
    expect(testProviderBaseUrl(value)).toBeUndefined();
  });
});
