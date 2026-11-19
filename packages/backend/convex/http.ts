import { getAuthUserId } from "@convex-dev/auth/server";
import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, httpAction } from "./_generated/server";
import { ALLOWED_REDIRECT_ORIGINS } from "./auth";
import { handleChatRequest, type StartTurn, type TurnRun } from "./chat/handler";
import { logSafe } from "./chat/safe-log";

// The interview runs here (ADR 0015). The browser calls `POST /chat` on the deployment's HTTP
// actions URL with the signed-in user's access token and the provider key in `x-byok-<provider>`.
// The key stays in that header: it is never an argument of `runMutation`, the scheduler or any
// other function, a document field or a log line (ADR 0003). Every error is a fixed string.

// The origins that may call the action: the same ones sign-in sends people back to.
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_REDIRECT_ORIGINS.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-byok-anthropic",
    // A tab reuses one preflight for many turns. Chromium caps this at 2 hours.
    "access-control-max-age": "7200",
    vary: "origin",
  };
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request))) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function plainError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { type: code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data === "object" && data !== null && "code" in data) return String(data.code);
  return null;
}

// Builds the hold on one idea's turn from the action's context. The key is not in scope here.
function turnStarter(ctx: ActionCtx, ownerId: Id<"users">): StartTurn {
  return async (id, runId) => {
    let ideaId: Id<"ideas">;
    try {
      ideaId = await ctx.runMutation(internal.turns.start, { ownerId, id, runId });
    } catch (error) {
      const code = errorCode(error);
      if (code === "missing") return "missing";
      if (code === "busy") return "busy";
      throw error;
    }
    const run: TurnRun = {
      write: (message) => ctx.runMutation(internal.turns.batch, { ideaId, runId, message }),
      // `too-large` throws and leaves the turn running; the handler then interrupts the run.
      end: (message, needsAnswer) =>
        ctx.runMutation(internal.turns.end, { ideaId, runId, message, needsAnswer }),
      interrupt: async () => {
        await ctx.runMutation(internal.turns.interrupt, { ideaId, runId });
      },
    };
    return run;
  };
}

// The action context is what `getAuthUserId` documents for actions; its declared `runQuery`
// options type differs from this project's Convex version only in a type, not at runtime.
type AuthCtx = Parameters<typeof getAuthUserId>[0];

const chat = httpAction(async (ctx, request) => {
  try {
    // A malformed token makes this throw; its message must not reach the browser.
    const userId = await getAuthUserId(ctx as unknown as AuthCtx).catch(() => null);
    if (userId === null) {
      return withCors(request, plainError(401, "signed_out", "Sign in to chat."));
    }
    const response = await handleChatRequest(request, {
      startTurn: turnStarter(ctx, userId),
      log: logSafe,
    });
    return withCors(request, response);
  } catch {
    // Never the error itself: it could hold conversation text or, on a development
    // deployment, a stack trace.
    logSafe("chat.action_failed");
    return withCors(request, plainError(500, "chat_failed", "The chat could not be started."));
  }
});

const preflight = httpAction(async (_ctx, request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
});

const http = httpRouter();
http.route({ path: "/chat", method: "POST", handler: chat });
http.route({ path: "/chat", method: "OPTIONS", handler: preflight });
export default http;
