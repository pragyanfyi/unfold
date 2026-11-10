import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TwoPane } from "#/components/two-pane";
import { CanvasPlaceholder } from "#/features/canvas/canvas-placeholder";
import { ChatPane } from "#/features/chat/chat-pane";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  // A fresh conversation per page load until storage (#28) restores and lists them.
  const [threadId] = useState(() => crypto.randomUUID());
  return <TwoPane chat={<ChatPane threadId={threadId} />} canvas={<CanvasPlaceholder />} />;
}
