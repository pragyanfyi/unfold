import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { Textarea } from "#/components/ui/textarea";
import {
  type Answer,
  emptyAnswers,
  isAnswered,
  isRoundComplete,
  optionLetter,
  type RoundQuestion,
} from "./round-answers";

// The questionnaire for one round (ADR 0012): a stepper, one question at a time. Each question
// has a radio group (option A is the model's recommendation) and a note box. An answer is an
// option, the user's own text, or both; at least one is required. Going back keeps answers.
export function RoundForm({
  questions,
  onSubmit,
}: {
  questions: ReadonlyArray<RoundQuestion>;
  onSubmit: (answers: ReadonlyArray<Answer>) => void;
}) {
  const formId = useId();
  const [drafts, setDrafts] = useState<Array<Answer>>(() => emptyAnswers(questions));
  const [step, setStep] = useState(0);

  const question = questions[step];
  const draft = drafts[step];
  if (!question || !draft) return null;

  const last = step === questions.length - 1;
  const answered = isAnswered(draft);

  function update(patch: Partial<Answer>) {
    setDrafts((current) =>
      current.map((entry, index) => (index === step ? { ...entry, ...patch } : entry)),
    );
  }

  function next() {
    if (!answered) return;
    if (!last) {
      setStep(step + 1);
      return;
    }
    if (isRoundComplete(questions, drafts)) onSubmit(drafts);
  }

  return (
    <form
      aria-label="Questions for this round"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        next();
      }}
    >
      <p aria-live="polite" className="text-xs font-medium text-muted-foreground tabular-nums">
        Question {step + 1} of {questions.length}
      </p>
      {/* Keyed by step so focus and radio state reset cleanly between questions. */}
      <fieldset key={step} className="flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend className="font-heading text-base font-semibold text-pretty">
          {question.title}
        </legend>
        {question.body ? (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{question.body}</p>
        ) : null}
        <RadioGroup
          aria-label={question.title}
          value={draft.optionId ?? ""}
          onValueChange={(value) => update({ optionId: value })}
          className="gap-2"
        >
          {question.options.map((option, index) => {
            const letter = optionLetter(index);
            const id = `${formId}-${step}-${letter}`;
            return (
              <Label
                key={letter}
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-input px-4 py-3 text-sm font-normal has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-primary/10"
              >
                <RadioGroupItem id={id} value={letter} className="mt-0.5" />
                <span className="font-medium">{letter}</span>
                <span className="min-w-0 flex-1">
                  {option.label}
                  {index === 0 ? (
                    <span className="ml-2 text-xs text-muted-foreground">(Recommended)</span>
                  ) : null}
                </span>
              </Label>
            );
          })}
        </RadioGroup>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-note-${step}`} className="text-xs text-muted-foreground">
            Your own answer or a note (optional if you chose an option)
          </Label>
          <Textarea
            id={`${formId}-note-${step}`}
            value={draft.text ?? ""}
            onChange={(event) => update({ text: event.target.value })}
            rows={2}
          />
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          Back
        </Button>
        {last ? (
          <Button type="submit" disabled={!isRoundComplete(questions, drafts)}>
            Submit answers
          </Button>
        ) : (
          <Button type="submit" disabled={!answered}>
            Next
          </Button>
        )}
      </div>
    </form>
  );
}
