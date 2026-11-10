import { CircleCheckIcon } from "lucide-react";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#/components/ui/trace";
import { describeAnswer, type RoundAnswers, type RoundInput } from "../round-answers";

// A round that has been answered, collapsed in the history.
export function RoundSummary({
  input,
  answers,
}: {
  input: RoundInput;
  answers: RoundAnswers["answers"] | undefined;
}) {
  const count = input.questions.length;
  return (
    <TraceCollapsible>
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
            return (
              <div key={question.title}>
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
