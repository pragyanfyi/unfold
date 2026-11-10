import { ArrowUpIcon, SquareIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#/components/ui/input-group";

// The first message: the user's idea. Enter sends, Shift+Enter adds a line. While a reply is
// streaming the send button becomes Stop.
export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  onStop,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  busy: boolean;
  onStop: () => void;
}) {
  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          aria-label="Your idea"
          placeholder="Describe your idea…"
          className="p-3.5"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {busy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop"
              className="ml-auto"
              onClick={onStop}
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label="Send"
              className="ml-auto"
              disabled={!value.trim()}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
