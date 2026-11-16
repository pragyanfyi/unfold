import { describe, expect, it } from "vitest";
import type { LayoutNode, Position } from "./layout-tree";
import { blendFrames, easeOut, type Frame, settledFrames, startFrames } from "./position-frames";

const at = (x: number, y: number): Position => ({ x, y });
const NODES: Array<LayoutNode> = [
  { id: "idea", parentId: null },
  { id: "r1q1", parentId: "idea" },
  { id: "r2q1", parentId: "r1q1" },
];

describe("settledFrames", () => {
  it("puts every node at its place, fully visible", () => {
    expect(settledFrames(new Map([["idea", at(0, 10)]]))).toEqual(
      new Map([["idea", { x: 0, y: 10, opacity: 1 }]]),
    );
  });
});

describe("startFrames", () => {
  it("starts a node that is on the canvas from where it is shown", () => {
    const shown = new Map<string, Frame>([["idea", { x: 5, y: 7, opacity: 0.5 }]]);
    const frames = startFrames(shown, NODES, new Map([["idea", at(0, 100)]]));
    expect(frames.get("idea")).toEqual({ x: 5, y: 7, opacity: 0.5 });
  });

  it("starts a new node invisible, on top of its parent", () => {
    const shown = settledFrames(new Map([["idea", at(0, 50)]]));
    const target = new Map([
      ["idea", at(0, 0)],
      ["r1q1", at(300, 0)],
    ]);
    expect(startFrames(shown, NODES, target).get("r1q1")).toEqual({ x: 0, y: 50, opacity: 0 });
  });

  it("starts a new node whose parent is new too from the nearest ancestor shown", () => {
    const shown = settledFrames(new Map([["idea", at(0, 50)]]));
    const target = new Map([
      ["idea", at(0, 0)],
      ["r1q1", at(300, 0)],
      ["r2q1", at(600, 0)],
    ]);
    expect(startFrames(shown, NODES, target).get("r2q1")).toEqual({ x: 0, y: 50, opacity: 0 });
  });

  it("fades a node in at its place when no ancestor is shown", () => {
    const frames = startFrames(new Map(), NODES, new Map([["idea", at(0, 20)]]));
    expect(frames.get("idea")).toEqual({ x: 0, y: 20, opacity: 0 });
  });

  it("drops a node that is no longer in the layout", () => {
    const shown = settledFrames(new Map([["gone", at(0, 0)]]));
    expect(startFrames(shown, NODES, new Map([["idea", at(0, 0)]])).has("gone")).toBe(false);
  });
});

describe("blendFrames", () => {
  const from = new Map<string, Frame>([
    ["idea", { x: 0, y: 100, opacity: 1 }],
    ["r1q1", { x: 0, y: 100, opacity: 0 }],
  ]);
  const target = new Map([
    ["idea", at(0, 0)],
    ["r1q1", at(300, 200)],
  ]);

  it("is the first frame at 0 and the layout at 1", () => {
    expect(blendFrames(from, target, 0)).toEqual(from);
    expect(blendFrames(from, target, 1)).toEqual(settledFrames(target));
  });

  it("moves and fades in proportion to the progress", () => {
    const half = blendFrames(from, target, 0.5);
    expect(half.get("idea")).toEqual({ x: 0, y: 50, opacity: 1 });
    expect(half.get("r1q1")).toEqual({ x: 150, y: 150, opacity: 0.5 });
  });
});

describe("easeOut", () => {
  it("runs from 0 to 1 and covers most of the way in the first half", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});
