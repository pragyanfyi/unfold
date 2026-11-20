import { useByok } from "@tanstack/ai-react";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "@unfold/interview/providers";
import { type ReactNode, type Ref, useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { getByok } from "./key-store";
import { describeSaveError } from "./save-error";
import { savedKey } from "./saved-key";

// Choosing a provider, then entering and saving its key, used by the key dialog and the
// onboarding dialog. The key lives in this component's state only until it is saved, and is
// never put anywhere else (ADR 0003). A failed save keeps the key in the field and explains why
// (rule 10).
//
// One key at a time (#48): once the new key is saved, the other provider's key is removed. The
// new key is saved first, so a failed save never loses the key the user already had.
export function KeyForm({
  byok = getByok(),
  onSaved,
  footer,
  message,
  disabled = false,
  onBusyChange,
  inputRef,
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
  /** The key field, so a parent can return focus to it. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const saved = savedKey(useByok(byok));
  // Starts on the saved key's provider, so replacing a key keeps its provider unless changed.
  const [provider, setProvider] = useState<ProviderId>(saved?.provider ?? PROVIDER_IDS[0]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = error ?? message ?? null;
  const label = PROVIDERS[provider].label;

  // The passkey prompt needs a direct user gesture on some browsers (ADR 0003), so the handler
  // calls the library before awaiting anything else.
  async function save() {
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      try {
        await byok.update(provider, draft);
      } catch (caught) {
        // Nothing was stored. The key stays in the field so the user can retry.
        setError(describeSaveError(caught).message);
        return;
      }
      setDraft("");
      const status = byok.getSnapshot().status;
      const others = PROVIDER_IDS.filter((other) => {
        const state = status[other]?.state;
        return other !== provider && (state === "set" || state === "locked");
      });
      try {
        for (const other of others) await byok.clear(other);
      } catch {
        // Two keys are stored. Fixed text: never the raw error.
        setError(
          `Your ${label} key was saved, but your other key could not be removed. Remove it, then try again.`,
        );
        return;
      }
      onSaved?.();
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
      <RadioGroup
        aria-label="Provider"
        value={provider}
        onValueChange={(value) => setProvider(value as ProviderId)}
        disabled={busy || disabled}
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {PROVIDER_IDS.map((option) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${option}`} value={option} />
            <Label htmlFor={`${id}-${option}`}>{PROVIDERS[option].label}</Label>
          </div>
        ))}
      </RadioGroup>
      <p className="text-sm text-muted-foreground">
        <KeysLink provider={provider} />
      </p>
      <Label htmlFor={`${id}-key`}>API key</Label>
      <Input
        ref={inputRef}
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

/** Where to get a key for `provider`. Opens the provider's console in a new tab. */
export function KeysLink({ provider }: { provider: ProviderId }) {
  const { label, keysUrl } = PROVIDERS[provider];
  return (
    <a
      href={keysUrl}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground underline underline-offset-4"
    >
      Create a key at {label} (opens in a new tab)
    </a>
  );
}
