# 14. Canvas rendering and layout

- Status: Accepted
- Date: 2026-11-12

## Context

ADR 0012 makes the canvas a view of the tree that `deriveTree(messages)` computes: one `idea` root, question nodes with one `parentId` each (solid edge), optional `dependsOn` (dashed edges), and a state per node. It leaves the layout and the look of the canvas to this ADR. The canvas pane exists as a placeholder (`features/canvas/canvas-placeholder.tsx`). `deriveTree` was specified but not built when this was written; #30 builds it first (`features/tree/derive-tree.ts`), then the canvas.

The tree is small and grows in steps. A round adds a handful of nodes, so an interview ends with tens of nodes, not thousands. It is append-only, and users cannot edit it by hand (ADR 0012). The canvas is therefore a read-only picture that has to stay calm while it grows.

What we checked (read 2026-11-12):

- **React Flow** ([layouting](https://reactflow.dev/learn/layouting/layouting), [performance](https://reactflow.dev/learn/advanced-use/performance), [accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [SSR](https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration), [attribution](https://reactflow.dev/remove-attribution)):
  - It has no layout of its own: "We have not implemented our own layouting solution yet". The page compares dagre, d3-hierarchy, d3-force and ELK. It recommends dagre for trees. It says d3-hierarchy needs a single root and "assigns the same width and height to all nodes", and that ELK is the most configurable, the most complicated, and asynchronous. None of them route edges around nodes except ELK; the edge-routing example is a paid Pro example.
  - Nodes are rendered only once they have a size. Without one they are measured after the first render. `width` and `height` on a node are for "static dimensions that are known in advance and don't change".
  - Performance advice: memoise custom nodes, memoise props passed to `<ReactFlow>`, do not read the whole node list inside components, keep node CSS simple. The page gives no node counts.
  - Keyboard support is built in: Tab moves through nodes, Enter or Space selects, Escape clears. Arrow keys move a selected node only when nodes are draggable.
  - Server rendering is supported since version 12 but needs node sizes and handle positions passed by hand.
  - The free layouting guide shows how to calculate positions once with dagre, d3-hierarchy, d3-force or ELK. The examples that lay out again when the graph changes (Auto Layout) and that animate nodes to new positions (Node Position Animation) are Pro examples under a paid licence.
  - The library is MIT. The corner attribution may be hidden only with a Pro subscription.
- **Packages** (npm registry and bundlephobia, 2026-11-12):

  | Package          | Version                     | Licence                     | Min + gzip               |
  | ---------------- | --------------------------- | --------------------------- | ------------------------ |
  | `@xyflow/react`  | 12.12.1                     | MIT                         | 60.1 kB                  |
  | `d3-hierarchy`   | 3.1.3                       | ISC                         | 5.8 kB                   |
  | `@dagrejs/dagre` | 3.1.3                       | MIT                         | 15.9 kB                  |
  | `elkjs`          | 0.12.1                      | EPL-2.0 or GPL-3.0-or-later | 447 kB                   |
  | `d3-flextree`    | 2.1.2 (last published 2022) | WTFPL                       | 2.6 kB plus d3-hierarchy |

- **This repo:** the CSP already allows inline style attributes, with React Flow named as a reason (`features/security/csp.ts`). On small screens the inactive pane is hidden with `display: none`, not unmounted (`components/two-pane.tsx`).

## Decision

None of this is built yet. #30 builds it. The sections below use the present tense for brevity; read each as planned behaviour.

### Renderer: React Flow 12, read-only

We use `@xyflow/react` 12. Nodes cannot be dragged, connected or deleted. They can be selected and focused. Panning and zooming work as usual, and we show React Flow's `Controls` (zoom and fit). We keep the attribution visible.

The canvas is loaded lazily and rendered in the browser only. The server renders the pane with its placeholder text. This keeps React Flow and the layout code out of the first chunk and avoids the hand-fed sizes that server rendering needs.

### Pipeline: messages, tree, layout, React Flow

```text
messages -> deriveTree -> layoutTree -> React Flow nodes and edges
```

`layoutTree` is a pure function from the tree's shape (ids and `parentId`) to a position for each node. React Flow's nodes and edges are built from the tree and those positions on every change, and nothing about the tree is stored only inside React Flow (`docs/internals/web-ui.md`). The selected node id is kept in app state outside React Flow, so the chat can read it (#31).

### Nodes have a fixed size

Every node has the same width and height, passed to React Flow as `width` and `height`. The label and the decision are each clamped to two lines. The full text is always in the chat.

This is the choice the rest depends on:

- layout does not wait for the browser to measure nodes, so there is no second pass and no flash of unplaced nodes;
- layout depends only on the tree's shape. Answering a round or receiving decisions changes what nodes show, not where they are. Positions change only when a round adds nodes;
- `layoutTree` can be unit tested without a browser.

Starting values are about 240 by 96 px, with 24 px between siblings and 64 px between levels. #30 tunes them.

### Layout: d3-hierarchy tidy tree, left to right

Positions come from `d3-hierarchy`'s `tree()` with `nodeSize`, fed with `parentId` only. Children are ordered by id (round, then question number).

- **Why not dagre.** Dagre lays out general graphs and may reorder siblings to reduce crossings. Our structure is a strict tree, and what we need most is that existing nodes keep their order as the tree grows. With children in id order, a new round only appends siblings or adds a level. Dagre's strengths (nodes of different sizes, several parents) are things we do not have. It is also about three times the size.
- **Why not ELK.** 447 kB, asynchronous, and built for problems we do not have.
- **Why not our own.** A tidy tree is easy to get subtly wrong, and 5.8 kB is cheap.

The tree runs **left to right**: the idea on the left, each level a column. Nodes are wide and short, so siblings stack compactly in a column and depth scrolls sideways. Top to bottom would put the 240 px width side by side for every sibling and grow very wide very fast.

`dependsOn` edges are **not** part of the layout. They are drawn dashed on top of it and may cross other nodes. We do not route edges around nodes.

### What a node and an edge show

- A node shows its label, then its decision. Until the model has written a decision it shows the raw answer (ADR 0012). The idea node shows the idea.
- State is shown by an icon and a short text (`pending`, `answered`, `settled`, `open`) as well as by colour, using theme tokens only.
- Solid edge: `parentId`. Dashed edge: `dependsOn`. A `revisits` link is not an edge. The open question is marked "asked again", and the question that revisits it says so.
- React Flow's `colorMode` stays `light` until dark mode is decided (`docs/internals/web-ui.md`).

### Growth is animated by our own small hook

When positions change, nodes move from the old position to the new one over about 300 ms. A new node starts at its parent's position, moves out and fades in. The positions are interpolated in JavaScript (`requestAnimationFrame`) and handed to React Flow each frame, so edges follow their nodes. We write this hook ourselves and do not copy the Pro example.

With `prefers-reduced-motion`, nodes are placed at once with no animation.

The viewport follows growth: after nodes are added, the canvas fits the whole tree. Following stops when the user pans or zooms, and the fit button turns it back on. On small screens a hidden pane has no size, so a fit that was due while the canvas tab was hidden runs when the tab becomes visible. This happens only while following is on. If the user has panned or zoomed, switching tabs keeps their viewport.

### Performance

- Expected size is tens of nodes. The design budget is 300.
- Layout runs once per change of tree shape, not per streamed token. `deriveTree` is cheap, and `layoutTree` is memoised on the shape.
- Custom nodes and edges are wrapped in `memo`. `nodeTypes`, `edgeTypes` and callbacks are stable references.
- `onlyRenderVisibleElements` stays off unless a measurement shows a need.
- We do not add collapsing of subtrees now.

### Testing

- `layoutTree` has unit tests: no two nodes overlap, children are to the right of their parent, sibling order is id order, and adding a round never changes the order of existing siblings. One test lays out a 1,000-node tree for the no-overlap check. No test asserts on timing.
- The rendered canvas is asserted in Playwright through `data-testid` (ADR 0011): `tree-node-{id}` with a `data-state`, and `tree-edge-{source}-{target}` with a `data-kind` of `parent` or `depends`. Tests never assert pixel positions, and run with reduced motion.

### Left to later issues

- Clicking a node scrolls the chat, and live growth while answering: #31.
- Arrow-key movement between nodes in tree order, and the accessibility pass: #32.
- A minimap, collapsing, export of the picture, and editing by hand: not planned.

## Consequences

- Two new dependencies: `@xyflow/react` and `d3-hierarchy`.
- Long decisions are cut off on the canvas. Until #31 links nodes to the chat, the user finds the full text by scrolling the chat.
- Dashed dependency edges can cross nodes and each other. If trees with many `dependsOn` links are hard to read, this needs a new ADR (for example, showing them only for the selected node).
- A deep interview makes a wide picture. Fit-to-view keeps it visible but small. Zooming and panning are how the user reads it.
- The animation hook is our code to maintain.
- Not yet verified, to be settled in #30:
  - that `d3-hierarchy`'s `tree()` keeps the order of children as given (from knowledge of the algorithm, not read in its docs on this date). The layout unit tests check it;
  - that feeding React Flow new positions on each animation frame is smooth at the 300-node budget;
  - that `fitView` accepts a duration, and how to tell a user's pan or zoom from our own fit;
  - how much of React Flow renders in jsdom. Component tests may need stand-ins for `ResizeObserver` and similar, or the canvas may be covered in Playwright only;
  - how the React Flow stylesheet sits with Tailwind v4 and the theme tokens;
  - the look itself, at 1280x800 and 390x800, checked by a person.
