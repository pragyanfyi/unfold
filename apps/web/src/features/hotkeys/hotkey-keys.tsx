import { type Hotkey, useFormatForDisplay } from "@tanstack/react-hotkeys";
import { Kbd, KbdGroup } from "#/components/ui/kbd";

// One shortcut as keycaps, with the platform's symbols (⌘ on macOS, Ctrl elsewhere). Screen
// readers get the spelled-out form ("Cmd+/") instead of the symbols.
export function HotkeyKeys({ hotkey }: { hotkey: Hotkey }) {
  const format = useFormatForDisplay();
  const keys = format(hotkey, { parts: true }) as Array<string>;
  return (
    <span>
      <KbdGroup aria-hidden="true">
        {keys.map((key) => (
          // The default muted text on the muted keycap is just under AA contrast.
          <Kbd key={key} className="text-foreground">
            {key}
          </Kbd>
        ))}
      </KbdGroup>
      <span className="sr-only">{format(hotkey, { useSymbols: false })}</span>
    </span>
  );
}
