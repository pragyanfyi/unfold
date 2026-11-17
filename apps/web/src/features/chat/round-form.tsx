import { useEffect, useId, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { Textarea } from "#/components/ui/textarea";
import { rescueFocus } from "#/lib/focus";
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
//
// It is linked to the canvas (#31): it reports the question on screen and the answers so far,
// and moves to the question whose node the user selects (`showIndex`).
export function RoundForm({
  questions,
  onSubmit,
  showIndex = null,
  onStepChange,
  onDraftsChange,
}: {
  questions: ReadonlyArray<RoundQuestion>;
  onSubmit: (answers: ReadonlyArray<Answer>) => void;
  /** The question to show, when something outside the form picks one. */
  showIndex?: number | null;
  onStepChange?: (step: number) => void;
  onDraftsChange?: (drafts: ReadonlyArray<Answer>) => void;
}) {
  const formId = useId();
  const [drafts, setDrafts] = useState<Array<Answer>>(() => emptyAnswers(questions));
  const valid = (index: number | null): index is number =>
    index !== null && index >= 0 && index < questions.length;
  const [step, setStep] = useState(() => (valid(showIndex) ? showIndex : 0));
  // Move only when the pick changes, so Back and Next still work while a node stays selected.
  const [shown, setShown] = useState(showIndex);
  if (showIndex !== shown) {
    setShown(showIndex);
    if (valid(showIndex)) setStep(showIndex);
  }

  const stepChange = useRef(onStepChange);
  stepChange.current = onStepChange;
  useEffect(() => stepChange.current?.(step), [step]);
  const draftsChange = useRef(onDraftsChange);
  draftsChange.current = onDraftsChange;
  useEffect(() => draftsChange.current?.(drafts), [drafts]);

  // A new round, or the next question after Enter in its fieldset (which is replaced), would
  // leave focus nowhere: put it on the question's options, so the user can answer at once.
  const form = useRef<HTMLFormElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for each question shown.
  useEffect(() => {
    const radios = form.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    const tabStop = [...(radios ?? [])].find((radio) => radio.tabIndex === 0) ?? radios?.[0];
    rescueFocus(tabStop);
  }, [step]);

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
      ref={form}
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
