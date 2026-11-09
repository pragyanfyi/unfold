import {
  type AnyTextAdapter,
  chat,
  chatParamsFromRequestBody,
  type StreamChunk,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { DEFAULT_PROVIDER, isSupportedProvider, PROVIDERS, type ProviderId } from "./providers";
import {
  LIBRARY_DEBUG_CATEGORIES,
  libraryLogger,
  logSafe,
  maskText,
  type SafeLogger,
} from "./safe-log";
import { SYSTEM_PROMPT } from "./system-prompt";
import { interviewTools } from "./tools";

// Limits for one turn. The whole conversation travels with every request (the server
// holds no state, ADR 0012), so these bound the cost of a request, not of a conversation.
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_MESSAGES = 400;
export const MAX_KEY_LENGTH = 512;

export type ChatDeps = {
  /** Builds the provider adapter from the user's key. Tests pass a fake here. */
  createAdapter?: (provider: ProviderId, key: string) => AnyTextAdapter;
  log?: SafeLogger;
};

function defaultCreateAdapter(provider: ProviderId, key: string): AnyTextAdapter {
  // One provider today; the map is keyed by the allow-list so a new one is a type error here.
  const factories: Record<ProviderId, (key: string) => AnyTextAdapter> = {
    anthropic: (k) => createAnthropicChat(PROVIDERS.anthropic.model, k),
  };
  return factories[provider](key);
}

// Errors are fixed strings: they never echo the body, a header or a provider message.
function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { type: code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Provider errors can quote what we sent. Scrub every string in an error event.
function scrubDeep(value: unknown, secrets: ReadonlyArray<string>): unknown {
  if (typeof value === "string") return maskText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, secrets));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, scrubDeep(item, secrets)]),
    );
  }
  return value;
}

async function* scrubErrors(
  stream: AsyncIterable<StreamChunk>,
  secrets: ReadonlyArray<string>,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const chunk of stream) {
      yield chunk.type === "RUN_ERROR" ? (scrubDeep(chunk, secrets) as StreamChunk) : chunk;
    }
  } catch (error) {
    // A thrown error is turned into a RUN_ERROR by the response writer, with its message.
    // Rethrow a fresh error with only a scrubbed message: no stack, cause or attached headers.
    throw new Error(maskText(error instanceof Error ? error.message : "Chat failed", secrets));
  }
}

// Reads at most MAX_BODY_BYTES. Content-Length can be absent (chunked) or wrong, so the
// stream is counted as it arrives and cancelled at the limit, not buffered whole first.
async function readBody(request: Request): Promise<unknown | Response> {
  const tooLarge = () => jsonError(413, "body_too_large", "The request is too large.");
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge();

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return jsonError(400, "invalid_body", "The request body is not valid JSON.");
  }
}

export async function handleChatRequest(request: Request, deps: ChatDeps = {}): Promise<Response> {
  const log = deps.log ?? logSafe;
  const createAdapter = deps.createAdapter ?? defaultCreateAdapter;

  const body = await readBody(request);
  if (body instanceof Response) return body;

  let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>;
  try {
    params = await chatParamsFromRequestBody(body);
  } catch {
    // The library's message describes the body, which we do not echo or log.
    return jsonError(400, "invalid_body", "The request body is not a valid chat request.");
  }
  if (params.messages.length === 0 || params.messages.length > MAX_MESSAGES) {
    return jsonError(400, "invalid_body", "The conversation has too few or too many messages.");
  }

  const requested = params.forwardedProps.provider ?? DEFAULT_PROVIDER;
  if (!isSupportedProvider(requested)) {
    return jsonError(400, "unsupported_provider", "That provider is not supported.");
  }

  // `getByokKey` with a plain slug reads the header only. It never falls back to a
  // server-side environment key (ADR 0003, item 2).
  const key = getByokKey(request, requested)?.trim();
  if (!key) return byokMissing(requested);
  if (key.length > MAX_KEY_LENGTH) {
    return jsonError(400, "invalid_key", "That key is not valid.");
  }

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  // Client-declared tools in the body are ignored on purpose: the model gets only ours.
  let stream: AsyncIterable<StreamChunk>;
  try {
    stream = chat({
      adapter: createAdapter(requested, key),
      messages: params.messages,
      threadId: params.threadId,
      systemPrompts: [SYSTEM_PROMPT],
      tools: [...interviewTools],
      abortController,
      debug: { ...LIBRARY_DEBUG_CATEGORIES, logger: libraryLogger(log, [key]) },
    });
  } catch (error) {
    // Do not let an exception (and its message) escape as a framework 500 page.
    log("chat.setup_failed", { error: error instanceof Error ? error.name : "unknown" });
    return jsonError(500, "chat_failed", "The chat could not be started.");
  }

  log("chat.request", { provider: requested, messages: params.messages.length }, [key]);
  return toServerSentEventsResponse(scrubErrors(stream, [key]), { abortController });
}
