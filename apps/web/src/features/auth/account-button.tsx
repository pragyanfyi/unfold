import { LogInIcon, LogOutIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { useSession } from "./session";

// Sign in or out, always in the header (ADR 0016: a returning user can always find Sign in).
// Nothing is shown until the browser knows the session, so the button never flips on load.
export function AccountButton() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  if (session.status === "loading") return null;

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return session.status === "signed-in" ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() => void act(session.signOut)}
    >
      <LogOutIcon />
      Sign out
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void act(() => session.signInWithGoogle())}
    >
      <LogInIcon />
      Sign in
    </Button>
  );
}
