// The providers a user can bring a key for. One entry for now (issue #26).
// `id` is the BYOK slug: the key travels in the `x-byok-<id>` request header.
export const PROVIDERS = {
  anthropic: { label: "Anthropic", model: "claude-sonnet-5-5" },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export const DEFAULT_PROVIDER: ProviderId = "anthropic";

export function isSupportedProvider(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}
