// Content-Security-Policy for the app (ADR 0003, item 5). Keys live in script-accessible
// browser state, so the policy's job is to stop injected script from running or sending
// data anywhere but our own origin.
//
// - script-src uses a per-response nonce, so inline script injected by an attacker has no
//   nonce and does not run. No 'unsafe-inline' and no 'unsafe-eval' for scripts.
// - connect-src is 'self' plus exactly our own Convex deployment's origins (ADR 0015): its
//   client URL over https and wss, and its HTTP actions URL. They come from build
//   configuration (`convexOrigins`), never a wildcard, so a script cannot send a key to
//   someone else's Convex deployment. Provider calls go through our backend (the documented
//   hop), so no provider host is allowed here.
// - style-src allows 'unsafe-inline' because React Flow and Radix set inline style
//   attributes. This weakens style injection only, not script execution.

export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// The exact origins of our Convex deployment, from the build's `VITE_CONVEX_URL` (the client URL)
// and `VITE_CONVEX_SITE_URL` (the HTTP actions URL). The site URL may be left out for a
// `*.convex.cloud` deployment, whose HTTP actions live on the matching `*.convex.site`.
// Throws on anything else, so a bad value fails the build instead of shipping a loose policy.
export function convexOrigins(env: { url?: string; siteUrl?: string }): string[] {
  if (!env.url) {
    if (env.siteUrl) throw new Error("VITE_CONVEX_SITE_URL is set without VITE_CONVEX_URL");
    return [];
  }
  const client = parseOrigin(env.url, "VITE_CONVEX_URL");
  let site: URL;
  if (env.siteUrl) {
    site = parseOrigin(env.siteUrl, "VITE_CONVEX_SITE_URL");
  } else if (client.hostname.endsWith(".convex.cloud")) {
    site = new URL(client.origin.replace(/\.convex\.cloud$/, ".convex.site"));
  } else {
    throw new Error("VITE_CONVEX_SITE_URL is required when VITE_CONVEX_URL is not *.convex.cloud");
  }
  const socket = `${client.protocol === "https:" ? "wss:" : "ws:"}//${client.host}`;
  return [...new Set([client.origin, socket, site.origin])];
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseOrigin(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a URL`);
  }
  // Plain http only for a local backend (development and E2E); anything remote must be https.
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (!secure && !local) throw new Error(`${name} must be https (or http on localhost)`);
  if (url.username || url.password || url.hostname.includes("*")) {
    throw new Error(`${name} must be a plain origin`);
  }
  return url;
}

export function buildCsp(
  nonce: string,
  { dev = false, connect = [] }: { dev?: boolean; connect?: ReadonlyArray<string> } = {},
): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": dev ? ["'self'", "ws:", "http:", ...connect] : ["'self'", ...connect],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
