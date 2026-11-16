import {
  Controls,
  type EdgeTypes,
  getViewportForBounds,
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
import { type LayoutNode, layoutTree, NODE_HEIGHT, NODE_WIDTH, type Position } from "./layout-tree";
import { TreeEdge } from "./tree-edge";
import { TreeNode } from "./tree-node";
import { MOVE_MS, prefersReducedMotion, useAnimatedPositions } from "./use-animated-positions";

// The decision tree drawn with React Flow (ADR 0014). It is a read-only picture: nodes can be
// selected and focused, and nothing can be dragged, connected or deleted. This file is loaded
// lazily (canvas-pane.tsx), which keeps React Flow out of the first chunk.

const nodeTypes: NodeTypes = { tree: TreeNode };
const edgeTypes: EdgeTypes = { tree: TreeEdge };
// A lone idea node is not blown up to fill the pane.
const FIT = { padding: 0.15, maxZoom: 1 };
const MIN_ZOOM = 0.1;

/** The box around every node at its place in the layout. */
function boundsOf(positions: ReadonlyMap<string, Position>) {
  const all = [...positions.values()];
  const x = Math.min(...all.map((position) => position.x));
  const y = Math.min(...all.map((position) => position.y));
  return {
    x,
    y,
    width: Math.max(...all.map((position) => position.x)) + NODE_WIDTH - x,
    height: Math.max(...all.map((position) => position.y)) + NODE_HEIGHT - y,
  };
}

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
  const layoutNodes = useMemo(() => JSON.parse(shape) as Array<LayoutNode>, [shape]);
  const positions = useMemo(() => layoutTree(layoutNodes), [layoutNodes]);
  const flow = useMemo(() => toFlow(tree, positions, selectedId), [tree, positions, selectedId]);
  // While the tree grows, each node is drawn on its way to its place. Only the position and
  // the opacity change per frame: `data` keeps its identity, so no node renders again.
  const frames = useAnimatedPositions(layoutNodes, positions);
  const nodes = useMemo(
    () =>
      flow.nodes.map((node): TreeFlowNode => {
        const frame = frames.get(node.id);
        const settled =
          !frame ||
          (frame.opacity === 1 && frame.x === node.position.x && frame.y === node.position.y);
        if (settled) return node;
        return { ...node, position: { x: frame.x, y: frame.y }, style: { opacity: frame.opacity } };
      }),
    [flow.nodes, frames],
  );

  // The view follows the tree as it grows, until the user pans or zooms. The fit button turns
  // following back on.
  //
  // The fit is worked out from the layout, not from the nodes as drawn, so the view can move
  // to where the tree will be while the nodes are still on their way.
  const { setViewport } = useReactFlow<TreeFlowNode, TreeFlowEdge>();
  const pane = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const fitTree = useCallback(
    (duration: number) => {
      const element = pane.current;
      if (!following.current || !element || positions.size === 0) return;
      // A hidden pane has no size. The observer below fits when it gets one.
      if (element.clientWidth === 0 || element.clientHeight === 0) return;
      const viewport = getViewportForBounds(
        boundsOf(positions),
        element.clientWidth,
        element.clientHeight,
        MIN_ZOOM,
        FIT.maxZoom,
        FIT.padding,
      );
      void setViewport(viewport, { duration });
    },
    [positions, setViewport],
  );
  // Fit again when the tree gains nodes, in step with their move. The first tree is placed
  // at once, and so is its view.
  const fitted = useRef(false);
  useEffect(() => {
    fitTree(fitted.current && !prefersReducedMotion() ? MOVE_MS : 0);
    fitted.current = true;
  }, [fitTree]);
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
  const size = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // The observer also reports once when it starts, which is not a change of size.
      if (width === size.current.width && height === size.current.height) return;
      size.current = { width, height };
      if (width > 0 && height > 0) fitTree(0);
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
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onMoveStart={onMoveStart}
        fitView
        fitViewOptions={FIT}
        minZoom={MIN_ZOOM}
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
