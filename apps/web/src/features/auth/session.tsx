import { useOauth, useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { api } from "@unfold/backend/convex/_generated/api";
import { useConvexAuth } from "convex/react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getConvexClient } from "./convex-client";

// Who is signed in, as the rest of the app sees it (ADR 0016). Components read this context, never
// Convex Auth directly, so tests can provide a session without a backend.
//
// The state is known only in the browser: pages render as `loading` on the server and settle
// once the page loads (ADR 0016, "React client only").
export type SessionStatus = "loading" | "signed-out" | "signed-in";

export type Session = {
  status: SessionStatus;
  /**
   * Starts Google sign-in. The browser leaves for Google and comes back to `returnTo` (a path on
   * this site, the current page by default). Resolves only if the flow could not start.
   */
  signInWithGoogle: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside a SessionProvider");
  return session;
}

// The functions Convex Auth's client calls. Named here so a renamed export fails the typecheck.
const AUTH_API = {
  refreshSession: api.auth.refreshSession,
  signOut: api.auth.signOut,
  isAuthenticated: api.auth.isAuthenticated,
};

export function SessionProvider({ children }: { children: ReactNode }) {
  // Created once per mount: one per tab in the browser, a throwaway one per server render.
  const [client] = useState(getConvexClient);
  return (
    <ConvexAuthProvider client={client} api={AUTH_API}>
      <ConvexSession>{children}</ConvexSession>
    </ConvexAuthProvider>
  );
}

// Fixed texts: never show the library's error or its cause.
const FLOW_ERRORS = {
  ACCESS_DENIED: "Google sign-in was cancelled.",
  EXPIRED: "Google sign-in took too long. Try again.",
  INVALID_FLOW: "Google sign-in could not be finished. Try again.",
  OTHER_ERROR: "Google sign-in could not be finished. Try again.",
} as const;

function ConvexSession({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn: startGoogle } = useSignInWithGoogle(api.auth);
  const { flowError } = useOauth();
  const { signOut } = useAuthActions();

  // A flow that came back from Google without a session, for example when the user cancelled.
  useEffect(() => {
    if (flowError) toast.error(FLOW_ERRORS[flowError.error], { id: "sign-in-error" });
  }, [flowError]);

  const session = useMemo<Session>(
    () => ({
      status: isLoading ? "loading" : isAuthenticated ? "signed-in" : "signed-out",
      async signInWithGoogle(returnTo) {
        const redirectTo = returnTo ? new URL(returnTo, window.location.origin).href : undefined;
        const result = await startGoogle(redirectTo ? { redirectTo } : undefined);
        // On success the page is already leaving for Google.
        if (result.status === "error") {
          toast.error("Google sign-in could not start. Try again.", { id: "sign-in-error" });
        }
      },
      async signOut() {
        try {
          await signOut();
        } catch {
          toast.error("You could not be signed out. Try again.", { id: "sign-out-error" });
        }
      },
    }),
    [isLoading, isAuthenticated, startGoogle, signOut],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
