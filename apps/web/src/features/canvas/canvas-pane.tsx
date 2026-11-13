import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { Tree } from "#/features/tree/derive-tree";

// React Flow and the layout code load only when there is a tree to draw, and only in the
// browser (ADR 0014).
const TreeCanvas = lazy(() => import("./tree-canvas"));

// The canvas pane (ADR 0012): the decision tree of the interview beside the chat.
export function CanvasPane({
  tree,
  selectedId,
  onSelect,
}: {
  tree: Tree | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const empty = (
    <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      The decision tree will grow here as you answer.
    </p>
  );
  return (
    <section aria-label="Decision tree" className="h-full">
      {tree && tree.nodes.length > 0 ? (
        <ClientOnly fallback={empty}>
          <Suspense fallback={empty}>
            <TreeCanvas tree={tree} selectedId={selectedId} onSelect={onSelect} />
          </Suspense>
        </ClientOnly>
      ) : (
        empty
      )}
    </section>
  );
}
