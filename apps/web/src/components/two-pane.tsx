import { type ReactNode, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

// The two panes of the app (ADR 0012): chat and canvas. From `md` up they sit side by side.
// Below that they become tabs. There is one DOM tree for both layouts, and an inactive tab is
// hidden, not unmounted, so a streaming reply and the canvas state survive switching tabs or
// resizing the window.
//
// The open tab can be controlled with `tab` and `onTabChange`, so selecting a node on the
// canvas can show its turn in the chat (#31).
export type PaneTab = "chat" | "canvas";

export function TwoPane({
  chat,
  canvas,
  tab,
  onTabChange,
}: {
  chat: ReactNode;
  canvas: ReactNode;
  tab?: PaneTab;
  onTabChange?: (tab: PaneTab) => void;
}) {
  const [ownTab, setOwnTab] = useState<PaneTab>("chat");
  return (
    <Tabs
      value={tab ?? ownTab}
      onValueChange={(value) => {
        setOwnTab(value as PaneTab);
        onTabChange?.(value as PaneTab);
      }}
      className="h-full min-h-0 gap-0 md:data-horizontal:flex-row"
    >
      <TabsList className="m-2 self-center md:hidden">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="canvas">Canvas</TabsTrigger>
      </TabsList>
      <TabsContent
        value="chat"
        forceMount
        className="min-h-0 data-[state=inactive]:hidden md:flex md:w-[min(32rem,45%)] md:flex-none md:flex-col md:border-r md:data-[state=inactive]:flex"
      >
        {chat}
      </TabsContent>
      <TabsContent
        value="canvas"
        forceMount
        className="min-h-0 data-[state=inactive]:hidden md:block md:min-w-0 md:flex-1 md:data-[state=inactive]:block"
      >
        {canvas}
      </TabsContent>
    </Tabs>
  );
}
