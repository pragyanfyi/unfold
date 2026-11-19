import { fetchServerSentEvents, type UIMessage } from "@tanstack/ai-react";
import { deriveTree } from "@unfold/interview/derive-tree";
import { buildOutline } from "@unfold/interview/outline";

// The connection to the interview, which runs in a Convex HTTP action (ADR 0015). Each request
// carries, next to `provider` in `forwardedProps`:
// - the tree outline (ADR 0012), and
// - the idea's id, so the action records the run in that idea's turn document, and
// - `expectedNextSeq`, the stored count `beforeRun` reached, so the action refuses a run from
//   history the server does not hold (another tab moved on).
// The signed-in user's access token goes in `Authorization`; the provider key goes in
// `x-byok-anthropic`, added by the keyring (ADR 0003). The action's address is the build's
// `__CONVEX_SITE_URL__`, the same origin the CSP allows (`connect-src`, ADR 0015).
//
// The outline is built here, from the very messages being sent, and not passed through the
// `forwardedProps` option: the hook copies that option to the client in an effect, so a
// request that resumes right after an answer would carry the outline of the render before it.
export type InterviewConnectionOptions = {
  ideaId: string;
  /** The address of the action's `/chat` route. */
  url: string;
  getToken: () => string | null;
  /**
   * Runs before every request with the messages being sent, and the request is not sent if it
   * throws: storage must hold them first (`ConversationSaver.beforeRun`). Resolves with the
   * number of stored messages.
   */
  beforeRun?: (messages: ReadonlyArray<UIMessage>) => Promise<number>;
};

export function chatUrl(siteUrl: string | undefined): string {
  if (!siteUrl) {
    throw new Error("No Convex deployment is configured. See docs/operations/development.md.");
  }
  return `${siteUrl.replace(/\/$/, "")}/chat`;
}

export function interviewConnection(options: InterviewConnectionOptions) {
  const base = fetchServerSentEvents(options.url, () => {
    const headers: Record<string, string> = {};
    const token = options.getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    return { headers };
  });
  const connect: typeof base.connect = async function* (messages, data, abortSignal, runContext) {
    // The chat client always sends UI messages (the other form is for calling an adapter
    // directly).
    const ui = messages as ReadonlyArray<UIMessage>;
    const expectedNextSeq = await options.beforeRun?.(ui);
    const outline = buildOutline(deriveTree(ui));
    const props = { ...data, outline, ideaId: options.ideaId, expectedNextSeq };
    yield* base.connect(messages, props, abortSignal, runContext);
  };
  return { ...base, connect };
}
