import { describe, expect, it } from "vitest";
import { modelTimeoutMessage, plainProviderError } from "../convex/chat/providerError";

// Error texts as the provider SDKs produce them, shapes copied from real responses.

// Gemini: JSON inside JSON, as seen in a real run on 2026-11-20 (#92).
function geminiError(code: number, status: string, message: string, details?: unknown[]) {
  const inner = JSON.stringify({ error: { code, message, status, details } }, null, 2);
  return JSON.stringify({
    error: { message: `${inner}\n`, code, status: "Service Unavailable" },
  });
}

// Anthropic: the HTTP status, then the JSON body.
function anthropicError(status: number, type: string, message: string) {
  return `${status} ${JSON.stringify({ type: "error", error: { type, message } })}`;
}

describe("plainProviderError", () => {
  it("names the provider's model when it is overloaded", () => {
    const gemini = geminiError(
      503,
      "UNAVAILABLE",
      "This model is currently experiencing high demand.",
    );
    expect(plainProviderError(gemini, "gemini")).toBe(
      "Gemini is busy right now. Try again in a moment.",
    );
    const claude = anthropicError(529, "overloaded_error", "Overloaded");
    expect(plainProviderError(claude, "anthropic")).toBe(
      "Claude is busy right now. Try again in a moment.",
    );
  });

  it("explains a rate limit or used-up quota", () => {
    const gemini = geminiError(429, "RESOURCE_EXHAUSTED", "Quota exceeded for metric.");
    expect(plainProviderError(gemini, "gemini")).toContain("Gemini rate limit or quota");
    const claude = anthropicError(429, "rate_limit_error", "Number of requests exceeded.");
    expect(plainProviderError(claude, "anthropic")).toContain("Claude rate limit or quota");
  });

  it("points at the key when the provider rejects it", () => {
    const gemini = geminiError(400, "INVALID_ARGUMENT", "API key not valid.", [
      { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
    ]);
    expect(plainProviderError(gemini, "gemini")).toBe(
      "Gemini did not accept your API key. Check it, or replace it under API key.",
    );
    const claude = anthropicError(401, "authentication_error", "invalid x-api-key");
    expect(plainProviderError(claude, "anthropic")).toContain("Claude did not accept your API key");
    const forbidden = anthropicError(403, "permission_error", "Not allowed.");
    expect(plainProviderError(forbidden, "anthropic")).toContain(
      "not allowed to make this request",
    );
  });

  it("falls back to the provider's own innermost message, as plain text", () => {
    const gemini = geminiError(400, "INVALID_ARGUMENT", "Request contains an invalid argument.");
    expect(plainProviderError(gemini, "gemini")).toBe("Request contains an invalid argument.");
    const claude = anthropicError(400, "invalid_request_error", "messages: field required");
    expect(plainProviderError(claude, "anthropic")).toBe("messages: field required");
  });

  it("leaves a message that is not JSON as it is", () => {
    expect(plainProviderError("Network connection lost.", "gemini")).toBe(
      "Network connection lost.",
    );
    expect(plainProviderError(modelTimeoutMessage("gemini"), "gemini")).toBe(
      "Gemini did not respond in time. Try again in a moment.",
    );
  });

  it("does not mistake a number in the text for a status code", () => {
    expect(plainProviderError("Expected at most 503 tokens.", "gemini")).toBe(
      "Expected at most 503 tokens.",
    );
  });
});
