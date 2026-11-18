// The idea a user typed before signing in, kept in `sessionStorage` so it survives the Google
// redirect (ADR 0016). This tab only, cleared once the idea is sent, never sent anywhere before
// sign-in. Storage can be unavailable (private modes, blocked storage): then the idea simply
// does not survive the redirect.
const KEY = "unfold.pendingIdea";

export function savePendingIdea(idea: string): void {
  try {
    sessionStorage.setItem(KEY, idea);
  } catch {
    // Not kept; the user types it again after signing in.
  }
}

export function readPendingIdea(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingIdea(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
