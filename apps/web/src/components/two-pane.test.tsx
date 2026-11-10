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

// The tab contract: the selected tab is aria-selected and controls the panel that holds the
// content. An inactive panel stays in the DOM (hidden with CSS), so it is found by its text.
function expectSelected(tabName: "Chat" | "Canvas", text: string) {
  const tab = screen.getByRole("tab", { name: tabName });
  const panel = screen.getByText(text).closest("[role=tabpanel]");
  expect(tab.getAttribute("aria-selected")).toBe("true");
  expect(panel?.id).toBe(tab.getAttribute("aria-controls"));
  const other = screen.getByRole("tab", { name: tabName === "Chat" ? "Canvas" : "Chat" });
  expect(other.getAttribute("aria-selected")).toBe("false");
}

afterEach(cleanup);

describe("TwoPane", () => {
  it("shows the chat first and switches to the canvas with the tabs", () => {
    render(<TwoPane chat={<p>chat pane</p>} canvas={<p>canvas pane</p>} />);
    expectSelected("Chat", "chat pane");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Canvas" }));
    expectSelected("Canvas", "canvas pane");
  });

  it("keeps the hidden pane mounted, so its state survives a tab switch", () => {
    render(<TwoPane chat={<Counter />} canvas={<p>canvas pane</p>} />);
    fireEvent.click(screen.getByRole("button", { name: "count 0" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Canvas" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByRole("button", { name: "count 1" })).toBeTruthy();
  });
});
