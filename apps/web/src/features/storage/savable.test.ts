import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";
import { savablePrefix, type TurnState } from "./savable";

const user = (id: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", content: "idea" }],
});
const call = (answered: boolean) =>
  ({
    type: "tool-call",
    id: "tc",
    name: "ask_round",
    arguments: "{}",
    state: answered ? "complete" : "input-complete",
    ...(answered ? { output: { answers: {} } } : {}),
  }) as UIMessage["parts"][number];
const round = (id: string, answered: boolean): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", content: "Q" }, call(answered)],
});
const reply = (id: string): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", content: "Bye" }],
});

const ready: TurnState = { status: "ready", blocked: false, finishedId: null };
const ids = (messages: Array<UIMessage>) => messages.map((m) => m.id);

describe("savablePrefix", () => {
  it("holds back the idea until the server has begun to answer", () => {
    expect(savablePrefix([user("u")], { ...ready, status: "submitted" })).toEqual([]);
    expect(ids(savablePrefix([user("u")], { ...ready, status: "streaming" }))).toEqual(["u"]);
  });

  it("saves the idea when the request failed after being sent, not when it was refused", () => {
    const error: TurnState = { status: "error", blocked: false, finishedId: null };
    expect(ids(savablePrefix([user("u")], error))).toEqual(["u"]);
    expect(savablePrefix([user("u")], { ...error, blocked: true })).toEqual([]);
  });

  it("does not save an unanswered round: the answer changes the message", () => {
    expect(ids(savablePrefix([user("u"), round("a", false)], ready))).toEqual(["u"]);
  });

  it("saves a round once answered, even while the next reply is streaming", () => {
    const messages = [user("u"), round("a", true), { ...reply("b"), parts: [] }];
    expect(ids(savablePrefix(messages, { ...ready, status: "streaming" }))).toEqual(["u", "a"]);
  });

  it("never saves a partial reply from a failed or stopped turn", () => {
    const partial = [user("u"), round("a", true), reply("b")];
    expect(ids(savablePrefix(partial, { ...ready, status: "streaming" }))).toEqual(["u", "a"]);
    expect(ids(savablePrefix(partial, { ...ready, status: "error" }))).toEqual(["u", "a"]);
    // Stopped: status is ready, but the library never reported this message as finished.
    expect(ids(savablePrefix(partial, ready))).toEqual(["u", "a"]);
  });

  it("saves the closing reply when the library reports it finished", () => {
    const messages = [user("u"), round("a", true), reply("b")];
    expect(ids(savablePrefix(messages, { ...ready, finishedId: "b" }))).toEqual(["u", "a", "b"]);
  });

  it("stops at the first message that is not final, even if later ones look final", () => {
    const messages = [user("u"), round("a", false), user("u2")];
    expect(ids(savablePrefix(messages, ready))).toEqual(["u"]);
  });

  it("never includes an empty assistant message", () => {
    const empty: UIMessage = { id: "e", role: "assistant", parts: [] };
    expect(ids(savablePrefix([user("u"), empty], { ...ready, status: "streaming" }))).toEqual([
      "u",
    ]);
  });
});
