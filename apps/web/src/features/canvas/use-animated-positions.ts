import { useEffect, useState } from "react";
import type { LayoutNode, Position } from "./layout-tree";
import { blendFrames, easeOut, type Frame, settledFrames, startFrames } from "./position-frames";

// Moves the nodes from one layout to the next (ADR 0014). Our own hook: the positions are
// worked out in JavaScript and handed to React Flow on each animation frame, so the edges
// follow their nodes.

export const MOVE_MS = 300;

/** True when the user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type State = {
  /** The layout the frames are moving to. */
  target: ReadonlyMap<string, Position>;
  /** The first frame of the move, or null when the nodes were placed at once. */
  from: ReadonlyMap<string, Frame> | null;
  frames: ReadonlyMap<string, Frame>;
};

// `target` must keep its identity while the layout is the same: a new map starts a new move.
// The tree a canvas is first shown with is placed at once, and so is every layout when the
// user prefers reduced motion.
export function useAnimatedPositions(
  nodes: ReadonlyArray<LayoutNode>,
  target: ReadonlyMap<string, Position>,
): ReadonlyMap<string, Frame> {
  const [state, setState] = useState<State>(() => ({
    target,
    from: null,
    frames: settledFrames(target),
  }));

  // A new layout is taken up during this render, not in an effect, so the new nodes are never
  // drawn a frame late or at their final place before the move starts.
  let current = state;
  if (state.target !== target) {
    const from = prefersReducedMotion() ? null : startFrames(state.frames, nodes, target);
    current = { target, from, frames: from ?? settledFrames(target) };
    setState(current);
  }

  const { from } = current;
  useEffect(() => {
    if (!from) return;
    let started: number | null = null;
    let handle = requestAnimationFrame(function step(now) {
      started ??= now;
      const progress = Math.min(1, (now - started) / MOVE_MS);
      const frames =
        progress === 1 ? settledFrames(target) : blendFrames(from, target, easeOut(progress));
      // A layout that arrived meanwhile has its own move. This one must not write over it.
      setState((latest) => (latest.from === from ? { ...latest, frames } : latest));
      if (progress < 1) handle = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(handle);
  }, [from, target]);

  return current.frames;
}
