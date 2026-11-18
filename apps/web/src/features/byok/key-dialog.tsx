import { useByok } from "@tanstack/ai-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { DEFAULT_PROVIDER, PROVIDERS } from "#/features/chat/providers";
import { ANTHROPIC_KEYS_URL, KeyForm } from "./key-form";
import { getByok } from "./key-store";

// `open` and `onOpenChange` are optional: the chat opens the dialog when a send is blocked for
// lack of a key. Without them the dialog manages itself.
export function KeyDialog({
  byok = getByok(),
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: {
  byok?: ReturnType<typeof getByok>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const provider = DEFAULT_PROVIDER;
  const label = PROVIDERS[provider].label;
  const snapshot = useByok(byok);
  const current = snapshot.status[provider];
  // A failed save also leaves a status ("error"); that key is NOT stored, so it does not count.
  const status = current?.state === "set" || current?.state === "locked" ? current : undefined;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onControlledOpenChange ?? setOwnOpen;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A save in the form. The key library does not order a save against a removal, so the
  // footer's actions wait for it: a removed key must not come back when the save finishes.
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    // The form, and the key typed into it, unmounts with the dialog.
    if (!next) setError(null);
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      await byok.unlock();
    } catch {
      // Fixed text: the saved key is still stored, just locked. Never show the raw error.
      setError("Your saved key could not be unlocked. Check the passkey prompt and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await byok.clear(provider);
    } catch {
      setError("Your key could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {status ? `${label} key: ${status.masked}` : `Add ${label} API key`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} API key</DialogTitle>
          <DialogDescription>
            Your key stays in this browser. Unfold's server sees it with each request because it
            forwards the request to {label}, but never stores or logs it.{" "}
            {byok.storage.persistent
              ? "It is saved encrypted with a passkey."
              : "It is kept in memory for this tab only and is gone when you close it."}{" "}
            <KeysLink />
          </DialogDescription>
        </DialogHeader>

        <KeyForm
          byok={byok}
          onSaved={() => onOpenChange(false)}
          message={error}
          disabled={busy}
          onBusyChange={setSaving}
          footer={
            <>
              {status?.state === "locked" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || saving}
                  onClick={() => void unlock()}
                >
                  Unlock saved key
                </Button>
              ) : null}
              {status ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || saving}
                  onClick={() => void remove()}
                >
                  Remove key
                </Button>
              ) : null}
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

/** Where to get a key. Opens Anthropic's console in a new tab. */
export function KeysLink() {
  return (
    <a
      href={ANTHROPIC_KEYS_URL}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground underline underline-offset-4"
    >
      Create a key at Anthropic (opens in a new tab)
    </a>
  );
}
