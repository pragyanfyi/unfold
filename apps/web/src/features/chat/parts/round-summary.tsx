import {
  describeAnswer,
  type RoundAnswers,
  type RoundInput,
} from "@unfold/interview/round-answers";
import { CircleCheckIcon } from "lucide-react";
import { useState } from "react";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#/components/ui/trace";
import { cn } from "#/lib/utils";

// A round that has been answered, collapsed in the history. When the user selects one of its
// nodes on the canvas (#31), it opens and marks that question.
export function RoundSummary({
  input,
  answers,
  selected = null,
  revealed = 0,
}: {
  input: RoundInput;
  answers: RoundAnswers["answers"] | undefined;
  /** The 1-based number of the question selected on the canvas. */
  selected?: number | null;
  /** Grows each time the user asks to see the selected node again. */
  revealed?: number;
}) {
  const count = input.questions.length;
  const [open, setOpen] = useState(selected !== null);
  // Open again whenever a question of this round is picked, or picked again, even after the
  // user closed it.
  const [picked, setPicked] = useState({ selected, revealed });
  if (selected !== picked.selected || revealed !== picked.revealed) {
    setPicked({ selected, revealed });
    if (selected !== null) setOpen(true);
  }
  return (
    <TraceCollapsible open={open} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <CircleCheckIcon />
          </TraceIcon>
          <TraceTitle>
            Asked {count} {count === 1 ? "question" : "questions"}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <dl className="flex flex-col gap-2">
          {input.questions.map((question, index) => {
            const answer = answers?.[String(index + 1)];
            const isSelected = selected === index + 1;
            return (
              <div
                key={question.title}
                aria-current={isSelected ? "true" : undefined}
                data-selected={isSelected ? "" : undefined}
                className={cn(
                  "rounded-md px-2 py-1",
                  isSelected && "bg-accent text-accent-foreground",
                )}
              >
                <dt>{question.title}</dt>
                <dd className="text-foreground">
                  {answer ? describeAnswer(question, answer) : "No answer"}
                </dd>
              </div>
            );
          })}
        </dl>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
