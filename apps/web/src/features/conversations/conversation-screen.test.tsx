// @vitest-environment jsdom
import type { UIMessage } from "@tanstack/ai-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationStore } from "#/features/storage/store";
import { uuidv7 } from "#/features/storage/uuid";
import { ConversationScreen } from "./conversation-screen";

// The screen's wiring: which conversation is shown, and what happens around the first save.
// The chat itself is a stub, and storage is a fake we control, so timing is explicit.

const mounts: Array<string> = [];
vi.mock("#/features/chat/chat-pane", () => ({
  ChatPane: ({
    threadId,
    initialMessages,
    onSavable,
  }: {
    threadId: string;
    initialMessages?: Array<UIMessage>;
    onSavable?: (messages: Array<UIMessage>) => void;
  }) => {
    useEffect(() => {
      mounts.push(threadId);
    }, [threadId]);
    return (
      <div>
        <div data-testid="pane">{`${threadId}|${initialMessages?.length ?? 0}`}</div>
        <button
          type="button"
          onClick={() =>
            onSavable?.([{ id: "m1", role: "user", parts: [{ type: "text", content: "An idea" }] }])
          }
        >
          save idea
        </button>
      </div>
    );
  },
}));

const store = {
  list: vi.fn(),
  load: vi.fn(),
  create: vi.fn(),
  append: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
} satisfies Record<keyof ConversationStore, unknown>;
vi.mock("#/features/storage/store-instance", () => ({ getConversationStore: () => store }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const record = (id: string) => ({
  id,
  title: "An idea",
  schemaVersion: 1,
  nextSeq: 1,
  createdAt: "2026-01-01T00:00:00Z",
  titleRev: 0,
  updatedAt: "2026-01-01T00:00:00Z",
});

function renderAt(path: string) {
  const root = createRootRoute();
  const layout = createRoute({
    getParentRoute: () => root,
    id: "_app",
    component: ConversationScreen,
  });
  const index = createRoute({ getParentRoute: () => layout, path: "/", component: () => null });
  const saved = createRoute({
    getParentRoute: () => layout,
    path: "/c/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([layout.addChildren([index, saved])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  mounts.length = 0;
  for (const fn of Object.values(store)) fn.mockReset();
  store.list.mockResolvedValue([]);
  store.create.mockResolvedValue({});
  const noop = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal("ResizeObserver", noop);
  vi.stubGlobal("IntersectionObserver", noop);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const paneText = async () => (await screen.findByTestId("pane")).textContent ?? "";

describe("a new idea", () => {
  it("gets its address on the first save without remounting the chat", async () => {
    const router = renderAt("/");
    const threadId = (await paneText()).split("|")[0];
    fireEvent.click(screen.getByRole("button", { name: "save idea" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${threadId}`));
    expect((await paneText()).split("|")[0]).toBe(threadId);
    // One mount: a remount would have cut a reply in flight.
    expect(mounts).toEqual([threadId]);
  });

  it("does not take over the screen when the user left before the first save finished", async () => {
    const write = deferred<object>();
    store.create.mockReturnValue(write.promise);
    const router = renderAt("/");
    const first = (await paneText()).split("|")[0];
    fireEvent.click(screen.getByRole("button", { name: "save idea" }));
    await waitFor(() => expect(store.create).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "New idea" }));
    await waitFor(async () => expect((await paneText()).split("|")[0]).not.toBe(first));
    const second = (await paneText()).split("|")[0];

    const listReads = store.list.mock.calls.length;
    write.resolve({});
    // The save finishing refreshes the list, so this is after the save callback ran.
    await waitFor(() => expect(store.list.mock.calls.length).toBeGreaterThan(listReads));
    expect(router.state.location.pathname).toBe("/");
    expect((await paneText()).split("|")[0]).toBe(second);
  });
});

describe("a saved idea", () => {
  it("loads it and hands its messages to the chat", async () => {
    const id = uuidv7();
    store.load.mockResolvedValue({
      record: record(id),
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", content: "An idea" }] }],
    });
    renderAt(`/c/${id}`);
    expect(await paneText()).toBe(`${id}|1`);
  });

  it("says so when there is no such idea, and does not create one", async () => {
    store.load.mockResolvedValue(null);
    renderAt(`/c/${uuidv7()}`);
    expect(await screen.findByText("Idea not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("offers to read it again when reading failed", async () => {
    const id = uuidv7();
    store.load.mockRejectedValueOnce(new Error("unavailable"));
    store.load.mockResolvedValue({ record: record(id), messages: [] });
    renderAt(`/c/${id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await paneText()).toBe(`${id}|0`);
  });
});
