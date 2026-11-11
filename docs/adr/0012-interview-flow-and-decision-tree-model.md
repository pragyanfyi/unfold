# 12. Interview flow and decision-tree model

- Status: Proposed
- Date: 2026-11-09

## Context

Unfold interviews the user the way the `grilling` skill does. The model maps the idea as a design tree, where every decision branches into the decisions that depend on it. The frontier is every decision whose prerequisites are settled. The model asks the whole frontier in one round, with a recommended answer for each question, then waits for the answers. It repeats until the frontier is empty and the user confirms a shared understanding.

The app has two panes that are always visible side by side:

- a **chat** that reads like a chatbot: the user's message, the model's reasoning, its reply, then a questionnaire form to answer;
- a **canvas** (React Flow) that shows the decision tree.

Both must come from the same data. Local storage (#25), the canvas ADR (#29) and sync (#36) all read it, so it is expensive to change later.

What we checked (TanStack AI docs, read 2026-11-09):

- **Structured output** ([overview](https://tanstack.com/ai/latest/docs/structured-outputs/overview)): `chat({ outputSchema })` is shown with streaming and with tools. The engine validates the final object when the schema is a Standard Schema (Zod, ArkType or Valibot) and a failure ends the stream with `RUN_ERROR`; it does not validate plain JSON Schema. The page does not say which providers support streaming together with `outputSchema`.
- **Tool calls** ([tools](https://tanstack.com/ai/latest/docs/tools/tools), [stream events](https://tanstack.com/ai/latest/docs/chat/stream-events)): `toolDefinition({ name, description, inputSchema })` with `.server()` or `.client()` handlers. Arguments stream as `TOOL_CALL_ARGS` deltas. The docs describe the stream in two different ways and do not say whether deltas are partial JSON. We did not check tool-call support for each provider adapter.
- **Testing** ([fake model](https://tanstack.com/ai/latest/docs/advanced/testing)): `fakeText()` documents scripted text, tool calls, thinking and errors. It does not mention `outputSchema`, so we treat structured-output support in `fakeText()` as unverified (open item in ADR 0011).

## Decision

### The messages are the source of truth; the tree is derived

We store the chat messages. The canvas tree is computed from them by a pure function, `deriveTree(messages)`. There is no second record of the tree to keep in sync, so the chat and the canvas cannot disagree. Local storage and sync save the message list plus a little conversation metadata (`id`, `title`, timestamps).

This also keeps a later feature cheap. Branching a new conversation from a node is the message list cut at that round. That feature is not designed here.

### The interview loop

The interview runs in **rounds**.

1. The user's first message is the idea.
2. Each assistant turn is streamed chat text plus one tool call.
   - `ask_round({ settled, questions })` asks the whole current frontier.
   - `propose_finish({ settled, summary })` says the frontier is empty and gives a closing summary.
3. The questionnaire for a round is how the user answers. They answer every question in the round, then submit.
4. The submitted answers become the result of the `ask_round` call (see Answers), and the next round starts.
5. After `propose_finish` the user confirms or keeps going. Confirming ends the interview and produces the report.

A round never starts until every question in the previous round is answered. A question whose answer depends on another question in the same round belongs to a later round. These rules are in the system prompt, and the app enforces the ones it can check.

We use tool calls rather than `outputSchema` because `fakeText()` documents scripting them, and the chat text still streams. Whether every provider we support handles tool calls well is not verified (see below). The cost is that text and structure arrive separately, and the app pairs them per turn.

### Questions

Each question in `ask_round` has:

- a short `title` and a `body` (may be several paragraphs);
- a canvas `label` of at most about 60 characters;
- 2 to 4 `options`, each with a `label`;
- `parentId`: the settled decision it hangs off (a solid edge on the canvas). The `idea` node counts as settled from the start, with the user's idea as its decision, so the first round hangs off it;
- `dependsOn`: optional ids of other settled decisions it also needs (dashed edges);
- `revisits`: optional id of an `open` question that this question asks again (see Decisions).

Options are shown as A, B, C and so on. **Option A is always the model's recommendation**, so the first option in the list is the recommendation and we store no separate field. Questions are numbered within a round (Q1, Q2, and so on), for display only. Questions are worded so choosing the recommended option means "yes".

### Answers

The questionnaire is a radio group plus a text box for each question. An answer is `{ optionId, text }`. Both are optional, but at least one must be present. So the user can:

- choose an option;
- write only their own text;
- choose an option and add a note, such as "A is the right direction, but I want that part of C too".

Nothing is preselected. "I don't know" is just text: it is stored like any other answer and the model sees it. There is no special case.

Each submitted answer set is the **tool result** of the `ask_round` call it answers, not a user message (decided in #27, see the verified notes below). Its shape is `{ answers: { "1": { optionId, text }, ... } }`, keyed by the question's 1-based number within the round, because positional ids (`r2q1`) come from `deriveTree`, which the chat UI does not run. `optionId` is the option's letter (`"A"`, `"B"`, ...). The same holds for `propose_finish`: the user's reply is its result, `{ confirmed, text }`.

The questionnaire is a stepper, one question at a time. Each step has the radio group, a note box, Back and Next, and the last step submits. Option and note can be combined, so the shadcn `Questionnaire` primitive (where choice and text are mutually exclusive) is not used.

### Decisions

A free-text answer is not a clean decision, so the model writes one. The next `ask_round` or `propose_finish` carries `settled`: for each question answered in the round just received, a short `decision` (a sentence) and a `status` of `settled` or `open`. Until that call arrives, a node that has an answer but no decision shows the raw answer.

`open` is the model's judgement that the answer did not settle the question, for example "I don't know" or "not sure". This adds nothing to the questionnaire or the answer shape; the user just types. An `open` decision cannot be a `parentId` or appear in `dependsOn`, so nothing is built on it. The model may ask about it again in a later round, as a new question with `revisits` set to the open question's id. Each question can be revisited at most once, so revisits form chains (`A` is revisited by `B`, `B` by `C`, and so on) and only the last question in a chain can be revisited again. A chain settles with the decision of its last question: when that question is settled, every earlier question in the chain becomes `settled` with the same decision. While the last question is still `open`, the whole chain stays open. If a question is still open when the interview ends, the report lists it under open questions and the summary says so.

### Ids and the derived tree

Ids come from position, so they are the same every time the tree is derived:

- the root is `idea`;
- question `n` of round `r` is `r{r}q{n}`, for example `r2q1`.

The round number counts valid `ask_round` calls. The model sees these ids in the outline described below and uses them in `parentId`, `dependsOn` and `settled`.

`deriveTree(messages)` produces, for each node:

```ts
type TreeNode = {
  id: string; // "idea", or "r{round}q{n}"
  kind: "idea" | "question";
  round: number; // 0 for the idea node
  parentId: string | null; // null only for the idea node; solid edge
  dependsOn: string[]; // dashed edges
  revisits: string | null; // the open question this one asks again
  label: string; // short canvas title
  title: string | null; // null for the idea node
  body: string | null; // null for the idea node
  options: { id: string; label: string }[]; // options[0] is the recommendation
  answer: { optionId: string | null; text: string | null } | null; // the idea node holds the idea as text
  decision: string | null; // written by the model in the next call
  messageId: string; // chat message that asked it, for #31
  state: "pending" | "answered" | "settled" | "open"; // the idea node is "settled" from the start
};
```

An earlier version of this ADR also listed `askedAt` and `answeredAt`. They were dropped when `deriveTree` was built (#30): an answer is the tool result on the asking message (see Answers), so it has no message of its own to take a time from, and nothing reads either field yet.

There is exactly one `idea` node, created from the first message. The tree's status is `interviewing`, `proposed` (after `propose_finish`) or `finished` (after the user confirms), and the summary comes from `propose_finish`. All of these are derived too.

### What shows where

- **Chat:** everything, in order, including the model's reasoning, shown collapsed. Reasoning is optional because providers differ, and it is stored with the message by the library. It never enters the tree.
- **Canvas:** structure only. A node shows its label and decision, never prose. A new round adds its questions as pending nodes. Submitting answers marks them answered, and the next round's `settled` fills in the decisions.
- **Linking:** clicking a node scrolls the chat to its round (#31).
- **Small screens:** the two panes become tabs.

Layout and visual design of the canvas belong to the canvas ADR (#29).

### Branching

The tree has one `parentId` per node, and a branch is a node with more than one child. A question that needs several decisions sets `parentId` to the one it follows most directly and lists the rest in `dependsOn`. The tree is append-only in this milestone. Users cannot edit it by hand.

### Validation

The app creates ids and rounds and validates every assistant turn. A turn is rejected if:

- it does not contain exactly one tool call (none, or more than one);
- `parentId` or `dependsOn` names an unknown id, or a question that is not settled (unanswered or `open`);
- `settled` does not list every question of the round just answered exactly once (the first call lists none);
- `revisits` names an unknown question, one that is not `open`, or one that already has a revisit;
- a round has no questions, or a question has fewer than two or more than four options.

Rejection works in two ways. A bad tool call gets an error tool result, and when a turn has more than one tool call, none is applied and each gets an error tool result saying only one is allowed. A missing tool call has no call id to attach a result to, so the app instead sends an app-generated correction message, marked as not written by the user. Either way the model gets one retry. If the retry fails, the turn fails with a visible error. `deriveTree` ignores rejected calls and correction messages. The tree is never silently repaired.

The ADR fixes these rules as invariants. The full list of checks is implementation detail and is covered by `deriveTree` and validator unit tests.

### Context sent each turn

The server holds no state. The client sends the chat messages and a compact outline of the tree (id, label, answer, decision, parent, state, revisits) so the model can name earlier ids and see which questions are still `open` and which already have a revisit. The outline is rebuilt each turn from local data and is not logged (ADR 0003).

### The report

When the user confirms the end, the app builds a Markdown report from the derived tree with a fixed template, not by asking the model. It lists the idea, then each round with its questions, the recommendation (option A), the user's answer, the decision, and a marker where the user did not choose A. It has a section for any open questions and ends with the model's summary. Building it in code is deterministic, free and testable. The user can download it as a `.md` file.

### What we leave out of the skill

The skill tells the agent to dispatch sub-agents to look up facts in the environment. Unfold has no files or tools to search, so the model states an assumption in the question or asks the user.

## Consequences

- One data source drives both panes, and storage and sync save the messages plus conversation metadata, and no separate tree.
- Tests script turns with `fakeText()` using `text` plus `toolCalls`, and E2E scripts the same shape in aimock fixtures. `deriveTree` and the report builder are pure functions with plain unit tests.
- Positional ids mean the message list must stay append-only. Reordering or deleting messages would change ids.
- The model must follow the tool protocol. A weak model may break it, so we show the failure rather than guess.
- Settled in #26 (checked 2026-11-09 against `@tanstack/ai` 1.3.0, `@tanstack/ai-client` 1.1.0, `@tanstack/ai-react` 1.0.2, using `fakeText()` and the installed source, not a real provider; tests in `apps/web/src/features/chat/chat-handler.test.ts`):
  - A tool declared **without** `execute` ends the run after the model's tool call: one model call, then `RUN_FINISHED`. A server tool **with** a handler makes the agent loop call the model a second time. So `ask_round` and `propose_finish` have no handler (`features/chat/tools.ts`). No extra round trip.
  - (Superseded by #27, below.) Answers as a user message were thought to work. Sent history ends `assistant (tool call)`, `user`; the library inserts a synthetic tool result between them with `content` and `error` both `"No result provided"`, so the model sees an error-flagged tool result for every round. The alternative, answers as the tool result through `addToolResult`, avoids that. We keep the user message because this ADR decided it, but the synthetic error result is a cost to weigh when the chat is built (#27); it was not tested against a real model.
  - Text streams first (`TEXT_MESSAGE_*`), then the tool call (`TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`). `fakeText()` emits the arguments as one `TOOL_CALL_ARGS` chunk, so how a real provider splits them, and whether the deltas are partial JSON, is **still unverified**.
  - Tool-call reliability of the Anthropic adapter against the real API is **not verified**; nothing here called a model. Other providers are not supported yet.
- Settled in #27 (checked 2026-11-10 against the same versions, with the real chat client and the real route driven by `fakeText()`; tests in `features/chat/answers-as-tool-result.test.ts` and `chat-pane.test.tsx`; no real provider, no browser):
  - **Answers as a user message do not work with the client.** A handler-less server tool ends the run as a client-tool interrupt. While it is pending, `sendMessage` throws "cannot send normal input while pending interrupts exist". `addToolResult` records a result locally but does not continue the run, because the interrupt is not resolvable. #26 only checked the server route's history, which is why it missed this.
  - **What works:** the client declares the same tool (`askRound.client(execute)`) with an `execute` that waits for the user. Resolving it resumes the run with a real tool result, and the model sees no synthetic "No result provided" error. The route must pass `runId`, `parentRunId` and `resume` from the request to `chat()`; without them the interrupt is never bound to the run and cannot be resolved (fixed in #27).
  - A pending round is held in a promise in the browser. A reload loses it, and storage does not keep the library's resume state (ADR 0013), so **an unanswered round cannot be answered after a reload**. #28 must decide this (for example, re-ask the last round).
  - An unanswered `ask_round` ends in tool-call state `input-complete`. Tool arguments are available as parsed `input` only once complete, so the questionnaire cannot render progressively.
  - Reasoning arrives as a `thinking` part with no streaming flag; the UI treats it as running while it is the last part of the streaming message.
  - After a failed run, the library leaves `status` at `error` for a first turn and at `ready` with `error` set for a resumed one. A resumed failure leaves an empty assistant message behind. `reload()` truncates to the last user message, so it must not be used to retry after an answered round; `retryInterrupts()` re-sends the failed resume request. **A resume the user stopped cannot be retried:** `retryInterrupts()` does nothing, and `resumeInterruptsUnsafe()` has no saved resume state to use. So the UI offers Stop only before the first answer, and a conversation that stalls after an answer (for example a reply with no tool call) can only be started over. Fixing this needs a library API or our own stored resume state (#28).
  - shadcn AI Elements (registry read 2026-11-10) imports types from the Vercel `ai` package in `conversation`, `message`, `prompt-input` and `tool`, and its part shapes differ from TanStack's (`text` vs `content`, `reasoning` vs `thinking`, `tool-<name>` vs `tool-call` plus `tool-result`). We did not use it. The chat is built from the shadcn registry set that `shadcn-ui/chatbot-template` uses (`message`, `bubble`, `trace`, `message-scroller`, `empty`, `input-group`, `alert`) plus `@tanstack/ai-react`'s `TextPart` for markdown.
- Not yet verified:
  - Anything against a real provider, or in a browser. The chat UI is tested in jsdom only.
  - How a real provider splits `TOOL_CALL_ARGS` (unchanged from #26).
