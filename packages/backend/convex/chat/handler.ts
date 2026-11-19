import {
  type AnyTextAdapter,
  chat,
  chatParamsFromRequestBody,
  type StreamChunk,
  StreamProcessor,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { outlineSchema, renderOutline } from "@unfold/interview/outline";
import {
  DEFAULT_PROVIDER,
  isSupportedProvider,
  PROVIDERS,
  type ProviderId,
} from "@unfold/interview/providers";
import { SYSTEM_PROMPT } from "@unfold/interview/system-prompt";
import { interviewTools } from "@unfold/interview/tools";
import { RUN_HEARTBEAT_MS } from "../turns";
import {
  LIBRARY_DEBUG_CATEGORIES,
  libraryLogger,
  logSafe,
  maskText,
  type SafeLogger,
} from "./safeLog";
import { testProviderBaseUrl } from "./testProviderUrl";

// Limits for one turn. The whole conversation travels with every request (the server
// holds no state, ADR 0012), so these bound the cost of a request, not of a conversation.
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_MESSAGES = 400;
export const MAX_KEY_LENGTH = 512;

/**
 * One run's hold on an idea's turn document (ADR 0015). The action builds it from its Convex
 * context; tests pass a fake. No method takes the key: it never leaves this module's request.
 */
export type TurnRun = {
  /** Writes the message so far, or only marks the run alive. False: the run lost the turn. */
  write(message?: string): Promise<boolean>;
  /** Ends the run with its final message. False: lost the turn, or the idea cannot hold it. */
  end(message: string, needsAnswer: boolean): Promise<boolean>;
  /** Marks the run interrupted. Safe to call when the turn is already lost. */
  interrupt(): Promise<void>;
};

/** Claims the idea's turn for a new run. `missing`: no such idea of the caller's. */
export type StartTurn = (ideaId: string, runId: string) => Promise<TurnRun | "missing" | "busy">;

// How often a streaming reply is written to the turn document. The main cost lever (ADR 0015,
// spike): each write is a mutation and re-runs the live query of every open tab.
export const WRITE_INTERVAL_MS = 1500;

export type ChatDeps = {
  /** Where the run is recorded. Without it the handler only streams (tests of the protocol). */
  startTurn?: StartTurn;
  /** Builds the provider adapter from the user's key. Tests pass a fake here. */
  createAdapter?: (provider: ProviderId, key: string) => AnyTextAdapter;
  log?: SafeLogger;
};

function defaultCreateAdapter(provider: ProviderId, key: string): AnyTextAdapter {
  // One provider today; the map is keyed by the allow-list so a new one is a type error here.
  const factories: Record<ProviderId, (key: string) => AnyTextAdapter> = {
    anthropic: (k) =>
      createAnthropicChat(PROVIDERS.anthropic.model, k, { baseURL: testProviderBaseUrl() }),
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

  // The tree outline (ADR 0012). It is optional, so a tab still running the previous version
  // keeps working after a deploy. Its size is bounded by MAX_BODY_BYTES. It is the user's
  // conversation: it goes to the model and is never logged (ADR 0003).
  const outline = outlineSchema.optional().safeParse(params.forwardedProps.outline);
  if (!outline.success) {
    return jsonError(400, "invalid_body", "The tree outline is not valid.");
  }

  // `getByokKey` with a plain slug reads the header only. It never falls back to a
  // server-side environment key (ADR 0003, item 2).
  const key = getByokKey(request, requested)?.trim();
  if (!key) return byokMissing(requested);
  if (key.length > MAX_KEY_LENGTH) {
    return jsonError(400, "invalid_key", "That key is not valid.");
  }

  // Not linked to `request.signal` on purpose: a run must outlive the browser that started it
  // (ADR 0015, spike). Only this controller stops it: Stop, a lost turn, or an error.
  const abortController = new AbortController();

  let turnRun: TurnRun | null = null;
  if (deps.startTurn) {
    const ideaId = params.forwardedProps.ideaId;
    if (typeof ideaId !== "string" || ideaId.length === 0 || ideaId.length > 100) {
      return jsonError(400, "invalid_body", "The request has no idea.");
    }
    const started = await deps.startTurn(ideaId, crypto.randomUUID());
    if (started === "missing") return jsonError(404, "idea_missing", "That idea was not found.");
    if (started === "busy") return jsonError(409, "run_busy", "A reply is already being written.");
    turnRun = started;
  }

  // Client-declared tools in the body are ignored on purpose: the model gets only ours.
  let stream: AsyncIterable<StreamChunk>;
  try {
    stream = chat({
      adapter: createAdapter(requested, key),
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      parentRunId: params.parentRunId,
      resume: params.resume,
      // The fixed prompt stays first, so the part of the request that never changes leads.
      systemPrompts: outline.data ? [SYSTEM_PROMPT, renderOutline(outline.data)] : [SYSTEM_PROMPT],
      tools: [...interviewTools],
      abortController,
      debug: { ...LIBRARY_DEBUG_CATEGORIES, logger: libraryLogger(log, [key]) },
    });
  } catch (error) {
    // Do not let an exception (and its message) escape as a framework 500 page.
    log("chat.setup_failed", { error: error instanceof Error ? error.name : "unknown" });
    await turnRun?.interrupt().catch(() => {});
    return jsonError(500, "chat_failed", "The chat could not be started.");
  }

  log("chat.request", { provider: requested, messages: params.messages.length }, [key]);
  const scrubbed = scrubErrors(stream, [key]);
  const out = turnRun ? recordRun(scrubbed, turnRun, abortController, log, [key]) : scrubbed;
  return toServerSentEventsResponse(out);
}

// The assistant message a run produced, and whether it waits for the user: a tool call with no
// output (`ask_round` and `propose_finish` have no handler, ADR 0012).
function finalMessage(processor: StreamProcessor) {
  const message = [...processor.getMessages()].reverse().find((m) => m.role === "assistant");
  if (!message || message.parts.length === 0) return null;
  const needsAnswer = message.parts.some(
    (part) => part.type === "tool-call" && part.output === undefined,
  );
  return { json: JSON.stringify(message), needsAnswer };
}

// Passes every chunk on to the browser and records the run in the turn document. It carries on
// recording when the browser leaves, until the model is done or the turn is lost.
async function* recordRun(
  stream: AsyncIterable<StreamChunk>,
  run: TurnRun,
  abortController: AbortController,
  log: SafeLogger,
  secrets: ReadonlyArray<string>,
): AsyncGenerator<StreamChunk> {
  const processor = new StreamProcessor();
  let lost = false;
  let failed = false;
  let lastWrite = Date.now();
  let writing: Promise<void> = Promise.resolve();

  // Writes are serialised, and never block the chunks going to the browser.
  const queueWrite = (message?: string) => {
    lastWrite = Date.now();
    writing = writing.then(async () => {
      if (lost) return;
      const ok = await run.write(message).catch(() => false);
      if (!ok) {
        lost = true;
        abortController.abort();
      }
    });
  };

  const heartbeat = setInterval(() => {
    if (Date.now() - lastWrite >= RUN_HEARTBEAT_MS) queueWrite();
  }, RUN_HEARTBEAT_MS);

  const observe = (chunk: StreamChunk) => {
    if (chunk.type === "RUN_ERROR") failed = true;
    try {
      processor.processChunk(chunk);
    } catch {
      failed = true;
    }
    if (Date.now() - lastWrite >= WRITE_INTERVAL_MS) {
      const current = finalMessage(processor);
      if (current) queueWrite(current.json);
    }
  };

  // Pulled by hand, not with `for await`: when the browser leaves, the consumer returns from the
  // `yield`, and `for await` would then close the model's stream. The run must go on instead.
  const source = stream[Symbol.asyncIterator]();
  let exhausted = false;
  try {
    for (;;) {
      const next = await source.next();
      if (next.done) {
        exhausted = true;
        break;
      }
      observe(next.value);
      yield next.value;
    }
  } catch (error) {
    failed = true;
    exhausted = true;
    log("chat.stream_failed", { error: error instanceof Error ? error.name : "unknown" }, secrets);
    throw error;
  } finally {
    if (!exhausted && !lost) {
      // The browser left mid-run (ADR 0015, spike). Keep recording until the model is done.
      try {
        for (;;) {
          const next = await source.next();
          if (next.done) break;
          observe(next.value);
        }
      } catch {
        failed = true;
      }
    }
    clearInterval(heartbeat);
    await writing;
    // An aborted `chat()` ends quietly, so the end of the stream is not proof of success.
    const done = !failed && !lost && !abortController.signal.aborted;
    const final = done ? finalMessage(processor) : null;
    let ended = false;
    if (final) ended = await run.end(final.json, final.needsAnswer).catch(() => false);
    if (!ended) await run.interrupt().catch(() => {});
  }
}
