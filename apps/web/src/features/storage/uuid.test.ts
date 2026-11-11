import { describe, expect, it } from "vitest";
import { isUuid, uuidv7 } from "./uuid";

describe("uuidv7", () => {
  it("has version 7, the RFC variant and the timestamp in the first 48 bits", () => {
    const id = uuidv7(0x01_8f_00_00_00_00);
    expect(isUuid(id)).toBe(true);
    expect(id.slice(0, 13)).toBe("018f0000-0000");
    expect(id[14]).toBe("7");
    expect("89ab").toContain(id[19]);
  });

  it("sorts by creation time and does not repeat", () => {
    const ids = [1_000, 2_000, 3_000_000_000_000].map((t) => uuidv7(t));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(Array.from({ length: 50 }, () => uuidv7(5))).size).toBe(50);
  });

  it("rejects things that are not UUIDs", () => {
    expect(isUuid("../etc/passwd")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
