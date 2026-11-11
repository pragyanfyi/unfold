import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import type { SaveStatus } from "#/features/storage/saver";

// Saving failed or lost a race (ADR 0013). Stays until the cause is gone. The conversation
// keeps working in memory, and the text says what a reload would lose.
export function SaveNotice({
  status,
  onRetry,
  onNew,
}: {
  status: SaveStatus;
  onRetry: () => void;
  onNew: () => void;
}) {
  if (status.kind === "unsaved") {
    const why =
      status.reason === "quota"
        ? "Your browser has no space left for it."
        : status.reason === "too-new"
          ? "It was saved by a newer version of Unfold, so this one will not change it."
          : "Your browser would not let Unfold store it.";
    return (
      <Alert variant="destructive" className="mx-auto max-w-2xl">
        <AlertTitle>This conversation is not saved</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            {why} It keeps working here, but reloading the page will lose what is unsaved.
          </span>
          {status.reason === "too-new" ? null : (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try saving again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (status.kind === "conflict") {
    return (
      <Alert variant="destructive" className="mx-auto max-w-2xl">
        <AlertTitle>
          {status.reason === "deleted"
            ? "This conversation was deleted in another tab"
            : "This conversation changed in another tab"}
        </AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            Nothing more is saved from this tab, so nothing is overwritten.
            {status.reason === "deleted"
              ? " Starting a new idea leaves this conversation, and anything not saved from this tab is lost."
              : " Reloading shows the saved version, and anything not saved from this tab is lost."}
          </span>
          {status.reason === "deleted" ? (
            <Button type="button" variant="outline" size="sm" onClick={onNew}>
              New idea
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => location.reload()}>
              Reload
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
