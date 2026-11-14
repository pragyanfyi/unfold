import {
  Controls,
  type EdgeTypes,
  type NodeTypes,
  type OnMoveStart,
  type OnNodesChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Tree } from "#/features/tree/derive-tree";
import { type TreeFlowEdge, type TreeFlowNode, toFlow } from "./flow-elements";
import { type LayoutNode, layoutTree } from "./layout-tree";
import { TreeEdge } from "./tree-edge";
import { TreeNode } from "./tree-node";

// The decision tree drawn with React Flow (ADR 0014). It is a read-only picture: nodes can be
// selected and focused, and nothing can be dragged, connected or deleted. This file is loaded
// lazily (canvas-pane.tsx), which keeps React Flow out of the first chunk.

const nodeTypes: NodeTypes = { tree: TreeNode };
const edgeTypes: EdgeTypes = { tree: TreeEdge };
// A lone idea node is not blown up to fill the pane.
const FIT = { padding: 0.15, maxZoom: 1 };

export type TreeCanvasProps = {
  tree: Tree;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export default function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}

function Flow({ tree, selectedId, onSelect }: TreeCanvasProps) {
  // Layout depends on the shape alone, so answers and decisions never move a node.
  const shape = JSON.stringify(
    tree.nodes.map(({ id, parentId }): LayoutNode => ({ id, parentId })),
  );
  const positions = useMemo(() => layoutTree(JSON.parse(shape) as Array<LayoutNode>), [shape]);
  const { nodes, edges } = useMemo(
    () => toFlow(tree, positions, selectedId),
    [tree, positions, selectedId],
  );

  // The view follows the tree as it grows, until the user pans or zooms. The fit button turns
  // following back on.
  const { fitView } = useReactFlow<TreeFlowNode, TreeFlowEdge>();
  const following = useRef(true);
  const fitTree = useCallback(() => {
    if (following.current) void fitView(FIT);
  }, [fitView]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `shape` is the trigger. Fit again when the tree gains nodes.
  useEffect(fitTree, [fitTree, shape]);
  // A user's pan or zoom comes with its event. Our own fit has none, and neither have the
  // zoom buttons, which say so themselves.
  const onMoveStart = useCallback<OnMoveStart>((event) => {
    if (event) following.current = false;
  }, []);
  const unfollow = useCallback(() => {
    following.current = false;
  }, []);
  const follow = useCallback(() => {
    following.current = true;
  }, []);

  // A hidden pane (the other tab on a small screen) has no size, so a fit made there is lost.
  // Fit when the pane gets a size, and when that size changes.
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) fitTree();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitTree]);

  // Selection is kept by the app, not by React Flow. A click, Enter or Space selects a node;
  // Escape or a click on the background clears it.
  const onNodesChange = useCallback<OnNodesChange<TreeFlowNode>>(
    (changes) => {
      const picked = changes.find((change) => change.type === "select" && change.selected);
      if (picked?.type === "select") return onSelect(picked.id);
      const dropped = changes.some(
        (change) => change.type === "select" && !change.selected && change.id === selectedId,
      );
      if (dropped) onSelect(null);
    },
    [onSelect, selectedId],
  );

  return (
    <div ref={pane} className="size-full" data-testid="tree-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onMoveStart={onMoveStart}
        fitView
        fitViewOptions={FIT}
        minZoom={0.1}
        colorMode="light"
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
      >
        <Controls
          showInteractive={false}
          fitViewOptions={FIT}
          onFitView={follow}
          onZoomIn={unfollow}
          onZoomOut={unfollow}
        />
      </ReactFlow>
    </div>
  );
}
