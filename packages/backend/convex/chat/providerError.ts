import { PROVIDERS, type ProviderId } from "@unfold/interview/providers";

// Provider errors arrive as the SDK's text: often JSON inside JSON (Gemini), or a status code
// followed by JSON (Anthropic). Shown as is, the user gets an unreadable blob. This turns the
// common cases into one plain sentence that names the model, and anything else into the
// provider's own innermost message, which still tells the user what went wrong.
//
// It runs on text the handler has already masked: it never sees a key.

type Kind = "overloaded" | "rate_limited" | "bad_key" | "forbidden";

const CODES: Record<number, Kind> = {
  401: "bad_key",
  403: "forbidden",
  429: "rate_limited",
  503: "overloaded",
  529: "overloaded",
};

// Status names and error types the providers use, matched case-insensitively.
const NAMES: Record<string, Kind> = {
  unavailable: "overloaded",
  overloaded_error: "overloaded",
  resource_exhausted: "rate_limited",
  rate_limit_error: "rate_limited",
  unauthenticated: "bad_key",
  authentication_error: "bad_key",
  api_key_invalid: "bad_key",
  permission_denied: "forbidden",
  permission_error: "forbidden",
};

// Gemini nests its reason seven levels deep (JSON in a string in JSON); this leaves room.
const MAX_DEPTH = 12;

type Found = { kinds: Kind[]; message: string | null };

function parseJson(text: string): unknown {
  const start = text.search(/[{[]/);
  if (start === -1) return undefined;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return undefined;
  }
}

// Walks the error, parsing JSON found in strings, and collects what it recognises. The
// innermost `message` that is not itself JSON wins.
function inspect(value: unknown, found: Found, depth: number): void {
  if (depth > MAX_DEPTH) return;
  if (typeof value === "string") {
    const kind = NAMES[value.trim().toLowerCase()];
    if (kind) found.kinds.push(kind);
    const parsed = parseJson(value);
    if (parsed !== undefined) inspect(parsed, found, depth + 1);
    return;
  }
  if (typeof value === "number") {
    const kind = CODES[value];
    if (kind) found.kinds.push(kind);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) inspect(item, found, depth + 1);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [name, item] of Object.entries(value)) {
    if (name === "message" && typeof item === "string" && parseJson(item) === undefined) {
      found.message = item.trim();
    }
    if (name === "code" || name === "status" || name === "type" || name === "reason") {
      if (typeof item === "string" && /^\d{3}$/.test(item)) inspect(Number(item), found, depth);
      else inspect(item, found, depth + 1);
    } else if (name === "message" || name === "error" || name === "details") {
      inspect(item, found, depth + 1);
    }
  }
}

function sentence(kind: Kind, name: string): string {
  switch (kind) {
    case "overloaded":
      return `${name} is busy right now. Try again in a moment.`;
    case "rate_limited":
      return `You have reached your ${name} rate limit or quota. Wait a little, or check your plan.`;
    case "bad_key":
      return `${name} did not accept your API key. Check it, or replace it under API key.`;
    case "forbidden":
      return `Your ${name} API key is not allowed to make this request. Check the key's permissions.`;
  }
}

/** What the user sees when the model sends nothing for too long (handler.ts). */
export function modelTimeoutMessage(provider: ProviderId): string {
  return `${PROVIDERS[provider].modelName} did not respond in time. Try again in a moment.`;
}

/** A plain sentence for a provider error message, naming the provider's model. */
export function plainProviderError(raw: string, provider: ProviderId): string {
  const found: Found = { kinds: [], message: null };
  // Anthropic's SDK leads with the HTTP status: "529 {...}".
  const leading = /^\s*(\d{3})\b/.exec(raw);
  if (leading) inspect(Number(leading[1]), found, 0);
  inspect(raw, found, 0);
  const kind = found.kinds[0];
  if (kind) return sentence(kind, PROVIDERS[provider].modelName);
  return found.message || raw;
}
