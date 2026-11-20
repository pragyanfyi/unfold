import { EMPTY_BYOK_SNAPSHOT } from "@tanstack/ai-react/byok";
import { describe, expect, it } from "vitest";
import { chatProvider, savedKey } from "./saved-key";

const snapshot = (status: object) =>
  ({ ...EMPTY_BYOK_SNAPSHOT, status }) as typeof EMPTY_BYOK_SNAPSHOT;

describe("savedKey (#48)", () => {
  it("is the stored key of whichever provider, set or locked", () => {
    expect(savedKey(snapshot({ gemini: { state: "set", masked: "••abcd" } }))?.provider).toBe(
      "gemini",
    );
    expect(savedKey(snapshot({ anthropic: { state: "locked", masked: "6789" } }))?.provider).toBe(
      "anthropic",
    );
  });

  it("ignores a failed save, which stored nothing", () => {
    const failed = snapshot({ gemini: { state: "error", masked: "••", message: "x" } });
    expect(savedKey(failed)).toBeUndefined();
    expect(chatProvider(failed)).toBe("anthropic");
  });

  it("asks for the default provider's key when none is saved", () => {
    expect(chatProvider(snapshot({}))).toBe("anthropic");
  });

  it("picks the first provider in order if two keys are ever stored", () => {
    const both = snapshot({
      gemini: { state: "set", masked: "••abcd" },
      anthropic: { state: "set", masked: "••6789" },
    });
    expect(chatProvider(both)).toBe("anthropic");
  });
});
