import { scrubSecrets } from "@tanstack/ai/byok";

// The only way server code on the chat path writes a log line (ADR 0003, items 1 and 3).
// - It accepts named primitive fields, never a Request, Headers or an arbitrary object, so
//   header values cannot reach a log by accident.
// - Every string is scrubbed against the secrets in play and against key-shaped tokens.
// A lint rule (biome-plugins/no-headers-in-logs.grit) forbids `console` and `.headers`
// in logging calls on this path; this module is the one allowed `console` user.

export type LogFields = Record<string, string | number | boolean | null>;

// Anything that looks like a provider key, even one we were not told about.
const KEY_SHAPED = /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g;

export function maskText(text: string, secrets: ReadonlyArray<string> = []): string {
  return scrubSecrets(text, secrets).replace(KEY_SHAPED, "[redacted]");
}

export type SafeLogger = (
  event: string,
  fields?: LogFields,
  secrets?: ReadonlyArray<string>,
) => void;

export const logSafe: SafeLogger = (event, fields = {}, secrets = []) => {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [name, value] of Object.entries(fields)) {
    clean[name] = typeof value === "string" ? maskText(value, secrets) : value;
  }
  console.error(JSON.stringify({ event: maskText(event, secrets), ...clean }));
};

// @tanstack/ai logs caught errors itself, by default with `console.error` and the whole error
// object (stack, and whatever the provider SDK attached). That would bypass logSafe, so the
// chat route passes this logger as `debug.logger` and turns every other category off.
//
// The library calls `error(message, meta)`. `message` is a label the library wrote itself
// ("anthropic.chatStream fatal"); the caught error, with whatever the provider said, is in
// `meta`. Only the label is kept. `meta` is dropped whole: a provider error can quote the
// user's conversation, and the SDK attaches request and response objects to it. Do not add
// fields from `meta` here. The label is not a promise of the library, so it is still masked
// and cut, and a test in chat-handler.test.ts fails if error text ever shows up in it (#54).
export function libraryLogger(log: SafeLogger, secrets: ReadonlyArray<string>) {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    // Mask first, then cut: cutting first could split a key so the scrubber no longer matches it.
    error: (message: string) =>
      log("ai.error", { message: maskText(message, secrets).slice(0, 300) }, secrets),
  };
}

export const LIBRARY_DEBUG_CATEGORIES = {
  provider: false,
  output: false,
  middleware: false,
  tools: false,
  agentLoop: false,
  config: false,
  request: false,
  sandbox: false,
  errors: true,
} as const;
