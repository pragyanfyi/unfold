import { type Hotkey, useAppHotkeyList } from "@tanstack/react-hotkeys";
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { HotkeyKeys } from "./hotkey-keys";

type Row = { id: string; name: string; description?: string; hotkey: Hotkey };

// The list of every shortcut, generated from the registry (registry.ts), so it cannot drift
// from what is bound. It lists declared shortcuts whether or not their component is mounted.
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // It opens from a shortcut or a button outside it, so Radix has no trigger to give focus back
  // to on close and would leave it on <body>. Remember what had focus (Radix has not moved it
  // yet when it asks for the open focus) and return there.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
          opener.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Cmd on macOS, Ctrl on other systems.</DialogDescription>
        </DialogHeader>
        <ShortcutList />
      </DialogContent>
    </Dialog>
  );
}

function ShortcutList() {
  const items = useAppHotkeyList();
  const groups = new Map<string, Array<Row>>();
  for (const { appHotkey } of items) {
    if (appHotkey.hotkey === null) continue;
    const group = appHotkey.meta?.group ?? "General";
    const rows = groups.get(group) ?? [];
    rows.push({
      id: appHotkey.id,
      name: appHotkey.meta?.name ?? appHotkey.id,
      description: appHotkey.meta?.description,
      hotkey: appHotkey.hotkey,
    });
    groups.set(group, rows);
  }
  return (
    <div className="flex flex-col gap-4">
      {[...groups].map(([group, rows]) => (
        <section key={group} aria-labelledby={`shortcuts-${group}`}>
          <h3 id={`shortcuts-${group}`} className="mb-2 text-xs font-medium text-muted-foreground">
            {group}
          </h3>
          <dl className="flex flex-col gap-2">
            {rows.map((row) => (
              <div
                key={row.id}
                data-testid={`shortcut-${row.id}`}
                className="flex items-start justify-between gap-4"
              >
                <dt className="text-sm">
                  {row.name}
                  {row.description ? (
                    <span className="block text-xs text-muted-foreground">{row.description}</span>
                  ) : null}
                </dt>
                <dd className="shrink-0">
                  <HotkeyKeys hotkey={row.hotkey} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
