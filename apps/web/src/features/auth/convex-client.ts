import { ConvexReactClient } from "convex/react";

// One Convex client per tab, created on first use. During server rendering each call gets a
// throwaway client: it never connects (the client opens its WebSocket only when a query or
// mutation first needs it, and none runs on the server), and nothing is shared between
// requests in the server isolate.
let client: ConvexReactClient | undefined;

export function getConvexClient(): ConvexReactClient {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) {
    throw new Error(
      "VITE_CONVEX_URL is not set. See docs/operations/development.md (Convex) to point the app at a backend.",
    );
  }
  if (typeof window === "undefined") return new ConvexReactClient(url);
  client ??= new ConvexReactClient(url);
  return client;
}
