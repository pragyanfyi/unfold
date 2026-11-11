import { type UIMessage, useByok } from "@tanstack/ai-react";
import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Message, MessageContent } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "#/components/ui/trace";
import { KeyDialog } from "#/features/byok/key-dialog";
import { getByok } from "#/features/byok/key-store";
import { ChatMessage } from "./chat-message";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { FinishCard } from "./finish-card";
import { DEFAULT_PROVIDER } from "./providers";
import type { FinishDecision } from "./round-answers";
import { RoundForm } from "./round-form";
import { proposeFinish } from "./tools";
import { TurnError } from "./turn-error";
import { useInterviewChat } from "./use-interview-chat";

// The interview chat (#27). It is one pane of two (ADR 0012) and knows nothing about the
// canvas. Storage (#28) plugs in through `initialMessages` and `onFinish`.
export function ChatPane({
  threadId,
  initialMessages,
  onFinish,
  onSavable,
  onStartOver,
  byok = getByok(),
}: {
  threadId: string;
  initialMessages?: Array<UIMessage>;
  onFinish?: (message: UIMessage) => void;
  /** Called when more of the conversation may be stored (ADR 0013). */
  onSavable?: (messages: Array<UIMessage>) => void;
  /** What "Start over" does. Stored conversations are never cleared, so the app starts a new one. */
  onStartOver?: () => void;
  byok?: ReturnType<typeof getByok>;
}) {
  const chat = useInterviewChat(threadId, initialMessages, { byok, onFinish, onSavable });
  const snapshot = useByok(byok);
  const keyState = snapshot.status[DEFAULT_PROVIDER]?.state;
  const hasKey = keyState === "set" || keyState === "locked";

  const [draft, setDraft] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);

  const busy = chat.status === "submitted" || chat.status === "streaming";
  // Empty assistant messages are leftovers of a failed turn and are not shown.
  const visible = chat.messages.filter(
    (message) => message.role !== "assistant" || message.parts.length > 0,
  );
  const last = chat.messages.at(-1);
  const waitingForModel =
    busy && !chat.pending && (last?.role === "user" || last?.parts.length === 0);

  // A finished turn always ends in a tool call (ADR 0012). Without an error, no pending
  // question and no run in flight, a conversation that does not end in an unanswered one was
  // stopped by the user or ended without a tool call.
  const lastVisible = visible.at(-1);
  const endsInUnansweredCall =
    lastVisible?.role === "assistant" &&
    lastVisible.parts.some((part) => part.type === "tool-call" && part.output === undefined);
  // After the user confirms the summary the interview is over, and the model's closing reply
  // has no tool call on purpose.
  const confirmed = chat.messages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "tool-call" &&
        part.name === proposeFinish.name &&
        (part.output as FinishDecision | undefined)?.confirmed === true,
    ),
  );
  const stalled =
    !busy &&
    !chat.pending &&
    !chat.error &&
    !confirmed &&
    visible.length > 0 &&
    !endsInUnansweredCall;
  // A restored conversation whose stored answer has no reply (a reload cut it off). This holds
  // for a confirmed finish too, whose closing reply was never stored, so it does not depend on
  // `stalled`, which is false once the interview is confirmed.
  const cutOff = chat.resumable && !busy && !chat.pending && !chat.error;
  // Continuing spends the user's key, so ask for one first. A restored conversation does not
  // reach the send path that does this.
  const retry = () => {
    if (!hasKey) setKeyOpen(true);
    else chat.retry();
  };

  async function send(text: string) {
    setDraft("");
    try {
      await chat.sendMessage(text);
    } catch {
      // A send with no key is refused before anything reaches the server, and the library
      // asks for a key. Keep the idea so the user can send it again after saving a key.
      if (byok.getSnapshot().prompt) {
        chat.setMessages([]);
        setDraft(text);
        setKeyOpen(true);
      }
    }
  }

  const keyControl = <KeyDialog byok={byok} open={keyOpen} onOpenChange={setKeyOpen} />;
  // Exactly one dialog is mounted, because both are bound to the same open state. It sits in
  // the empty state when the user has no key, and out of sight otherwise.
  const emptyState = visible.length === 0 && !busy;
  const keyInEmptyState = emptyState && !hasKey;

  return (
    <section aria-label="Interview chat" className="flex h-full min-h-0 flex-col">
      {emptyState ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          <EmptyState
            hasKey={hasKey}
            keyControl={keyInEmptyState ? keyControl : null}
            onPick={setDraft}
          />
        </div>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
                {visible.map((message, index) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <ChatMessage
                      message={message}
                      streaming={busy && index === visible.length - 1}
                    />
                  </MessageScrollerItem>
                ))}
                {waitingForModel ? (
                  <MessageScrollerItem messageId="waiting">
                    <Message>
                      <MessageContent>
                        <Trace>
                          <TraceLine status="running">
                            <TraceIcon>
                              <LoaderCircleIcon className="animate-spin" />
                            </TraceIcon>
                            <TraceTitle>Thinking</TraceTitle>
                          </TraceLine>
                        </Trace>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-4">
        {chat.error && !busy ? (
          <TurnError message={chat.error.message} onRetry={retry} />
        ) : cutOff || (stalled && !chat.hasAnswered) ? (
          <TurnError
            title="The reply stopped"
            message="It did not finish. Try again to continue the interview."
            onRetry={retry}
          />
        ) : stalled ? (
          // After an answer there is nothing to retry (see use-interview-chat.ts).
          <TurnError
            title="The interview cannot continue"
            message="The reply ended without a question, and this conversation cannot be resumed."
            actionLabel="Start over"
            onRetry={onStartOver ?? chat.clear}
          />
        ) : null}
        {chat.pending?.kind === "round" ? (
          <div className="rounded-3xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
            <RoundForm
              key={chat.pending.toolCallId}
              questions={chat.pending.input.questions}
              onSubmit={chat.submitRound}
            />
          </div>
        ) : chat.pending?.kind === "finish" ? (
          <div className="rounded-3xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
            <FinishCard key={chat.pending.toolCallId} onDecide={chat.submitFinish} />
          </div>
        ) : visible.length === 0 ? (
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            busy={busy}
            onStop={chat.stop}
          />
        ) : busy && !chat.hasAnswered ? (
          <Button type="button" variant="outline" className="self-center" onClick={chat.stop}>
            Stop
          </Button>
        ) : null}
        {hasKey || visible.length > 0 ? null : (
          <p className="text-center text-xs text-muted-foreground">
            You can type your idea first. Unfold asks for your key when you send it.
          </p>
        )}
      </div>
      {keyInEmptyState ? null : <div className={hasKey ? "hidden" : "px-4 pb-4"}>{keyControl}</div>}
    </section>
  );
}
