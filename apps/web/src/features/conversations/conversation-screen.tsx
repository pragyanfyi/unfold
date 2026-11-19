import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { Tree } from "@unfold/interview/derive-tree";
import { useCallback, useEffect, useRef, useState } from "react";
import { type PaneTab, TwoPane } from "#/components/two-pane";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { clearPendingIdea } from "#/features/auth/pending-idea";
import { useSession } from "#/features/auth/session";
import { CanvasPane } from "#/features/canvas/canvas-pane";
import { ChatPane, type Reveal } from "#/features/chat/chat-pane";
import { conversationQuery } from "#/features/storage/queries";
import type { LoadedConversation } from "#/features/storage/types";
import { isUuid, uuidv7 } from "#/features/storage/uuid";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { SaveNotice } from "./save-notice";
import { useConversationSaver } from "./use-conversation-saver";

// The whole app screen: the saved ideas beside the two panes (ADR 0012, 0013). It is the
// layout for both `/` (a new idea) and `/c/$id` (a saved one), so the chat stays mounted when
// a new idea is first saved and the address changes to `/c/$id`: a reply in flight is not cut.
export function ConversationScreen() {
  const { id: pathId } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const [draftId, setDraftId] = useState(uuidv7);
  // The idea this tab created and still shows. Its messages are already on screen, so it is
  // not read back from storage.
  const [live, setLive] = useState<string | null>(null);
  const threadId = pathId ?? draftId;
  if (live !== null && live !== threadId) setLive(null);
  // What the user is looking at now. A first save can finish after they have moved on.
  const current = useRef(threadId);
  current.current = threadId;

  // Sign-in is required (ADR 0016). Signed out on a saved idea's address, the user goes to `/`
  // with the onboarding dialog at sign-in, and Google brings them back to that address. Signing
  // out from inside the app starts a new, empty idea instead, with no dialog.
  const session = useSession();
  const [signInReturnTo, setSignInReturnTo] = useState<string | null>(null);

  // A new idea never reopens the sign-in prompt of an address the user has left.
  const startNew = () => {
    setSignInReturnTo(null);
    setDraftId(uuidv7());
    void navigate({ to: "/" });
  };
  const lastStatus = useRef(session.status);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `startNew` is a fresh function each render; this reacts to the session and the address only.
  useEffect(() => {
    const was = lastStatus.current;
    lastStatus.current = session.status;
    if (session.status !== "signed-out") return;
    if (was === "signed-in") {
      // An unsent idea belongs to the person who typed it, not to whoever uses the tab next.
      clearPendingIdea();
      startNew();
    } else if (pathId !== undefined) {
      setSignInReturnTo(`/c/${pathId}`);
      setDraftId(uuidv7());
      void navigate({ to: "/", replace: true });
    }
  }, [session.status, pathId, navigate]);
  const showSaved = pathId !== undefined && pathId !== live;

  return (
    <SidebarProvider>
      <AppSidebar
        onNew={startNew}
        onDeleted={(id) => {
          if (id === threadId) startNew();
        }}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <AppHeader />
        <div className="min-h-0 flex-1">
          {showSaved && session.status !== "signed-in" ? (
            <LoadingIdea />
          ) : showSaved ? (
            <SavedConversation key={pathId} id={pathId} onNew={startNew} />
          ) : (
            <Conversation
              key={threadId}
              id={threadId}
              loaded={null}
              signInReturnTo={signInReturnTo}
              onFirstSave={() => {
                // Left this idea while it was being saved: it is in the list now, and the
                // user's current choice must not be replaced by its address.
                if (current.current !== threadId) return;
                setLive(threadId);
                if (pathId === undefined) {
                  void navigate({ to: "/c/$id", params: { id: threadId }, replace: true });
                }
              }}
              onNew={startNew}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SavedConversation({ id, onNew }: { id: string; onNew: () => void }) {
  const query = useQuery({ ...conversationQuery(id), enabled: isUuid(id) });
  // Once loaded, the pane keeps what it was given: later saves must not unmount it.
  const [loaded, setLoaded] = useState<LoadedConversation | null>(null);
  if (query.data && !loaded) setLoaded(query.data);

  if (loaded) return <Conversation id={id} loaded={loaded} onNew={onNew} />;
  if (query.isPending && isUuid(id)) return <LoadingIdea />;
  const message = query.isError
    ? "This idea could not be loaded."
    : "There is no saved idea at this address. It may have been deleted.";
  return (
    <div className="p-6">
      <Alert className="mx-auto max-w-2xl">
        <AlertTitle>Idea not found</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{message}</span>
          <div className="flex gap-2">
            {query.isError ? (
              <Button type="button" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onNew}>
              New idea
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function LoadingIdea() {
  return (
    <div className="flex flex-col gap-3 p-6" role="status" aria-label="Loading idea">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function Conversation({
  id,
  loaded,
  signInReturnTo = null,
  onFirstSave,
  onNew,
}: {
  id: string;
  loaded: LoadedConversation | null;
  signInReturnTo?: string | null;
  onFirstSave?: () => void;
  onNew: () => void;
}) {
  const saver = useConversationSaver({
    id,
    existed: loaded !== null,
    onFirstSave,
  });
  // The chat derives the tree and the canvas draws it. The selected node lives here, outside
  // React Flow, so both panes read it (#31).
  const [tree, setTree] = useState<Tree | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [tab, setTab] = useState<PaneTab>("chat");
  // A node picked on the canvas shows its turn in the chat. On a small screen that means
  // switching to the chat tab; side by side, the tab changes nothing.
  const selectOnCanvas = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id === null) return;
    setReveal((current) => ({ id, seq: (current?.seq ?? 0) + 1 }));
    setTab("chat");
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SaveNotice status={saver.status} onRetry={saver.retry} onNew={onNew} />
      <div className="min-h-0 flex-1">
        <TwoPane
          tab={tab}
          onTabChange={setTab}
          chat={
            <ChatPane
              threadId={id}
              initialMessages={loaded?.messages}
              beforeRun={saver.beforeRun}
              onStop={saver.stopRun}
              onStartOver={onNew}
              signInReturnTo={signInReturnTo}
              onTree={setTree}
              selectedId={selectedId}
              onSelect={setSelectedId}
              reveal={reveal}
            />
          }
          canvas={<CanvasPane tree={tree} selectedId={selectedId} onSelect={selectOnCanvas} />}
        />
      </div>
    </div>
  );
}
