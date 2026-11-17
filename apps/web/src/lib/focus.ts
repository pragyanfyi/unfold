// Keyboard focus that went nowhere (#32). When the control that had focus goes away (the Send
// button once the idea is sent, a submitted questionnaire) or is hidden (the canvas tab on a
// phone), the browser leaves focus on <body> or on the hidden element, and a keyboard or screen
// reader user loses their place. The app then moves focus somewhere useful, but only in that
// case: it never takes focus from where the user put it.
//
// Focus the app moved somewhere only to hold it (the messages, while a reply loads) is
// "parked": the next control that appears may take it, as if it were lost. It stops being
// parked as soon as it moves.

const PARKED = "focusParked";

export function focusIsLost(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  if (!active.isConnected) return true;
  if (active instanceof HTMLElement && PARKED in active.dataset) return true;
  // Not in jsdom; a browser reports an element inside `display: none` as not visible.
  return typeof active.checkVisibility === "function" && !active.checkVisibility();
}

/** Focuses `element` if focus is lost. Returns whether it did. */
export function rescueFocus(element: HTMLElement | null | undefined): boolean {
  if (!element || element === document.activeElement || !focusIsLost()) return false;
  element.focus({ preventScroll: true });
  return true;
}

/** Like `rescueFocus`, but the focus is only held there until something else needs it. */
export function parkFocus(element: HTMLElement | null | undefined): boolean {
  if (!rescueFocus(element) || !element) return false;
  element.dataset[PARKED] = "";
  element.addEventListener("blur", () => delete element.dataset[PARKED], { once: true });
  return true;
}
