import type { ReactNode } from "react";
import { type Session, SessionContext } from "./session";

// A session for component tests, with no Convex backend. Signed in unless told otherwise.
export function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    status: "signed-in",
    signInWithGoogle: async () => {},
    signOut: async () => {},
    getAccessToken: () => "fake-access-token",
    ...overrides,
  };
}

export function FakeSessionProvider({
  session = fakeSession(),
  children,
}: {
  session?: Session;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
