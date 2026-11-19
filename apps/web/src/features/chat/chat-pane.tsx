import { type UIMessage, useByok } from "@tanstack/ai-react";
import type { Tree } from "@unfold/interview/derive-tree";
import { DEFAULT_PROVIDER } from "@unfold/interview/providers";
import type { FinishDecision } from "@unfold/interview/round-answers";
import { proposeFinish } from "@unfold/interview/tools";
import { LoaderCircleIcon } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Message, MessageContent } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "#/components/ui/message-scroller";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "#/components/ui/trace";
import { OnboardingDialog, type OnboardingStep } from "#/features/auth/onboarding-dialog";
import { clearPendingIdea, readPendingIdea, savePendingIdea } from "#/features/auth/pending-idea";
import { useSession } from "#/features/auth/session";
import { KeyDialog } from "#/features/byok/key-dialog";
import { getByok } from "#/features/byok/key-store";
import { type RoundDrafts, withDrafts } from "#/features/tree/with-drafts";
import { parkFocus, rescueFocus } from "#/lib/focus";
import { ChatMessage } from "./chat-message";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { FinishCard } from "./finish-card";
import { RoundForm } from "./round-form";
import { TurnError } from "./turn-error";
import { describeProblem } from "./turn-problem";
import { useInterviewChat } from "./use-interview-chat";

/** A request to scroll the chat to a node's turn. `seq` makes a second request for the same node. */
export type Reveal = { id: string; seq: number };

// The interview chat (#27). It is one pane of two (ADR 0012) and knows nothing about the
// canvas: it hands the tree it derives to whoever asks through `onTree`, and is linked to it
// only by node ids (#31): `selectedId`, `onSelect` and `reveal`. Storage (#28) plugs in through
// `initialMessages` and `onFinish`.
export function ChatPane({
  threadId,
  initialMessages,
  onFinish,
  beforeRun,
  onStop,
  onStartOver,
  onTree,
  selectedId = null,
  onSelect,
  reveal = null,
  signInReturnTo = null,
  byok = getByok(),
}: {
  threadId: string;
  initialMessages?: Array<UIMessage>;
  onFinish?: (message: UIMessage) => void;
  /** Runs before every request; storage must hold the messages first (ADR 0015). */
  beforeRun?: (messages: ReadonlyArray<UIMessage>) => Promise<number>;
  /** Called when the user stops a run. */
  onStop?: () => void;
  /** What "Start over" does. Stored conversations are never cleared, so the app starts a new one. */
  onStartOver?: () => void;
  /** Called with the decision tree whenever its content changes (ADR 0012). */
  onTree?: (tree: Tree) => void;
  /** The node selected on the canvas. Its question is marked in the chat. */
  selectedId?: string | null;
  /** Called with the node of the question on screen in the questionnaire. */
  onSelect?: (id: string) => void;
  /** Scrolls the chat to the turn of a node. */
  reveal?: Reveal | null;
  /**
   * Set when a signed-out user was sent here from a saved idea's address: the onboarding dialog
   * opens at sign-in, and Google returns to that address (ADR 0016).
   */
  signInReturnTo?: string | null;
  byok?: ReturnType<typeof getByok>;
}) {
  const chat = useInterviewChat(threadId, initialMessages, { byok, onFinish, beforeRun, onStop });
  // The round being answered, and its question nodes in order (#31).
  const pendingMessageId = chat.pending
    ? (chat.messages.find((message) =>
        message.parts.some(
          (part) => part.type === "tool-call" && part.id === chat.pending?.toolCallId,
        ),
      )?.id ?? null)
    : null;
  const pendingIds = chat.tree.nodes
    .filter((node) => node.kind === "question" && node.messageId === pendingMessageId)
    .map((node) => node.id);
  // What the user has answered in the questionnaire so far shows on the canvas before they
  // submit. The drafts outlive the form for a moment on purpose: the submitted answers reach
  // the messages a render later, and the node must not flick back to pending in between.
  const [roundDrafts, setRoundDrafts] = useState<RoundDrafts | null>(null);
  const tree = useMemo(() => withDrafts(chat.tree, roundDrafts), [chat.tree, roundDrafts]);
  useEffect(() => onTree?.(tree), [tree, onTree]);
  const selectedNode = tree.nodes.find((node) => node.id === selectedId) ?? null;
  // `0` for the idea, or the question's number in its round (`r2q3` is 3).
  const selectedNumber =
    selectedNode?.kind === "idea" ? 0 : Number(selectedNode?.id.match(/q(\d+)$/)?.[1] ?? NaN);
  const snapshot = useByok(byok);
  const keyState = snapshot.status[DEFAULT_PROVIDER]?.state;
  const hasKey = keyState === "set" || keyState === "locked";

  const [draft, setDraft] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);

  // Onboarding (ADR 0016): sign in, then add a key, then the interview starts. The step follows
  // from the session and the key.
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const step: OnboardingStep = !signedIn ? 1 : hasKey ? 3 : 2;
  const [onboardingOpen, setOnboardingOpen] = useState(signInReturnTo !== null);

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
  // The model's last turn broke the interview rules (ADR 0012, Validation). Its questions are
  // not shown: the tree has dropped them, so answering would go nowhere.
  const problem = chat.error ? null : chat.problem;
  const stalled =
    !busy &&
    !chat.pending &&
    !chat.error &&
    !problem &&
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
  // A rejected round or proposal is still waiting for an answer it will never get. Stop that
  // run before asking again.
  const retryRejected = () => {
    if (!hasKey) return setKeyOpen(true);
    chat.stop();
    chat.retry();
  };

  // Enter on the idea. Without a session or a key, the idea waits in the composer (and in
  // sessionStorage, so it survives the Google redirect) while the onboarding dialog asks for
  // what is missing. Nothing is sent before then.
  function send(text: string) {
    if (session.status === "loading") return;
    if (!signedIn || !hasKey) {
      savePendingIdea(text);
      setDraft(text);
      setOnboardingOpen(true);
      return;
    }
    void start(text);
  }

  async function start(text: string) {
    clearPendingIdea();
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

  // Back from Google (or a reload) with an idea typed before: it returns to the composer. Signed
  // in with a key ready, the interview starts, as the user already pressed Enter. With a key
  // that needs unlocking, the passkey prompt needs a user gesture, so the idea waits for Enter.
  // Without a key, the dialog asks for one.
  const restored = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, when the session is known.
  useEffect(() => {
    if (restored.current || session.status === "loading" || initialMessages?.length) return;
    restored.current = true;
    const idea = readPendingIdea();
    if (!idea) return;
    setDraft(idea);
    if (session.status !== "signed-in") return;
    void byok.ready().then(() => {
      const state = byok.getSnapshot().status[DEFAULT_PROVIDER]?.state;
      if (state === "set") void start(idea);
      else if (state !== "locked") setOnboardingOpen(true);
    });
  }, [session.status]);

  const keyControl = <KeyDialog byok={byok} open={keyOpen} onOpenChange={setKeyOpen} />;
  // Exactly one dialog is mounted, because both are bound to the same open state. It sits in
  // the empty state when a signed-in user has no key, and out of sight otherwise.
  const emptyState = visible.length === 0 && !busy;
  const keyInEmptyState = emptyState && !hasKey && signedIn;
  // When the control the user was on goes away (Send, or a submitted questionnaire), focus
  // goes to the messages while the reply loads. A new questionnaire or finish card then takes
  // it for itself: their effects run before this one (#32).
  const messages = useRef<HTMLDivElement>(null);
  const pendingId = chat.pending?.toolCallId ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: these are the moments a control goes away.
  useEffect(() => {
    parkFocus(messages.current);
  }, [emptyState, pendingId, busy]);

  return (
    <section aria-label="Interview chat" className="flex h-full min-h-0 flex-col">
      {emptyState ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          <EmptyState keyControl={keyInEmptyState ? keyControl : null} onPick={setDraft} />
        </div>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport ref={messages}>
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
                      selected={
                        message.id === selectedNode?.messageId && !Number.isNaN(selectedNumber)
                          ? selectedNumber
                          : null
                      }
                      revealed={
                        message.id === selectedNode?.messageId && reveal?.id === selectedId
                          ? reveal.seq
                          : 0
                      }
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
          <RevealTurn reveal={reveal} tree={tree} messages={messages} />
        </MessageScrollerProvider>
      )}

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-4">
        {chat.error && !busy ? (
          <TurnError message={chat.error.message} onRetry={retry} />
        ) : problem && !chat.hasAnswered ? (
          <TurnError
            title="The reply broke the interview rules"
            message={`${describeProblem(problem)} Try again to ask it once more.`}
            onRetry={retryRejected}
          />
        ) : problem ? (
          // After an answer there is nothing to retry (see use-interview-chat.ts).
          <TurnError
            title="The reply broke the interview rules"
            message={`${describeProblem(problem)} This conversation cannot be resumed.`}
            actionLabel="Start over"
            onRetry={onStartOver ?? chat.clear}
          />
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
        {problem ? null : chat.pending?.kind === "round" ? (
          <div className="rounded-3xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
            <RoundForm
              key={chat.pending.toolCallId}
              questions={chat.pending.input.questions}
              onSubmit={chat.submitRound}
              showIndex={selectedId ? pendingIds.indexOf(selectedId) : null}
              onStepChange={(step) => {
                const id = pendingIds[step];
                if (id && id !== selectedId) onSelect?.(id);
              }}
              onDraftsChange={(drafts) => {
                if (pendingMessageId) setRoundDrafts({ messageId: pendingMessageId, drafts });
              }}
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
        {visible.length > 0 || session.status === "loading" ? null : !signedIn ? (
          <p className="text-center text-xs text-muted-foreground">
            Free to use. You sign in with Google, then add your own Anthropic API key.
          </p>
        ) : hasKey ? null : (
          <p className="text-center text-xs text-muted-foreground">
            You can type your idea first. Unfold asks for your key when you send it.
          </p>
        )}
      </div>
      {keyInEmptyState ? null : (
        <div className={hasKey || emptyState ? "hidden" : "px-4 pb-4"}>{keyControl}</div>
      )}
      <OnboardingDialog
        open={onboardingOpen && step !== 3}
        onOpenChange={setOnboardingOpen}
        step={step}
        byok={byok}
        onSignIn={() => session.signInWithGoogle(signInReturnTo ?? undefined)}
        onKeySaved={() => {
          setOnboardingOpen(false);
          const text = draft.trim();
          if (text) void start(text);
        }}
      />
    </section>
  );
}

// Scrolls the chat to the turn of the node in `reveal`: the idea's message, or the message that
// asked the node's round. A question's answers are at the end of that message, so it is
// aligned to the bottom of the view.
//
// On a phone the chat tab opens for it, and the canvas node that had focus is hidden: focus
// then moves to the messages.
function RevealTurn({
  reveal,
  tree,
  messages,
}: {
  reveal: Reveal | null;
  tree: Tree;
  messages: RefObject<HTMLDivElement | null>;
}) {
  const { scrollToMessage } = useMessageScroller();
  const node = reveal ? tree.nodes.find((entry) => entry.id === reveal.id) : undefined;
  const messageId = node?.messageId;
  const align = node?.kind === "idea" ? "start" : "end";
  const seq = reveal?.seq;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each request scrolls once, on its `seq`; a tree that grows later must not scroll again.
  useEffect(() => {
    if (!messageId) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToMessage(messageId, { align, behavior: reduced ? "auto" : "smooth" });
    rescueFocus(messages.current);
  }, [seq]);
  return null;
}
