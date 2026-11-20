import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { KeyForm } from "#/features/byok/key-form";
import type { getByok } from "#/features/byok/key-store";
import { cn } from "#/lib/utils";

/** 1 Sign in, 2 Add your key, 3 Start (ADR 0016). */
export type OnboardingStep = 1 | 2 | 3;

const STEPS = ["Sign in", "Add your key", "Start"] as const;

// What stands between a new user and their first interview, in one dialog with a visible
// stepper (ADR 0016). The step follows from the session and the key, so the parent passes it;
// the dialog only shows it. Closing it keeps the idea in the composer.
export function OnboardingDialog({
  open,
  onOpenChange,
  step,
  byok,
  onSignIn,
  onKeySaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: OnboardingStep;
  byok?: ReturnType<typeof getByok>;
  /** Starts Google sign-in. The page leaves for Google. */
  onSignIn: () => Promise<void>;
  /** The key is saved: the interview starts. */
  onKeySaved: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  // Not dismissed while the key is being saved: the save would otherwise start the interview
  // after the user had closed the dialog.
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !saving) && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Before your first interview</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Unfold needs you to sign in before your first interview. Google is the only way to sign in."
              : step === 2
                ? "Unfold uses your own API key, from Anthropic or Google Gemini. It stays in this browser and is never stored by Unfold."
                : "Starting your interview."}
          </DialogDescription>
        </DialogHeader>
        <Stepper step={step} />
        {step === 1 ? (
          <Button
            type="button"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              try {
                await onSignIn();
              } finally {
                // Still here: the flow could not start.
                setLeaving(false);
              }
            }}
          >
            Continue with Google
          </Button>
        ) : step === 2 ? (
          <KeyForm byok={byok} onSaved={onKeySaved} onBusyChange={setSaving} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: OnboardingStep }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < step;
        const current = number === step;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              current ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                current && "border-primary bg-primary text-primary-foreground",
                done && "border-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : number}
            </span>
            <span>
              {label}
              {/* State is not shown by colour alone (docs/internals/web-ui.md). */}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
