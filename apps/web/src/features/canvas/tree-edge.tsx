import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo } from "react";
import type { TreeFlowEdge } from "./flow-elements";

// An edge of the decision tree (ADR 0014): solid from a question's parent, dashed from the
// other decisions it depends on. Dashed edges are not routed around nodes.
function TreeEdgeLine({
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: EdgeProps<TreeFlowEdge>) {
  const kind = data?.kind ?? "parent";
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <g data-testid={`tree-edge-${source}-${target}`} data-kind={kind}>
      <BaseEdge
        path={path}
        style={{
          stroke: "var(--muted-foreground)",
          strokeWidth: 1.5,
          strokeDasharray: kind === "depends" ? "6 4" : undefined,
        }}
      />
    </g>
  );
}

export const TreeEdge = memo(TreeEdgeLine);
