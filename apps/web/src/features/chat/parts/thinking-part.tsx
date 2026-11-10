import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#/components/ui/trace";

// The model's reasoning (ADR 0012): open while it streams, then collapsed unless the user
// opened it. Reasoning never enters the tree.
export function ThinkingPart({ content, running }: { content: string; running: boolean }) {
  const [open, setOpen] = useState<boolean>();
  const line = (
    <TraceLine status={running ? "running" : undefined}>
      <TraceIcon>
        {running ? <LoaderCircleIcon className="animate-spin" /> : <CircleCheckIcon />}
      </TraceIcon>
      <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
    </TraceLine>
  );
  // Redacted or empty reasoning has nothing to expand.
  if (!content) return line;
  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">{content}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
