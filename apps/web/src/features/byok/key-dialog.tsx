import { useByok } from "@tanstack/ai-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { DEFAULT_PROVIDER, PROVIDERS } from "#/features/chat/providers";
import { getByok } from "./key-store";
import { describeSaveError } from "./save-error";

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
  // The key lives in this state only while the dialog is open, and is cleared afterwards.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setDraft("");
      setError(null);
    }
  }

  // The passkey prompt needs a direct user gesture on some browsers (ADR 0003), so each
  // handler calls the library before awaiting anything else.
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await byok.update(provider, draft);
      onOpenChange(false);
    } catch (caught) {
      // Nothing was stored. The key stays in the field so the user can retry.
      setError(describeSaveError(caught).message);
    } finally {
      setBusy(false);
    }
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
              : "It is kept in memory for this tab only and is gone when you close it."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Label htmlFor="byok-key">API key</Label>
          <Input
            id="byok-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby={error ? "byok-error" : undefined}
          />
          {error ? (
            <p id="byok-error" role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            {status?.state === "locked" ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void unlock()}>
                Unlock saved key
              </Button>
            ) : null}
            {status ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
                Remove key
              </Button>
            ) : null}
            <Button type="submit" disabled={busy || draft.trim().length === 0}>
              Save key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
