import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { currentNonce } from "./features/security/nonce.server";
import { routeTree } from "./routeTree.gen";

// The CSP nonce exists only on the server, per response (see src/start.ts).
const getNonce = createIsomorphicFn()
  .server(() => currentNonce())
  .client(() => undefined);

export function getRouter() {
  // One client per router, so server requests never share cached data.
  const queryClient = new QueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    ssr: { nonce: getNonce() },
  });

  // Provides the QueryClient to the app and carries the query cache from server to browser.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
