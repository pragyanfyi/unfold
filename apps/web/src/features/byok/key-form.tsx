import { type ReactNode, useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { DEFAULT_PROVIDER } from "#/features/chat/providers";
import { getByok } from "./key-store";
import { describeSaveError } from "./save-error";

/** Where Anthropic keys are created, linked from wherever a key is asked for (ADR 0016). */
export const ANTHROPIC_KEYS_URL = "https://console.anthropic.com/settings/keys";

// Entering and saving the provider key, used by the key dialog and the onboarding dialog. The
// key lives in this component's state only until it is saved, and is never put anywhere else
// (ADR 0003). A failed save keeps the key in the field and explains why (rule 10).
export function KeyForm({
  byok = getByok(),
  onSaved,
  footer,
  message,
  disabled = false,
  onBusyChange,
}: {
  byok?: ReturnType<typeof getByok>;
  onSaved?: () => void;
  /** More buttons beside Save, such as Remove key. */
  footer?: ReactNode;
  /** An error from one of those buttons, shown where a save error would be. */
  message?: string | null;
  disabled?: boolean;
  /** Told when a save starts and ends, so the footer's own actions can wait for it. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = error ?? message ?? null;

  // The passkey prompt needs a direct user gesture on some browsers (ADR 0003), so the handler
  // calls the library before awaiting anything else.
  async function save() {
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await byok.update(DEFAULT_PROVIDER, draft);
      setDraft("");
      onSaved?.();
    } catch (caught) {
      // Nothing was stored. The key stays in the field so the user can retry.
      setError(describeSaveError(caught).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Label htmlFor={`${id}-key`}>API key</Label>
      <Input
        id={`${id}-key`}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-describedby={shown ? `${id}-error` : undefined}
      />
      {shown ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {shown}
        </p>
      ) : null}
      <DialogFooter>
        {footer}
        <Button type="submit" disabled={busy || disabled || draft.trim().length === 0}>
          Save key
        </Button>
      </DialogFooter>
    </form>
  );
}
