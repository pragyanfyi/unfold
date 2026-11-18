// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountButton } from "./account-button";
import { FakeSessionProvider, fakeSession } from "./fake-session";
import type { Session } from "./session";

function renderButton(session: Session) {
  render(
    <FakeSessionProvider session={session}>
      <AccountButton />
    </FakeSessionProvider>,
  );
}

afterEach(cleanup);

describe("AccountButton", () => {
  it("shows nothing while the session is loading, so it never flips on load", () => {
    renderButton(fakeSession({ status: "loading" }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("starts Google sign-in, returning to the current page, when signed out", () => {
    const signInWithGoogle = vi.fn(async () => {});
    renderButton(fakeSession({ status: "signed-out", signInWithGoogle }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(signInWithGoogle).toHaveBeenCalledWith();
  });

  it("signs out when signed in, and is disabled until that finishes", async () => {
    let finish = () => {};
    const signOut = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderButton(fakeSession({ signOut }));
    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);
    expect(signOut).toHaveBeenCalledOnce();
    expect(button).toHaveProperty("disabled", true);
    finish();
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
  });
});
