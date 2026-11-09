import { createMiddleware, createStart } from "@tanstack/react-start";
import { buildCsp, makeNonce } from "#/features/security/csp";
import { runWithNonce } from "#/features/security/nonce.server";

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const nonce = makeNonce();
  const result = await runWithNonce(nonce, () => next());
  const headers = new Headers(result.response.headers);
  headers.set("Content-Security-Policy", buildCsp(nonce, { dev: import.meta.env.DEV }));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
});

export const startInstance = createStart(() => ({ requestMiddleware: [securityHeaders] }));
