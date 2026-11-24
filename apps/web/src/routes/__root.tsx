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
      // One icon per colour scheme: a teal tile with a white spiral, and a black tile with a
      // teal spiral. The browser picks by the `media` query.
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/logo-light.svg",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/logo-dark.svg",
        media: "(prefers-color-scheme: dark)",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
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
