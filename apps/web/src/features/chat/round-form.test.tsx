// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RoundQuestion } from "@unfold/interview/round-answers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoundForm } from "./round-form";

const questions: RoundQuestion[] = [
  {
    title: "Who is it for?",
    body: "Think about the first users.",
    label: "Audience",
    options: [{ label: "Families" }, { label: "Friends" }],
    parentId: "idea",
  },
  {
    title: "Where does it run?",
    body: "",
    label: "Platform",
    options: [{ label: "Web" }, { label: "Phone" }, { label: "Both" }],
    parentId: "idea",
  },
];

// Radix radio groups measure their items; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

describe("RoundForm", () => {
  it("shows one question at a time, with option A marked as the recommendation", () => {
    render(<RoundForm questions={questions} onSubmit={() => {}} />);
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
    expect(screen.getByText("Who is it for?")).toBeTruthy();
    expect(screen.queryByText("Where does it run?")).toBeNull();
    expect(screen.getByText("(Recommended)")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("blocks Next until there is an option or text", () => {
    render(<RoundForm questions={questions} onSubmit={() => {}} />);
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/your own answer/i), { target: { value: "  " } });
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/your own answer/i), { target: { value: "Teachers" } });
    expect(next.disabled).toBe(false);
  });

  it("submits an option, a note only, or both, and keeps answers when going back", () => {
    const onSubmit = vi.fn();
    render(<RoundForm questions={questions} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("radio", { name: /A\s*Families/ }));
    fireEvent.change(screen.getByLabelText(/your own answer/i), {
      target: { value: "Mostly families" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Second question: note only.
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/your own answer/i), { target: { value: "Not sure" } });

    // Back keeps the first answer.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (screen.getByRole("radio", { name: /A\s*Families/ }) as HTMLInputElement).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect((screen.getByLabelText(/your own answer/i) as HTMLTextAreaElement).value).toBe(
      "Mostly families",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(onSubmit).toHaveBeenCalledWith([
      { optionId: "A", text: "Mostly families" },
      { optionId: null, text: "Not sure" },
    ]);
  });

  it("does not submit while the last question is unanswered", () => {
    const onSubmit = vi.fn();
    render(<RoundForm questions={[questions[0] as RoundQuestion]} onSubmit={onSubmit} />);
    const submit = screen.getByRole("button", { name: "Submit answers" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.submit(screen.getByRole("form", { name: /questions for this round/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("reports the question on screen and the answers so far, for the canvas (#31)", () => {
    const onStepChange = vi.fn();
    const onDraftsChange = vi.fn();
    render(
      <RoundForm
        questions={questions}
        onSubmit={() => {}}
        onStepChange={onStepChange}
        onDraftsChange={onDraftsChange}
      />,
    );
    expect(onStepChange).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("radio", { name: /B\s*Friends/ }));
    expect(onDraftsChange).toHaveBeenLastCalledWith([
      { optionId: "B", text: null },
      { optionId: null, text: null },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onStepChange).toHaveBeenLastCalledWith(1);
  });

  it("starts at the question picked outside the form, and reports it", () => {
    const onStepChange = vi.fn();
    render(
      <RoundForm
        questions={questions}
        onSubmit={() => {}}
        showIndex={1}
        onStepChange={onStepChange}
      />,
    );
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    expect(onStepChange.mock.calls).toEqual([[1]]);
  });

  it("moves to the question picked outside the form, and keeps Back and Next working", () => {
    const { rerender } = render(<RoundForm questions={questions} onSubmit={() => {}} />);
    rerender(<RoundForm questions={questions} onSubmit={() => {}} showIndex={1} />);
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    // The pick stays the same, and Back still moves.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    rerender(<RoundForm questions={questions} onSubmit={() => {}} showIndex={1} />);
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
    // A pick outside the round moves nothing.
    rerender(<RoundForm questions={questions} onSubmit={() => {}} showIndex={-1} />);
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  });

  // #32: a new round replaces the control the user was on, which leaves focus on <body>.
  it("puts focus on the first option when it appears and focus was lost", () => {
    render(<RoundForm questions={questions} onSubmit={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Families/ }));
  });

  it("leaves focus where the user put it", () => {
    render(
      <>
        <button type="button">elsewhere</button>
        <RoundForm questions={questions} onSubmit={() => {}} />
      </>,
    );
    // The form mounted with the button: move focus there and show the next question.
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();
    fireEvent.click(screen.getByRole("radio", { name: /Families/ }));
    elsewhere.focus();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });
});
