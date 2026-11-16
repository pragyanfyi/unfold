import { describe, expect, it } from "vitest";
import type { TreeFlowNode } from "./flow-elements";
import { sameCard } from "./tree-node";

const data = { label: "Who is it for?" } as unknown as TreeFlowNode["data"];

describe("sameCard", () => {
  it("skips a render when only the position changed", () => {
    const previous = { id: "r1q1", data, selected: false, positionAbsoluteX: 0 };
    const next = { id: "r1q1", data, selected: false, positionAbsoluteX: 40 };
    expect(sameCard(previous, next)).toBe(true);
  });

  it("renders when the data, the selection or the id changed", () => {
    const card = { id: "r1q1", data, selected: false };
    expect(sameCard(card, { ...card, data: { ...data } })).toBe(false);
    expect(sameCard(card, { ...card, selected: true })).toBe(false);
    expect(sameCard(card, { ...card, id: "r1q2" })).toBe(false);
  });
});
