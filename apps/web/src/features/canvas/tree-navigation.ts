import type { LayoutNode } from "./layout-tree";

// Where an arrow key moves keyboard focus on the canvas (#32). The tree runs left to right, so
// Left and Right follow its levels and Up and Down follow the column: Left is the parent, Right
// the first child, Up and Down the previous and next sibling. Home goes to the idea.
//
// `nodes` are in the order `layoutTree` places them, so siblings are listed top to bottom.

export type TreeMove = "parent" | "child" | "previous" | "next" | "root";

/** The node a move leads to, or `null` when there is none (the user stays where they are). */
export function moveInTree(
  nodes: ReadonlyArray<LayoutNode>,
  fromId: string,
  move: TreeMove,
): string | null {
  const from = nodes.find((node) => node.id === fromId);
  if (!from) return null;
  switch (move) {
    case "root":
      return nodes.find((node) => node.parentId === null)?.id ?? null;
    case "parent":
      return from.parentId;
    case "child":
      return nodes.find((node) => node.parentId === from.id)?.id ?? null;
    case "previous":
    case "next": {
      if (from.parentId === null) return null;
      const siblings = nodes.filter((node) => node.parentId === from.parentId);
      const index = siblings.findIndex((node) => node.id === from.id);
      return siblings[move === "next" ? index + 1 : index - 1]?.id ?? null;
    }
  }
}
