import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { components, internal } from "./_generated/api";

// Convex Auth v2 in browser (SPA) mode, Google only for people (ADR 0016).
const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

// Every origin the app is served from. Google sends the browser back to one of these, and a
// request naming any other origin is refused. Add an origin here when the app gets a new one.
export const ALLOWED_REDIRECT_ORIGINS = [
  "https://unfold.pragyan-fyi.workers.dev",
  "http://localhost:3000",
];

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: ALLOWED_REDIRECT_ORIGINS,
}).attachUserCallbacks({ createUser: internal.users.createUserFromGoogle });

// Test-only: how E2E signs in, because Google cannot run in CI (ADR 0016). The functions are
// deployed everywhere, but `createUserFromPassword` refuses unless the deployment sets
// E2E_PASSWORD_SIGN_UP=1, which only the local E2E backend does. No password account can
// exist on production, so password sign-in cannot succeed there either.
export const { signUpWithUsernamePassword, signInWithUsernamePassword } = setupUsernamePassword(
  auth,
  { component: components.authPassword, usernameComponent: components.authUsername },
).attachUserCallbacks({ createUser: internal.users.createUserFromPassword });
