import type { ByokSnapshot, KeyStatus } from "@tanstack/ai-react/byok";
import { DEFAULT_PROVIDER, PROVIDER_IDS, type ProviderId } from "@unfold/interview/providers";

/** A stored key: usable now ("set") or after the passkey prompt ("locked"). Never the key. */
export type SavedKey = {
  provider: ProviderId;
  status: Extract<KeyStatus, { state: "set" | "locked" }>;
};

// The user keeps one key at a time (#48), so its provider is the one the interview uses. A
// failed save leaves an "error" status, but that key was not stored, so it does not count. If
// two keys are ever stored (a removal failed after a save), the first in PROVIDERS order wins,
// and the client and the server both use that one. The key dialog then offers to remove each.
export function savedKey(snapshot: ByokSnapshot): SavedKey | undefined {
  for (const provider of PROVIDER_IDS) {
    const status = snapshot.status[provider];
    if (status?.state === "set" || status?.state === "locked") return { provider, status };
  }
  return undefined;
}

/** The provider a chat request goes to: the saved key's, or the default one to ask for a key. */
export function chatProvider(snapshot: ByokSnapshot): ProviderId {
  return savedKey(snapshot)?.provider ?? DEFAULT_PROVIDER;
}
