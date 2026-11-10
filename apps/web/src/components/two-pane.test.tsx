// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TwoPane } from "./two-pane";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      count {count}
    </button>
  );
}

// An inactive pane stays in the DOM; its tab content is hidden with CSS from data-state.
function pane(text: string) {
  return screen.getByText(text).closest("[data-slot=tabs-content]")?.getAttribute("data-state");
}

afterEach(cleanup);

describe("TwoPane", () => {
  it("shows the chat first and switches to the canvas with the tabs", () => {
    render(<TwoPane chat={<p>chat pane</p>} canvas={<p>canvas pane</p>} />);
    expect(pane("chat pane")).toBe("active");
    expect(pane("canvas pane")).toBe("inactive");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Canvas" }));
    expect(pane("canvas pane")).toBe("active");
    expect(pane("chat pane")).toBe("inactive");
  });

  it("keeps the hidden pane mounted, so its state survives a tab switch", () => {
    render(<TwoPane chat={<Counter />} canvas={<p>canvas pane</p>} />);
    fireEvent.click(screen.getByRole("button", { name: "count 0" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Canvas" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByRole("button", { name: "count 1" })).toBeTruthy();
  });
});
