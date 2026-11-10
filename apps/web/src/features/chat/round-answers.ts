import type { z } from "zod";
import type { askRound, proposeFinish } from "./tools";

// A round as the model asked it, and the answers the user gives (ADR 0012).
export type RoundInput = z.infer<typeof askRound.inputSchema>;
export type RoundQuestion = RoundInput["questions"][number];

// The closing summary the model proposes (ADR 0012, step 5) and the user's reply: confirm, or
// keep going with an optional note.
export type FinishInput = z.infer<typeof proposeFinish.inputSchema>;
export type FinishDecision = { confirmed: boolean; text: string | null };

// An answer is an option, the user's own text, or both. At least one must be present.
export type Answer = { optionId: string | null; text: string | null };

// The tool result for an `ask_round` call. Keys are the 1-based question numbers within the
// round; the tree derivation maps them to ids (`r2q1`), which the UI cannot compute.
export type RoundAnswers = { answers: Record<string, Answer> };

// Options are shown as A, B, C and D, and option A is the model's recommendation. The letter
// is also the option id, so it is the same every time the conversation is read back.
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function isAnswered(answer: Answer | undefined): boolean {
  return Boolean(answer && (answer.optionId || answer.text?.trim()));
}

export function isRoundComplete(
  questions: ReadonlyArray<RoundQuestion>,
  drafts: ReadonlyArray<Answer>,
) {
  return questions.every((_, index) => isAnswered(drafts[index]));
}

export function emptyAnswers(questions: ReadonlyArray<RoundQuestion>): Array<Answer> {
  return questions.map(() => ({ optionId: null, text: null }));
}

export function buildRoundAnswers(drafts: ReadonlyArray<Answer>): RoundAnswers {
  return {
    answers: Object.fromEntries(
      drafts.map((draft, index) => [
        String(index + 1),
        { optionId: draft.optionId, text: draft.text?.trim() || null },
      ]),
    ),
  };
}

// One line for the chat history: "A. Families: Mostly families", "A. Families" or the text.
export function describeAnswer(question: RoundQuestion, answer: Answer): string {
  const index = answer.optionId ? answer.optionId.charCodeAt(0) - 65 : -1;
  const option = question.options[index];
  const choice = option ? `${answer.optionId}. ${option.label}` : null;
  return [choice, answer.text?.trim() || null].filter(Boolean).join(": ");
}
