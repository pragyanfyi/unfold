import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";

// A failed turn (ADR 0012 and 0013). Error text comes from the server already scrubbed of keys
// (chat-handler.ts), or from the browser for a network failure.
export function TurnError({
  title = "The reply failed",
  message,
  actionLabel = "Try again",
  onRetry,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{message || "Something went wrong."}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {actionLabel}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
