import type { LayoutNode, Position } from "./layout-tree";

// The steps between two layouts of the tree (ADR 0014, "Growth is animated"). Pure, so the
// movement can be tested without a browser or a clock.

/** Where a node is drawn at one moment, and how visible it is. */
export type Frame = Position & { opacity: number };

/** Every node at its place in the layout, fully visible. */
export function settledFrames(target: ReadonlyMap<string, Position>): Map<string, Frame> {
  const frames = new Map<string, Frame>();
  for (const [id, position] of target) frames.set(id, { ...position, opacity: 1 });
  return frames;
}

// The first frame of a move to `target`. A node already on the canvas starts where it is
// shown now, which may be the middle of an earlier move. A new node starts invisible on top
// of its parent, or of the nearest ancestor that is on the canvas.
export function startFrames(
  shown: ReadonlyMap<string, Frame>,
  nodes: ReadonlyArray<LayoutNode>,
  target: ReadonlyMap<string, Position>,
): Map<string, Frame> {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const frames = new Map<string, Frame>();
  for (const [id, position] of target) {
    const current = shown.get(id);
    if (current) {
      frames.set(id, current);
      continue;
    }
    let ancestor = parentOf.get(id) ?? null;
    while (ancestor !== null && !shown.has(ancestor)) ancestor = parentOf.get(ancestor) ?? null;
    const origin = ancestor === null ? undefined : shown.get(ancestor);
    // With no ancestor on the canvas there is nowhere to grow from: the node fades in place.
    frames.set(id, { x: origin?.x ?? position.x, y: origin?.y ?? position.y, opacity: 0 });
  }
  return frames;
}

/** The frame at `progress` (0 to 1) of the way from `from` to `target`. */
export function blendFrames(
  from: ReadonlyMap<string, Frame>,
  target: ReadonlyMap<string, Position>,
  progress: number,
): Map<string, Frame> {
  const frames = new Map<string, Frame>();
  for (const [id, end] of target) {
    const start = from.get(id);
    if (!start) {
      frames.set(id, { ...end, opacity: 1 });
      continue;
    }
    frames.set(id, {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
      opacity: start.opacity + (1 - start.opacity) * progress,
    });
  }
  return frames;
}

/** Fast at first, then slowing into place. */
export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}
