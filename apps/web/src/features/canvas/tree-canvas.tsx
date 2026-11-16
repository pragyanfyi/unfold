import {
  ControlButton,
  Controls,
  type EdgeTypes,
  getViewportForBounds,
  type NodeMouseHandler,
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

// React Flow's own fit icon (MIT), which it does not export.
function FitViewIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden>
      <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
    </svg>
  );
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
  // the opacity change per frame: `data` keeps its identity, so no card renders again
  // (`sameCard`).
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
  // Our own fit button: React Flow's queues its fit for the next change of nodes, which during
  // a move is the next frame, so it would fit the nodes halfway to their place.
  const follow = useCallback(() => {
    following.current = true;
    fitTree(0);
  }, [fitTree]);

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
  // A click on the node that is already selected changes nothing in React Flow, but it still
  // asks to see that node's turn in the chat again (#31).
  const onNodeClick = useCallback<NodeMouseHandler<TreeFlowNode>>(
    (_, node) => {
      if (node.id === selectedId) onSelect(node.id);
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
        onNodeClick={onNodeClick}
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
          showFitView={false}
          onZoomIn={unfollow}
          onZoomOut={unfollow}
        >
          <ControlButton
            onClick={follow}
            className="react-flow__controls-fitview"
            title="Fit view"
            aria-label="Fit view"
          >
            <FitViewIcon />
          </ControlButton>
        </Controls>
      </ReactFlow>
    </div>
  );
}
