import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleHelpIcon,
  LightbulbIcon,
} from "lucide-react";
import { memo } from "react";
import type { NodeState } from "#/features/tree/derive-tree";
import { cn } from "#/lib/utils";
import { stateLabel, type TreeFlowNode } from "./flow-elements";

const STATE_ICON: Record<NodeState, typeof CircleCheckIcon> = {
  pending: CircleDashedIcon,
  answered: CircleDotIcon,
  settled: CircleCheckIcon,
  open: CircleHelpIcon,
};

// State is told by an icon and a word, and only then by the tone of the card (ADR 0014).
const STATE_TONE: Record<NodeState, string> = {
  pending: "border-dashed bg-background text-muted-foreground",
  answered: "bg-muted",
  settled: "bg-card",
  open: "border-destructive/50 bg-card",
};

// One node of the decision tree. Its size is fixed (layout-tree.ts), so the label and the
// decision are clamped to two lines each. The full text is in the chat.
function TreeNodeCard({ id, data, selected }: NodeProps<TreeFlowNode>) {
  const idea = data.kind === "idea";
  const Icon = idea ? LightbulbIcon : STATE_ICON[data.state];
  // The middle of a chain of revisits is both.
  const note = [data.asksAgain ? "Asking again" : null, data.askedAgain ? "Asked again" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      data-testid={`tree-node-${id}`}
      data-state={data.state}
      className={cn(
        "flex size-full flex-col gap-1 rounded-xl border p-3 text-card-foreground shadow-xs",
        // Focus is an outline set off from the card, so it never looks like the selection ring.
        "in-focus-visible:outline-2 in-focus-visible:outline-offset-3 in-focus-visible:outline-foreground",
        idea ? "bg-primary text-primary-foreground" : STATE_TONE[data.state],
        selected && "border-ring ring-2 ring-ring",
      )}
    >
      {/* Edges attach here. Nothing can be connected by hand. */}
      <Handle type="target" position={Position.Left} isConnectable={false} className="invisible" />
      <div className="flex items-center gap-1.5 text-xs leading-4">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span>{idea ? "Your idea" : stateLabel(data.state)}</span>
        {note ? <span className="ml-auto truncate">{note}</span> : null}
      </div>
      <p className="line-clamp-2 text-sm leading-5 font-medium">{data.label}</p>
      {data.detail ? <p className="line-clamp-2 text-xs leading-4">{data.detail}</p> : null}
      <Handle type="source" position={Position.Right} isConnectable={false} className="invisible" />
    </div>
  );
}

// React Flow also passes the node's position, which changes on every frame of a move. The
// card reads none of it, so only what it reads decides whether it renders again.
export function sameCard(
  previous: Pick<NodeProps<TreeFlowNode>, "id" | "data" | "selected">,
  next: Pick<NodeProps<TreeFlowNode>, "id" | "data" | "selected">,
): boolean {
  return (
    previous.id === next.id && previous.data === next.data && previous.selected === next.selected
  );
}

export const TreeNode = memo(TreeNodeCard, sameCard);
