// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./composer";

afterEach(cleanup);

describe("Composer", () => {
  it("sends on Enter, adds a line on Shift+Enter, and ignores blank text", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <Composer
        value="  "
        onChange={() => {}}
        onSubmit={onSubmit}
        busy={false}
        onStop={() => {}}
      />,
    );
    const box = screen.getByLabelText("Your idea");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <Composer
        value="An idea"
        onChange={() => {}}
        onSubmit={onSubmit}
        busy={false}
        onStop={() => {}}
      />,
    );
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("An idea");
  });

  it("swaps Send for Stop while busy, and does not send", () => {
    const onStop = vi.fn();
    const onSubmit = vi.fn();
    render(
      <Composer value="An idea" onChange={() => {}} onSubmit={onSubmit} busy onStop={onStop} />,
    );
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Your idea"), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
