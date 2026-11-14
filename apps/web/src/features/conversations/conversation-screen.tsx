import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TwoPane } from "#/components/two-pane";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { CanvasPane } from "#/features/canvas/canvas-pane";
import { ChatPane } from "#/features/chat/chat-pane";
import { onChangeElsewhere } from "#/features/storage/channel";
import { conversationKeys, conversationQuery } from "#/features/storage/queries";
import type { LoadedConversation } from "#/features/storage/types";
import { isUuid, uuidv7 } from "#/features/storage/uuid";
import type { Tree } from "#/features/tree/derive-tree";
import { AppSidebar } from "./app-sidebar";
import { SaveNotice } from "./save-notice";
import { useConversationSaver } from "./use-conversation-saver";

// The whole app screen: the saved ideas beside the two panes (ADR 0012, 0013). It is the
// layout for both `/` (a new idea) and `/c/$id` (a saved one), so the chat stays mounted when
// a new idea is first saved and the address changes to `/c/$id`: a reply in flight is not cut.
export function ConversationScreen() {
  const { id: pathId } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draftId, setDraftId] = useState(uuidv7);
  // The idea this tab created and still shows. Its messages are already on screen, so it is
  // not read back from storage.
  const [live, setLive] = useState<string | null>(null);
  const threadId = pathId ?? draftId;
  if (live !== null && live !== threadId) setLive(null);
  // What the user is looking at now. A first save can finish after they have moved on.
  const current = useRef(threadId);
  current.current = threadId;

  useEffect(
    () =>
      onChangeElsewhere(() => {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      }),
    [queryClient],
  );

  const startNew = () => {
    setDraftId(uuidv7());
    void navigate({ to: "/" });
  };

  return (
    <SidebarProvider>
      <AppSidebar
        onNew={startNew}
        onDeleted={(id) => {
          if (id === threadId) startNew();
        }}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">Unfold</h1>
        </header>
        <div className="min-h-0 flex-1">
          {pathId !== undefined && pathId !== live ? (
            <SavedConversation key={pathId} id={pathId} onNew={startNew} />
          ) : (
            <Conversation
              key={threadId}
              id={threadId}
              loaded={null}
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
  if (query.isPending && isUuid(id)) {
    return (
      <div className="flex flex-col gap-3 p-6" role="status" aria-label="Loading idea">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const message = query.isError
    ? "This idea could not be read from this browser."
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

function Conversation({
  id,
  loaded,
  onFirstSave,
  onNew,
}: {
  id: string;
  loaded: LoadedConversation | null;
  onFirstSave?: () => void;
  onNew: () => void;
}) {
  const saver = useConversationSaver({
    id,
    stored: loaded?.messages.length ?? 0,
    onFirstSave,
  });
  // The chat derives the tree and the canvas draws it. The selected node lives here, outside
  // React Flow, so the chat can read it later (#31).
  const [tree, setTree] = useState<Tree | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SaveNotice status={saver.status} onRetry={saver.retry} onNew={onNew} />
      <div className="min-h-0 flex-1">
        <TwoPane
          chat={
            <ChatPane
              threadId={id}
              initialMessages={loaded?.messages}
              onSavable={saver.onSavable}
              onStartOver={onNew}
              onTree={setTree}
            />
          }
          canvas={<CanvasPane tree={tree} selectedId={selectedId} onSelect={setSelectedId} />}
        />
      </div>
    </div>
  );
}
