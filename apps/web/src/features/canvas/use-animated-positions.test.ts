// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutNode, Position } from "./layout-tree";
import { MOVE_MS, useAnimatedPositions } from "./use-animated-positions";

const NODES: Array<LayoutNode> = [
  { id: "idea", parentId: null },
  { id: "r1q1", parentId: "idea" },
  { id: "r2q1", parentId: "r1q1" },
];
const ALONE = new Map<string, Position>([["idea", { x: 0, y: 100 }]]);
const GROWN = new Map<string, Position>([
  ["idea", { x: 0, y: 0 }],
  ["r1q1", { x: 300, y: 200 }],
]);
const GROWN_AGAIN = new Map<string, Position>([...GROWN, ["r2q1", { x: 600, y: 200 }]]);

function setReducedMotion(reduce: boolean) {
  // jsdom has no matchMedia.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce, media: query }));
}

function mount(first: ReadonlyMap<string, Position>) {
  return renderHook(({ target }) => useAnimatedPositions(NODES, target), {
    initialProps: { target: first },
  });
}

// One animation frame, `ms` after the last.
const frame = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAnimatedPositions", () => {
  it("places the first tree at once", () => {
    const { result } = mount(GROWN);
    expect(result.current.get("r1q1")).toEqual({ x: 300, y: 200, opacity: 1 });
  });

  it("starts a new node invisible on its parent, in the same render as the new layout", () => {
    const { result, rerender } = mount(ALONE);
    rerender({ target: GROWN });
    expect(result.current.get("idea")).toEqual({ x: 0, y: 100, opacity: 1 });
    expect(result.current.get("r1q1")).toEqual({ x: 0, y: 100, opacity: 0 });
  });

  it("moves the nodes over the duration and ends exactly on the layout", () => {
    const { result, rerender } = mount(ALONE);
    rerender({ target: GROWN });
    // The first frame starts the clock.
    frame(16);
    frame(MOVE_MS / 2);
    const idea = result.current.get("idea");
    const added = result.current.get("r1q1");
    expect(idea?.y).toBeGreaterThan(0);
    expect(idea?.y).toBeLessThan(100);
    expect(added?.x).toBeGreaterThan(0);
    expect(added?.x).toBeLessThan(300);
    expect(added?.opacity).toBeGreaterThan(0);
    expect(added?.opacity).toBeLessThan(1);

    frame(MOVE_MS);
    expect(result.current.get("idea")).toEqual({ x: 0, y: 0, opacity: 1 });
    expect(result.current.get("r1q1")).toEqual({ x: 300, y: 200, opacity: 1 });
    // The move is over: nothing is left running.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts a second move from where the first one was", () => {
    const { result, rerender } = mount(ALONE);
    rerender({ target: GROWN });
    frame(16);
    frame(MOVE_MS / 2);
    const midway = result.current.get("r1q1");

    rerender({ target: GROWN_AGAIN });
    expect(result.current.get("r1q1")).toEqual(midway);
    // The new node grows from its parent, which is still on its way.
    expect(result.current.get("r2q1")).toEqual({ x: midway?.x, y: midway?.y, opacity: 0 });

    frame(16);
    frame(MOVE_MS);
    expect(result.current.get("r1q1")).toEqual({ x: 300, y: 200, opacity: 1 });
    expect(result.current.get("r2q1")).toEqual({ x: 600, y: 200, opacity: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("places a new layout at once when the user prefers reduced motion", () => {
    setReducedMotion(true);
    const { result, rerender } = mount(ALONE);
    rerender({ target: GROWN });
    expect(result.current.get("idea")).toEqual({ x: 0, y: 0, opacity: 1 });
    expect(result.current.get("r1q1")).toEqual({ x: 300, y: 200, opacity: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops the move when the canvas goes away", () => {
    const { rerender, unmount } = mount(ALONE);
    rerender({ target: GROWN });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
