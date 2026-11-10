import { fetchServerSentEvents, type UIMessage, useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getByok } from "#/features/byok/key-store";
import { DEFAULT_PROVIDER } from "./providers";
import {
  type Answer,
  buildRoundAnswers,
  type FinishDecision,
  type FinishInput,
  type RoundAnswers,
  type RoundInput,
} from "./round-answers";
import { askRound, proposeFinish } from "./tools";

// What the model is waiting for the user to do. Only one thing is pending at a time.
export type PendingTurn =
  | { kind: "round"; toolCallId: string; input: RoundInput }
  | { kind: "finish"; toolCallId: string; input: FinishInput };

type Waiter = {
  toolCallId: string;
  resolve: (output: RoundAnswers | FinishDecision) => void;
  reject: (reason: Error) => void;
};

// The chat client for the interview. `byok` makes the client read the key from the keyring
// and stamp it in the `x-byok-anthropic` header on each send (the key is never in the body).
// With no key, the send fails with ByokBlockedError and the key dialog is requested
// (`byok.getSnapshot().prompt`). Storage (#28) feeds `initialMessages`; we save through our
// own functions, so `persistence` stays off (it is off unless set).
//
// How a round is answered (ADR 0012, spike in answers-as-tool-result.test.ts): the server's
// `ask_round` has no handler, so the run ends waiting for the client. The client declares the
// same tool with an `execute` that waits for the user. `pendingRound` is the round being
// asked, and `submitRound` resolves it with the answers, which resumes the run with a real
// tool result. A normal user message is refused by the library while a round is pending.
export function useInterviewChat(
  threadId: string,
  initialMessages?: Array<UIMessage>,
  options: { byok?: ReturnType<typeof getByok>; onFinish?: (message: UIMessage) => void } = {},
) {
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const waiter = useRef<Waiter | null>(null);

  const clearWaiter = useCallback((reason: Error) => {
    waiter.current?.reject(reason);
    waiter.current = null;
    setPending(null);
  }, []);

  // One stable pair of tools for the life of the hook: the client reads `tools` once.
  const tools = useMemo(() => {
    function wait(
      turn: PendingTurn,
      abortSignal: AbortSignal | undefined,
    ): Promise<RoundAnswers | FinishDecision> {
      return new Promise((resolve, reject) => {
        waiter.current = { toolCallId: turn.toolCallId, resolve, reject };
        setPending(turn);
        abortSignal?.addEventListener(
          "abort",
          () => {
            if (waiter.current?.toolCallId === turn.toolCallId) clearWaiter(new Error("Stopped"));
          },
          { once: true },
        );
      });
    }
    return [
      askRound.client(
        (input, context) =>
          wait(
            { kind: "round", toolCallId: context?.toolCallId ?? "", input },
            context?.abortSignal,
          ) as Promise<RoundAnswers>,
      ),
      proposeFinish.client(
        (input, context) =>
          wait(
            { kind: "finish", toolCallId: context?.toolCallId ?? "", input },
            context?.abortSignal,
          ) as Promise<FinishDecision>,
      ),
    ];
  }, [clearWaiter]);

  const chat = useChat({
    threadId,
    initialMessages,
    connection: fetchServerSentEvents("/api/chat"),
    byok: options.byok ?? getByok(),
    forwardedProps: { provider: DEFAULT_PROVIDER },
    tools,
    onFinish: options.onFinish,
  });

  useEffect(() => () => clearWaiter(new Error("Closed")), [clearWaiter]);

  const resolve = useCallback((output: RoundAnswers | FinishDecision) => {
    const current = waiter.current;
    if (!current) return;
    waiter.current = null;
    setPending(null);
    current.resolve(output);
  }, []);

  const submitRound = useCallback(
    (drafts: ReadonlyArray<Answer>) => resolve(buildRoundAnswers(drafts)),
    [resolve],
  );
  const submitFinish = useCallback(
    (confirmed: boolean, text: string | null) => resolve({ confirmed, text: text?.trim() || null }),
    [resolve],
  );

  const stop = useCallback(() => {
    chat.stop();
    clearWaiter(new Error("Stopped"));
  }, [chat, clearWaiter]);

  // True once any round or finish proposal has been answered.
  const hasAnswered = chat.messages.some((message) =>
    message.parts.some((part) => part.type === "tool-call" && part.output !== undefined),
  );

  // Retrying depends on where the turn failed (verified in chat-pane.test.tsx):
  // - before any round was answered, `reload()` re-asks from the user's idea;
  // - after one, `reload()` would throw the whole interview away (it truncates to the last user
  //   message), so a failed resume request is retried with `retryInterrupts()` instead.
  // A resume the user stopped cannot be retried at all (`retryInterrupts()` is a no-op and no
  // resume state is kept), so Stop is only offered before the first answer (see ChatPane).
  const retry = useCallback(() => {
    if (!hasAnswered) void chat.reload();
    else chat.retryInterrupts();
  }, [chat, hasAnswered]);

  return { ...chat, stop, retry, hasAnswered, pending, submitRound, submitFinish };
}
