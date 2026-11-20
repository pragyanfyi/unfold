import { useByok } from "@tanstack/ai-react";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "@unfold/interview/providers";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { rescueFocus } from "#/lib/focus";
import { KeyForm } from "./key-form";
import { getByok } from "./key-store";
import { savedKey } from "./saved-key";

// `open` and `onOpenChange` are optional: the chat opens the dialog when a send is blocked for
// lack of a key. Without them the dialog manages itself. `trigger` replaces the default button
// (the header has its own, #47); it must be a single element that takes a ref, like `Button`.
export function KeyDialog({
  byok = getByok(),
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
  trigger,
}: {
  byok?: ReturnType<typeof getByok>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  // The one stored key, of whichever provider (#48). A failed save leaves an "error" status,
  // but that key is NOT stored, so it does not count.
  const snapshot = useByok(byok);
  const saved = savedKey(snapshot);
  const status = saved?.status;
  // Normally one. Two only when removing the old key failed after a new one was saved: then each
  // gets its own Remove button, so the user removes the one they mean, not just the one in use.
  const stored = PROVIDER_IDS.filter((provider) => {
    const state = snapshot.status[provider]?.state;
    return state === "set" || state === "locked";
  });
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onControlledOpenChange ?? setOwnOpen;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A save in the form. The key library does not order a save against a removal, so the
  // footer's actions wait for it: a removed key must not come back when the save finishes.
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // When the key is removed, the Remove (and Unlock) buttons go away, and the one the user
  // pressed had focus: it goes to the key field. Only when focus is lost (lib/focus.ts).
  const hasStatus = status !== undefined;
  useEffect(() => {
    if (!hasStatus) rescueFocus(input.current);
  }, [hasStatus]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    // The form, and the key typed into it, unmounts with the dialog.
    if (!next) setError(null);
  }

  // Escape, the close button or a click outside. Not while a save runs: the form that started it
  // must stay to see it finish, or a reopened dialog could start a second save that the first
  // one's completion would then close.
  function dismiss(next: boolean) {
    if (!next && saving) return;
    onOpenChange(next);
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

  async function remove(provider: ProviderId) {
    // With two keys, a key stays after this removal, so the effect above does not run; the
    // pressed button still goes away, so focus moves to the key field here.
    const othersRemain = stored.length > 1;
    setBusy(true);
    setError(null);
    try {
      await byok.clear(provider);
      if (othersRemain) input.current?.focus();
    } catch {
      setError("Your key could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={dismiss}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            {saved
              ? `${PROVIDERS[saved.provider].label} key: ${saved.status.masked}`
              : "Add your API key"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your API key</DialogTitle>
          <DialogDescription>
            Your key is saved only in this browser. Unfold's server sees it with each request
            because it forwards the request to the provider, but never stores or logs it.{" "}
            {byok.storage.persistent
              ? "It is saved encrypted with a passkey."
              : "It is kept in memory for this tab only and is gone when you close it."}{" "}
            {saved
              ? `You have a ${PROVIDERS[saved.provider].label} key. Saving a new key replaces it.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <KeyForm
          byok={byok}
          onSaved={() => onOpenChange(false)}
          message={error}
          disabled={busy}
          onBusyChange={setSaving}
          inputRef={input}
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
              {stored.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  disabled={busy || saving}
                  onClick={() => void remove(provider)}
                >
                  {stored.length > 1 ? `Remove ${PROVIDERS[provider].label} key` : "Remove key"}
                </Button>
              ))}
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
