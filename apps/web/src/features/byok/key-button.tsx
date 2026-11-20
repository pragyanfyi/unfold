import { useByok } from "@tanstack/ai-react";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { useSession } from "#/features/auth/session";
import { KeyDialog } from "./key-dialog";
import { getByok } from "./key-store";
import { savedKey } from "./saved-key";

// The API key, always in the header for a signed-in user (#47): it shows whether a key is set,
// never the key (only the library's mask), and opens the dialog to replace or remove it. Before
// sign-in the key is asked for by onboarding, which comes after sign-in (ADR 0016).
export function KeyButton({ byok = getByok() }: { byok?: ReturnType<typeof getByok> }) {
  const session = useSession();
  const saved = savedKey(useByok(byok));
  if (session.status !== "signed-in") return null;

  const text =
    saved?.status.state === "set"
      ? `API key ${saved.status.masked}`
      : saved?.status.state === "locked"
        ? "API key locked"
        : "Add API key";

  return (
    <KeyDialog
      byok={byok}
      trigger={
        <Button type="button" variant="ghost" size="sm">
          <KeyRoundIcon />
          {/* Hidden at phone width, but still the button's name. */}
          <span className="sr-only sm:not-sr-only">{text}</span>
        </Button>
      }
    />
  );
}
