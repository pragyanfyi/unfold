// What went wrong when saving a key, in words a user can act on. The library has no error
// class and no capability check for the no-PRF case (ADR 0003), so this reads the
// DOMException name and the message strings of @tanstack/ai-client 1.1.0
// (`src/byok/passkey.ts`). If a library upgrade rewords them, the result is "unknown",
// which still shows an error and still stores nothing.
export type SaveErrorKind = "cancelled" | "no-prf" | "needs-gesture" | "unknown";

export type SaveErrorInfo = { kind: SaveErrorKind; message: string };

const MESSAGES: Record<SaveErrorKind, string> = {
  cancelled: "The passkey prompt was cancelled, so your key was not saved. Try again.",
  "no-prf":
    "This device or browser can't protect your key with a passkey (it doesn't support the WebAuthn PRF extension), so your key was not saved. Try another browser or device. Unfold does not keep the key any other way.",
  "needs-gesture":
    "The browser needs a fresh click to show the passkey prompt. Press Save key again.",
  unknown:
    "Your key could not be saved, and it was not stored anywhere else. Check your browser's passkey settings and try again.",
};

export function describeSaveError(error: unknown): SaveErrorInfo {
  const name = error instanceof Error ? error.name : "";
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  let kind: SaveErrorKind = "unknown";
  if (text.includes("prf")) kind = "no-prf";
  else if (text.includes("fresh user action")) kind = "needs-gesture";
  else if (name === "NotAllowedError" || text.includes("cancelled")) kind = "cancelled";
  // Fixed strings only: the raw error text is never shown, so nothing key-like can leak.
  return { kind, message: MESSAGES[kind] };
}
