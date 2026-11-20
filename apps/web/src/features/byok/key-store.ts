import { anthropicByok } from "@tanstack/ai-anthropic/byok";
import { geminiByok } from "@tanstack/ai-gemini/byok";
import { type ByokClient, defaultByokStorage, defineByok } from "@tanstack/ai-react/byok";

// One keyring per tab. It is created on first use in the browser, never during SSR, so
// nothing touches WebAuthn or IndexedDB on the server. Keys are handled only through the
// library's `ByokClient` (ADR 0003, rule 9): no custom storage, no localStorage.
let client: ByokClient | undefined;

// One descriptor per provider in `@unfold/interview/providers`. They are used for labels and
// slugs only: the browser never reads an environment key.
const PROVIDERS = [anthropicByok, geminiByok];

export function getByok(): ByokClient {
  // During SSR, return a throwaway in-memory client: nothing is cached in the server
  // isolate, which is shared between requests, and no key can ever be put in it.
  if (typeof window === "undefined") return defineByok({ providers: PROVIDERS });
  client ??= defineByok({
    // Passkey-encrypted when WebAuthn is available in a secure context, tab memory
    // otherwise. If WebAuthn exists but the authenticator lacks PRF, the first save
    // throws; it does NOT fall back to memory (see describeSaveError).
    storage: defaultByokStorage({ rpName: "Unfold", userName: "Unfold API keys" }),
    providers: PROVIDERS,
  });
  return client;
}
