import { describe, expect, it } from "vitest";
import { describeSaveError } from "./save-error";

describe("describeSaveError", () => {
  it("explains the no-PRF case and says the key was not kept", () => {
    const info = describeSaveError(
      new Error("This authenticator does not support the WebAuthn PRF extension"),
    );
    expect(info.kind).toBe("no-prf");
    expect(info.message).toMatch(/not saved/);
    expect(info.message).toMatch(/does not keep the key any other way/);
  });

  it("recognises a cancelled prompt by the DOMException name and by the message", () => {
    const named = Object.assign(new Error("x"), { name: "NotAllowedError" });
    expect(describeSaveError(named).kind).toBe("cancelled");
    expect(describeSaveError(new Error("Passkey registration was cancelled")).kind).toBe(
      "cancelled",
    );
  });

  it("recognises a missing user gesture", () => {
    const error = new Error("Passkey registration needs a fresh user action (e.g. a click).");
    expect(describeSaveError(error).kind).toBe("needs-gesture");
  });

  it("falls back to a generic message for anything else, including non-errors", () => {
    expect(describeSaveError(new Error("boom")).kind).toBe("unknown");
    expect(describeSaveError("sk-ant-FAKE-oops").kind).toBe("unknown");
  });

  it("never repeats the raw error text, so a key in it cannot be shown", () => {
    const info = describeSaveError(new Error("failed for sk-ant-FAKE-LEAK-0123456789"));
    expect(info.message).not.toContain("sk-ant");
  });
});
