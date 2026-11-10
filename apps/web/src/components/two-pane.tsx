import { type ReactNode, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

// The two panes of the app (ADR 0012): chat and canvas. From `md` up they sit side by side.
// Below that they become tabs. There is one DOM tree for both layouts, and an inactive tab is
// hidden, not unmounted, so a streaming reply and the canvas state survive switching tabs or
// resizing the window.
export function TwoPane({ chat, canvas }: { chat: ReactNode; canvas: ReactNode }) {
  const [tab, setTab] = useState("chat");
  return (
    <Tabs value={tab} onValueChange={setTab} className="h-dvh min-h-0 gap-0 md:flex-row">
      <TabsList className="m-2 self-center md:hidden">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="canvas">Canvas</TabsTrigger>
      </TabsList>
      <TabsContent
        value="chat"
        forceMount
        className="min-h-0 data-[state=inactive]:hidden md:flex md:w-[min(32rem,45%)] md:shrink-0 md:flex-col md:border-r md:data-[state=inactive]:flex"
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
