import { useHotkey } from "@tanstack/react-hotkeys";
import { KeyboardIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { SidebarTrigger, useSidebar } from "#/components/ui/sidebar";
import { AccountButton } from "#/features/auth/account-button";
import { appHotkeys } from "#/features/hotkeys/registry";
import { ShortcutsDialog } from "#/features/hotkeys/shortcuts-dialog";

// The bar above the panes. It owns the app-wide shortcuts, and each one has a button here too
// (docs/internals/hotkeys.md): the sidebar trigger and the shortcuts list. Sign in and out is
// here too (ADR 0016).
export function AppHeader() {
  const { toggleSidebar } = useSidebar();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useHotkey(appHotkeys["sidebar.toggle"], toggleSidebar);
  useHotkey(appHotkeys["shortcuts.open"], () => setShortcutsOpen((open) => !open));

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <h1 className="text-sm font-medium">Unfold</h1>
      <div className="ml-auto" />
      <AccountButton />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Keyboard shortcuts"
        onClick={() => setShortcutsOpen(true)}
      >
        <KeyboardIcon />
      </Button>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </header>
  );
}
