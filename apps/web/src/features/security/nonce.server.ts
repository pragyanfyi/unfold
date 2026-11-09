import { AsyncLocalStorage } from "node:async_hooks";

// Carries the per-response CSP nonce from the request middleware (src/start.ts) to the
// router factory (src/router.tsx), which hands it to the router so its inline scripts
// carry the nonce. Server only.
const storage = new AsyncLocalStorage<string>();

export function runWithNonce<T>(nonce: string, fn: () => T): T {
  return storage.run(nonce, fn);
}

export function currentNonce(): string | undefined {
  return storage.getStore();
}
