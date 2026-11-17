// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinishCard } from "./finish-card";

afterEach(cleanup);

describe("FinishCard", () => {
  it("is a group named by its question", () => {
    render(<FinishCard onDecide={() => {}} />);
    expect(screen.getByRole("group", { name: "Is this a shared understanding?" })).toBeTruthy();
  });

  // #32: it replaces the submitted questionnaire, which took focus with it.
  it("puts focus on the confirm button when focus was lost", () => {
    render(<FinishCard onDecide={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Looks right" }));
  });

  it("leaves focus where the user put it", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    render(<FinishCard onDecide={() => {}} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
