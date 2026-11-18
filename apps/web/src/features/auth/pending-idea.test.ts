// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPendingIdea, readPendingIdea, savePendingIdea } from "./pending-idea";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("pending idea", () => {
  it("keeps the idea in sessionStorage until it is cleared", () => {
    expect(readPendingIdea()).toBeNull();
    savePendingIdea("A tool library");
    expect(readPendingIdea()).toBe("A tool library");
    clearPendingIdea();
    expect(readPendingIdea()).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => savePendingIdea("An idea")).not.toThrow();
    expect(readPendingIdea()).toBeNull();
  });
});
