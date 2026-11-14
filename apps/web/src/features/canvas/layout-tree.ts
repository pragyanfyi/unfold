import { hierarchy, tree } from "d3-hierarchy";

// Where each node of the decision tree sits on the canvas (ADR 0014). A pure function of the
// tree's shape: ids and `parentId` only. What a node shows (its answer, decision or state)
// never moves it, so positions change only when a round adds nodes.
//
// The tree runs left to right: the idea on the left, each level a column. Every node has the
// same size, so the layout needs no measuring by the browser and can be tested without one.

export const NODE_WIDTH = 240;
// Room for a state line, two lines of label and two lines of decision.
export const NODE_HEIGHT = 120;
/** Space between two nodes in the same column. */
export const SIBLING_GAP = 24;
/** Space between two columns. */
export const LEVEL_GAP = 64;
// Children of different parents get a little more room, so groups can be told apart.
const COUSIN_SEPARATION = 1.5;

export type LayoutNode = { id: string; parentId: string | null };
/** The top-left corner of a node. */
export type Position = { x: number; y: number };

// `nodes` must be in id order (as `deriveTree` returns them), because children are placed in
// the order they appear. That keeps existing siblings in order as the tree grows.
//
// A node that cannot be reached from the root gets no position. `deriveTree` never returns
// one: it rejects a question whose parent is unknown.
export function layoutTree(nodes: ReadonlyArray<LayoutNode>): Map<string, Position> {
  const positions = new Map<string, Position>();
  const root = nodes.find((node) => node.parentId === null);
  if (!root) return positions;

  const children = new Map<string, Array<LayoutNode>>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const siblings = children.get(node.parentId);
    if (siblings) siblings.push(node);
    else children.set(node.parentId, [node]);
  }

  // d3 lays a tree out top to bottom: `x` runs across a level and `y` down the levels. Ours
  // runs left to right, so the two are swapped on the way in and on the way out.
  const layout = tree<LayoutNode>()
    .nodeSize([NODE_HEIGHT + SIBLING_GAP, NODE_WIDTH + LEVEL_GAP])
    .separation((a, b) => (a.parent === b.parent ? 1 : COUSIN_SEPARATION));
  const placed = layout(hierarchy(root, (node) => children.get(node.id)));
  for (const node of placed.descendants()) {
    positions.set(node.data.id, { x: node.y, y: node.x });
  }
  return positions;
}
