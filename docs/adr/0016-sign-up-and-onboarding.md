# 16. Sign-up with Convex Auth v2, and onboarding on the web

- Status: Proposed
- Date: 2026-11-17
- Supersedes: ADR 0008 (Better Auth with Google)

## Context

ADR 0008 made accounts optional: signed out, the app was fully usable and conversations stayed in the browser (ADR 0013). ADR 0015 moves all data to Convex and drops browser storage, so every idea now belongs to a user on the server.

We considered letting visitors start as guests and sign up later. What we checked on 2026-11-17:

- **Convex Auth v2** (`@convex-dev/auth` 2.0.0, npm `latest`, published 2026-11-12) is "the current stable release" ([Convex Auth](https://docs.convex.dev/auth/convex-auth)). It supports password, passkey, Google, Apple and GitHub sign-in, and "React SPAs and SSR apps built with Next.js"; the [announcement](https://stack.convex.dev/convex-auth-v2) says "it works with React and Next.js only".
- Its source has an anonymous method, `setupAnonymous`, marked `@internal Not public until the anonymous sign-in method is ready` and not exported. Its comment says "There is no support for allowing a user to return with a previously issued anonymous account."
- **Convex Auth v1** (`@convex-dev/auth` 0.0.98) has a public anonymous provider, but neither version links an anonymous user to a Google account, so moving a guest's idea on sign-up would be our own code. v2's [migration guide](https://docs.convex.dev/auth/convex-auth/migrating/from-convex-auth-v1) says migration tooling from v1 "will be available soon".

The maintainer decided on 2026-11-17 to use v2, the current standard, and to require sign-up before the first chat. Guests can come later, when v2 makes anonymous sign-in public.

## Decision

### Auth

- **Convex Auth v2, Google only.** Other methods are configuration and can be added later. The Google client ID and secret are Convex environment variables, set by the maintainer, never in chat.
- **Sign-in is required to use the app.** Every Convex function that reads or writes an idea, and the HTTP action that runs the interview (ADR 0015), checks that the caller is signed in and owns the idea. A signed-out caller gets a typed error, never data.
- **React client only.** v2 does not support TanStack Start on the server, so pages render signed out on the server and the signed-in state appears once the page loads in the browser. Unfold's chat already runs in the browser, so nothing user-visible depends on server-side auth.
- **Keys are not part of the account.** Provider keys stay in the browser, never sync and are never stored by the server (ADR 0003). A signed-in user on a new device adds their key again.

### The web onboarding flow

The first screen is the product, not a sign-up wall. Onboarding happens inside the composer.

1. **Signed-out home (`/`).** The usual composer, with a heading, a few example ideas to click, and a short "how it works" (describe your idea, answer questions, watch the tree grow). Under the composer, one line says what comes next: free, sign in with Google, use your own Anthropic key. A "Sign in" button is always visible for returning users.
2. **The user types an idea and presses Enter.** The idea is kept in `sessionStorage` (this tab only, cleared once sent), so it survives the Google redirect. It is never sent anywhere before sign-in. A dialog opens with a visible stepper: **1 Sign in, 2 Add your key, 3 Start**. Step 1 is "Continue with Google" and one line on why: ideas are saved to your account.
3. **Back from Google**, the idea is restored and the dialog reopens at **2 Add your key**: the existing key dialog (ADR 0003), with a link to where Anthropic keys are created and a line saying the key stays in this browser and is never stored by Unfold.
4. **Once the key is saved, the interview starts on its own** with the restored idea. The user already pressed Enter; the chat shows the idea as sent.

Other cases use the same dialog:

- Signed in with a key on this device: Enter starts the interview, no dialog.
- Signed in without a key on this device: Enter opens the dialog at step 2.
- Signed out on `/c/$id`: redirect to `/` with the dialog at step 1. After sign-in, the user lands on that idea if it is theirs.
- Cancelling the dialog keeps the idea in the composer.

A mobile app, if built, gets its own onboarding; this ADR covers the web only.

### Later: guests

When v2 publishes anonymous sign-in, a new ADR may let visitors start without signing up. It must say how a guest's idea moves to their account, how a guest is limited, and how inactive guests are deleted.

## Open (settled by the auth spike, #33)

- That v2's Google sign-in and React client work in a TanStack Start app on Workers, with our CSP (`connect-src`, the redirect).
- Whether v2's Google flow is a full-page redirect (assumed above) or can use a popup.
- How E2E tests sign in without Google (ADR 0011, item 10). Recorded here when decided.

## Consequences

- Nobody can try Unfold without a Google account. We accept this until guests are possible.
- No guest limit, claim step or guest cleanup to build or test.
- Every first visit needs two steps before the first answer: Google, then a key. The line under the composer says so up front, so neither comes as a surprise.
- The idea typed before sign-in lives briefly in `sessionStorage`. It is the user's own text, not a credential, and it is cleared once sent.
- Account deletion and export (#37) cover Convex Auth's own records as well as ideas.
- Moving from v2 to a later version, or adding guests, changes this ADR's auth section, not the data model: ideas reference a user id and nothing else about auth.
