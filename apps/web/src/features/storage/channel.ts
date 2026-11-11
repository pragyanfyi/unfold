// After each committed save or delete, the tab posts `{ conversationId }` so other tabs refresh
// early (ADR 0013). It is only a hint: a tab that misses it still gets the right answer from
// the `nextSeq` and `titleRev` checks. Nothing but the id is sent.
const NAME = "unfold-conversations";

function open(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
}

export function announceChange(conversationId: string) {
  const channel = open();
  channel?.postMessage({ conversationId });
  channel?.close();
}

export function onChangeElsewhere(listener: (conversationId: string) => void): () => void {
  const channel = open();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent) => {
    const id = (event.data as { conversationId?: unknown } | null)?.conversationId;
    if (typeof id === "string") listener(id);
  };
  return () => channel.close();
}
