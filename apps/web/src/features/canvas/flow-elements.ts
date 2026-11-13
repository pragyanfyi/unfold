import type { Edge, Node } from "@xyflow/react";
import { describeAnswer } from "#/features/chat/round-answers";
import type { NodeState, Tree } from "#/features/tree/derive-tree";
import { NODE_HEIGHT, NODE_WIDTH, type Position } from "./layout-tree";

// React Flow's nodes and edges, built from the tree and its layout on every change
// (ADR 0014). Nothing about the tree is kept only inside React Flow.

export type TreeNodeData = {
  kind: "idea" | "question";
  label: string;
  /** The decision, or the raw answer until the model has written one. */
  detail: string | null;
  state: NodeState;
  /** This question asks an open question again. */
  asksAgain: boolean;
  /** This open question was asked again by a later one. */
  askedAgain: boolean;
};

export type EdgeKind = "parent" | "depends";
export type TreeFlowNode = Node<TreeNodeData, "tree">;
export type TreeFlowEdge = Edge<{ kind: EdgeKind }, "tree">;

const STATE_LABEL: Record<NodeState, string> = {
  pending: "Pending",
  answered: "Answered",
  settled: "Settled",
  open: "Open",
};

export function stateLabel(state: NodeState): string {
  return STATE_LABEL[state];
}

export function toFlow(
  tree: Tree,
  positions: ReadonlyMap<string, Position>,
  selectedId: string | null,
): { nodes: Array<TreeFlowNode>; edges: Array<TreeFlowEdge> } {
  const revisited = new Set(tree.nodes.flatMap((node) => (node.revisits ? [node.revisits] : [])));
  const nodes: Array<TreeFlowNode> = [];
  const edges: Array<TreeFlowEdge> = [];

  for (const node of tree.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const detail =
      node.kind === "idea"
        ? null
        : (node.decision ?? (node.answer ? describeAnswer(node, node.answer) : null));
    nodes.push({
      id: node.id,
      type: "tree",
      position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      selected: node.id === selectedId,
      ariaLabel: [node.label, node.kind === "idea" ? "Your idea" : stateLabel(node.state), detail]
        .filter(Boolean)
        .join(". "),
      data: {
        kind: node.kind,
        label: node.label,
        detail,
        state: node.state,
        asksAgain: node.revisits !== null,
        askedAgain: revisited.has(node.id),
      },
    });

    if (node.parentId === null) continue;
    edges.push(edge("parent", node.parentId, node.id));
    // A dependency on the parent is already drawn as the solid edge.
    for (const source of new Set(node.dependsOn)) {
      if (source !== node.parentId) edges.push(edge("depends", source, node.id));
    }
  }
  return { nodes, edges };
}

function edge(kind: EdgeKind, source: string, target: string): TreeFlowEdge {
  return {
    id: `${kind}-${source}-${target}`,
    type: "tree",
    source,
    target,
    data: { kind },
    selectable: false,
    focusable: false,
  };
}
