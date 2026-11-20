// The providers a user can bring a key for (#26, #48). The order is the order the key dialog
// lists them in. `id` is the BYOK slug: the key travels in the `x-byok-<id>` request header.
// A user keeps one key at a time (#48): the provider of that key is the one the interview uses.
export const PROVIDERS = {
  anthropic: {
    label: "Anthropic",
    model: "claude-sonnet-5-5",
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
  gemini: {
    label: "Google Gemini",
    model: "gemini-3.8-flash",
    keysUrl: "https://aistudio.google.com/app/apikey",
  },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

/** Asked for when there is no key yet, and sent when no provider is chosen. */
export const DEFAULT_PROVIDER: ProviderId = "anthropic";

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ReadonlyArray<ProviderId>;

export function isSupportedProvider(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.keys(PROVIDERS).includes(value);
}
