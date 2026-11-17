import { describe, expect, it } from "vitest";
import type { LayoutNode } from "./layout-tree";
import { moveInTree } from "./tree-navigation";

//        idea
//       /    \
//    r1q1    r1q2
//    /  \
// r2q1  r2q2
const nodes: Array<LayoutNode> = [
  { id: "idea", parentId: null },
  { id: "r1q1", parentId: "idea" },
  { id: "r1q2", parentId: "idea" },
  { id: "r2q1", parentId: "r1q1" },
  { id: "r2q2", parentId: "r1q1" },
];

describe("moveInTree", () => {
  it.each([
    ["r2q1", "parent", "r1q1"],
    ["r1q1", "parent", "idea"],
    ["idea", "parent", null],
    ["idea", "child", "r1q1"],
    ["r1q1", "child", "r2q1"],
    ["r1q2", "child", null],
    ["r1q1", "next", "r1q2"],
    ["r1q2", "next", null],
    ["r1q2", "previous", "r1q1"],
    ["r1q1", "previous", null],
    ["r2q2", "previous", "r2q1"],
    // Siblings only: the next node down the column under another parent is not one.
    ["r2q2", "next", null],
    ["idea", "next", null],
    ["r2q2", "root", "idea"],
  ] as const)("from %s, %s leads to %s", (from, move, to) => {
    expect(moveInTree(nodes, from, move)).toBe(to);
  });

  it("goes nowhere from an unknown node", () => {
    expect(moveInTree(nodes, "missing", "root")).toBeNull();
  });
});
