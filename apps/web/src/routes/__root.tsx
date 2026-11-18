import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "#/components/ui/sonner";
import { UpdateNotifier } from "#/features/app-update/update-notifier";
import { SessionProvider } from "#/features/auth/session";
import { appHotkeys } from "#/features/hotkeys/registry";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Unfold",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <SessionProvider>
          <HotkeysProvider appHotkeys={appHotkeys}>{children}</HotkeysProvider>
        </SessionProvider>
        <Toaster />
        <UpdateNotifier />
        <Scripts />
      </body>
    </html>
  );
}
