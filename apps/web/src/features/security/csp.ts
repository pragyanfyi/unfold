// Content-Security-Policy for the app (ADR 0003, item 5). Keys live in script-accessible
// browser state, so the policy's job is to stop injected script from running or sending
// data anywhere but our own origin.
//
// - script-src uses a per-response nonce, so inline script injected by an attacker has no
//   nonce and does not run. No 'unsafe-inline' and no 'unsafe-eval' for scripts.
// - connect-src is 'self': the browser may talk only to Unfold's own origin. Provider calls
//   go through our route (the documented hop), so no provider host is allowed here.
// - style-src allows 'unsafe-inline' because React Flow and Radix set inline style
//   attributes. This weakens style injection only, not script execution.

export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": dev ? ["'self'", "ws:", "http:"] : ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
