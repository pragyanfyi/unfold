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
import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys";
import type { Tree } from "@unfold/interview/derive-tree";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { appHotkeys } from "#/features/hotkeys/registry";
import { type TreeFlowEdge, type TreeFlowNode, toFlow } from "./flow-elements";
import { type LayoutNode, layoutTree, NODE_HEIGHT, NODE_WIDTH, type Position } from "./layout-tree";
import { TreeEdge } from "./tree-edge";
import { moveInTree, type TreeMove } from "./tree-navigation";
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

// What React Flow tells screen readers about a node and the controls. Its defaults describe
// dragging and deleting, which this read-only canvas does not allow.
const NODE_DESCRIPTION =
  "Press Enter or Space to show it in the chat, and Escape to clear the selection. Arrow keys move between nodes: Left to the parent, Right to the first child, Up and Down to the siblings, Home to your idea.";
const ARIA_LABELS = {
  "node.a11yDescription.default": NODE_DESCRIPTION,
  // React Flow 12.12 shows this one while keyboard access is on (its condition is inverted).
  "node.a11yDescription.keyboardDisabled": NODE_DESCRIPTION,
  "controls.ariaLabel": "Canvas controls",
};

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
      {/* The arrow keys of the canvas fire only while it is mounted and has focus. */}
      <HotkeysProvider scope="canvas">
        <Flow {...props} />
      </HotkeysProvider>
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

  // Arrow keys move focus between nodes along the tree (tree-navigation.ts). Focus, not the
  // selection, moves: Enter or Space then shows the node in the chat. React Flow pans to a
  // focused node that is out of view.
  const moveFocus = useCallback(
    (move: TreeMove) => (event: KeyboardEvent) => {
      const from = (event.target as Element | null)?.closest<HTMLElement>(".react-flow__node");
      const fromId = from?.dataset.id;
      if (!fromId) return;
      const toId = moveInTree(layoutNodes, fromId, move);
      if (!toId) return;
      pane.current
        ?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(toId)}"]`)
        ?.focus();
    },
    [layoutNodes],
  );
  const onPane = { target: pane };
  useHotkey(appHotkeys["canvas.parent"], moveFocus("parent"), onPane);
  useHotkey(appHotkeys["canvas.child"], moveFocus("child"), onPane);
  useHotkey(appHotkeys["canvas.previous"], moveFocus("previous"), onPane);
  useHotkey(appHotkeys["canvas.next"], moveFocus("next"), onPane);
  useHotkey(appHotkeys["canvas.root"], moveFocus("root"), onPane);
  // Escape clears the selection, and focus stays where it is. React Flow does the same on a
  // node but then blurs it; this runs first (capture) and the key goes no further.
  useHotkey(
    appHotkeys["canvas.clear"],
    (event) => {
      if (!(event.target as Element | null)?.closest(".react-flow__node")) return;
      if (selectedId !== null) onSelect(null);
    },
    onPane,
  );

  // Selection is kept by the app, not by React Flow. A click, Enter or Space selects a node;
  // Escape (above) or a click on the background clears it.
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
        ariaLabelConfig={ARIA_LABELS}
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
