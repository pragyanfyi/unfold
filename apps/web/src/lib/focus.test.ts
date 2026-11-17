// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { focusIsLost, parkFocus, rescueFocus } from "./focus";

function button(name: string) {
  const element = document.createElement("button");
  element.textContent = name;
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("focus", () => {
  it("is lost on <body>, and a rescue moves it", () => {
    const target = button("target");
    expect(focusIsLost()).toBe(true);
    expect(rescueFocus(target)).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it("is not taken from where the user put it", () => {
    const mine = button("mine");
    const target = button("target");
    mine.focus();
    expect(rescueFocus(target)).toBe(false);
    expect(document.activeElement).toBe(mine);
  });

  it("is lost when the focused element is removed", () => {
    const gone = button("gone");
    const target = button("target");
    gone.focus();
    gone.remove();
    expect(rescueFocus(target)).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it("can be taken from where it was parked, until it moves", () => {
    const holder = button("holder");
    const next = button("next");
    expect(parkFocus(holder)).toBe(true);
    expect(focusIsLost()).toBe(true);
    expect(rescueFocus(next)).toBe(true);
    expect(document.activeElement).toBe(next);
    // Once the user has moved on, the holder is an ordinary element again.
    holder.focus();
    expect(focusIsLost()).toBe(false);
  });
});
