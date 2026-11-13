// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasPane } from "./canvas-pane";

afterEach(cleanup);

// The drawn tree needs a layout engine, so it is checked in Playwright (e2e/interview.spec.ts).
describe("CanvasPane", () => {
  it("says what will appear, before there is a tree", () => {
    render(<CanvasPane tree={null} selectedId={null} onSelect={() => {}} />);
    const pane = screen.getByRole("region", { name: "Decision tree" });
    expect(pane.textContent).toMatch(/will grow here as you answer/);
  });

  it("says the same for a tree with no nodes, without loading the canvas", () => {
    const tree = { nodes: [], status: "interviewing" as const, summary: null, rejected: [] };
    render(<CanvasPane tree={tree} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/will grow here as you answer/)).toBeTruthy();
    expect(screen.queryByTestId("tree-canvas")).toBeNull();
  });
});
