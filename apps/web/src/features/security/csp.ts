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
// `<name>.convex.cloud` deployment, whose HTTP actions live on `<name>.convex.site`.
// Throws on anything else, so a bad value fails the build instead of shipping a loose policy.
export function convexOrigins(env: { url?: string; siteUrl?: string }): string[] {
  if (!env.url) {
    if (env.siteUrl) throw new Error("VITE_CONVEX_SITE_URL is set without VITE_CONVEX_URL");
    return [];
  }
  const client = parseOrigin(env.url, "VITE_CONVEX_URL");
  // Each URL has its own role: the client URL is never a .convex.site host and the reverse.
  if (deploymentName(client, SITE) !== undefined) {
    throw new Error("VITE_CONVEX_URL is the HTTP actions URL; use the .convex.cloud one");
  }
  const name = deploymentName(client, CLOUD);
  if (name !== undefined && client.port) {
    throw new Error("VITE_CONVEX_URL on convex.cloud must use the default port");
  }
  let site: URL;
  if (env.siteUrl) {
    site = parseOrigin(env.siteUrl, "VITE_CONVEX_SITE_URL");
    if (deploymentName(site, CLOUD) !== undefined) {
      throw new Error("VITE_CONVEX_SITE_URL is the client URL; use the .convex.site one");
    }
    // Both on Convex's own domains: they must name the same deployment.
    const siteName = deploymentName(site, SITE);
    if (name !== undefined && siteName !== undefined && name !== siteName) {
      throw new Error("VITE_CONVEX_URL and VITE_CONVEX_SITE_URL name different deployments");
    }
  } else if (name !== undefined && !name.includes(".")) {
    site = new URL(`https://${name}${SITE}`);
  } else {
    throw new Error(
      "VITE_CONVEX_SITE_URL is required unless VITE_CONVEX_URL is <name>.convex.cloud",
    );
  }
  const socket = `${client.protocol === "https:" ? "wss:" : "ws:"}//${client.host}`;
  return [...new Set([client.origin, socket, site.origin])];
}

/**
 * The deployment's HTTP actions origin, where the interview's action runs: `VITE_CONVEX_SITE_URL`
 * when set, otherwise the one inferred from a `<name>.convex.cloud` client URL. The same origin
 * the CSP allows, so the app never calls a host the policy would block. Undefined without a
 * deployment.
 */
export function convexSiteUrl(env: { url?: string; siteUrl?: string }): string | undefined {
  if (!env.url) return undefined;
  // Validates both URLs the same way the CSP does, and throws on a bad one.
  const origins = convexOrigins(env);
  // An explicit site URL is the answer as given. Read it here, not from the CSP list, whose
  // de-duplication drops it when it shares the client URL's origin.
  if (env.siteUrl) return new URL(env.siteUrl).origin;
  // Otherwise it was inferred from a `<name>.convex.cloud` URL: a `.convex.site` origin, which
  // never equals the client's, so it is the list's last entry.
  return origins.at(-1);
}

const CLOUD = ".convex.cloud";
const SITE = ".convex.site";

// The deployment part of a URL on one of Convex's own domains (everything before the domain), or
// undefined for any other host. It may hold a region label (`name.region`); the site URL is
// only inferred for the documented `name.convex.cloud` form, so a regional one must be explicit.
function deploymentName(url: URL, domain: string): string | undefined {
  if (!url.hostname.endsWith(domain)) return undefined;
  const name = url.hostname.slice(0, -domain.length);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)?$/.test(name)) {
    throw new Error(`${url.hostname} is not a Convex deployment`);
  }
  return name;
}

// Plain http only for a local backend (development and E2E). IPv6 literals such as [::1] are
// left out because Chromium does not accept them as CSP sources; use localhost instead.
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

// A host the CSP grammar accepts: letters, digits, dots and hyphens (the URL parser lowercases).
const CSP_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

function parseOrigin(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a URL`);
  }
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (!secure && !local) throw new Error(`${name} must be https (or http on localhost)`);
  if (url.username || url.password) throw new Error(`${name} must be a plain origin`);
  if (!CSP_HOST.test(url.hostname)) {
    throw new Error(`${name} has a host the CSP cannot name (use a DNS name or 127.0.0.1)`);
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
