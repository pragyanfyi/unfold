# 15. Convex as the backend, end to end

- Status: Proposed
- Date: 2026-11-17
- Supersedes: ADR 0009 (D1 and Drizzle), ADR 0010 (no KV), ADR 0013 (local-first storage)
- Amends: ADR 0003, 0005, 0011 and 0012 (see Changes to earlier ADRs)

## Context

The plan was Cloudflare D1 for data (ADR 0009), Better Auth for accounts (ADR 0008), and conversations kept in the browser (ADR 0013), synced to D1 later (#36). Sync was the hardest open problem on the roadmap: ADR 0013 lists conflicts between devices that append offline, deletions that reappear on the next pull, which local conversations belong to which account, and merging titles.

The maintainer decided on 2026-11-17 to use Convex for the whole backend instead, to drop browser storage, and to require Google sign-up before the first chat (ADR 0016). No one uses the app yet, so nothing needs migrating.

What we checked (all read 2026-11-17):

- **Limits** ([Convex, "Limits"](https://docs.convex.dev/production/state/limits)): documents up to 1 MiB; function arguments and return values up to 16 MiB (Node actions: arguments up to 5 MiB); queries and mutations 1 second of user code; actions 30 minutes in the Convex runtime with 64 MiB of memory, 10 minutes in the Node runtime with 512 MiB. "Subscription updates" count as function calls. Each action keeps at most 1,024 log lines.
- **HTTP actions** ([Convex, "HTTP Actions"](https://docs.convex.dev/functions/http-actions)): a response body can be a `ReadableStream` (the page recommends it for large responses; it shows no streaming example and does not mention server-sent events). Responses up to 100 MiB. HTTP actions are not retried. CORS is the handler's job. The page does not say which time limit applies to HTTP actions, or whether one keeps running after the client disconnects.
- **Logs** ([dashboard logs](https://docs.convex.dev/dashboard/deployments/logs), [log streams](https://docs.convex.dev/production/integrations/log-streams)): the dashboard shows a function's log lines and exceptions. The log stream schema records the _size_ of a function's arguments, "Absent for HTTP actions", and has no field for HTTP headers or bodies. Neither page says argument contents are logged, nor that anything is redacted.
- **TanStack Start** ([Convex, "TanStack Start"](https://docs.convex.dev/client/react/tanstack-start)): the recommended integration is through TanStack Query (`@tanstack/react-query` 5.102.0 or later); `useSuspenseQuery` renders on the server and the browser resumes live subscriptions. The page notes TanStack Start "is in Release Candidate". Server-side auth guides exist for Clerk and WorkOS only.
- **Regions** ([Convex, "Regions"](https://docs.convex.dev/production/regions)): `aws-us-east-1` at standard price; Ireland, Sydney and Canada at a 30% surcharge. "An existing deployment's region cannot be changed."
- **Pricing**: see Cost below.

## Decision

Built so far: the Convex project and deploy (#35), accounts (#34, ADR 0016) and storage (#74, see "Built in #74" below). Not built yet: the chat move (#75), with the turn document and run ownership. Until it ships, the model call runs on the Worker as ADR 0003 describes, and the parts below marked "planned" describe the design it will build.

### What runs where

- **Convex** holds all application data and all server logic: ideas and messages, accounts (ADR 0016), and the model call that runs the interview.
- **Cloudflare Workers** keeps serving the TanStack Start app: server-rendered pages and static assets, as today (ADR 0005). It has no API routes, no database and no secrets of its own once the chat route has moved. Convex does not host TanStack Start's server rendering.
- The browser talks to Convex directly, through Convex's TanStack Query integration.

### Content-Security-Policy

Today `connect-src` is `'self'` (`features/security/csp.ts`), and `docs/internals/byok-and-secrets.md` forbids adding a host. `connect-src` restricts the URLs that script interfaces such as `fetch` and `WebSocket` can load ([CSP Level 3](https://www.w3.org/TR/CSP3/#directive-connect-src), read 2026-11-17). It does not restrict top-level navigation, so an injected script that can read a key could still send it elsewhere in a navigation URL. The policy narrows where a key can go; preventing script injection (ADR 0003, rule 5) remains the main defence. Convex is a different origin, so the browser cannot reach it under the current policy.

- **Decision: allow exactly our own Convex deployment, nothing else.** `connect-src` will list `'self'` plus that deployment's two origins: its client URL (`https://` and `wss://` on `<deployment>.convex.cloud`, for queries, mutations and live updates) and its HTTP actions URL (`https://<deployment>.convex.site`, where the key goes). The names come from build configuration. No wildcard such as `*.convex.cloud`, which would let a script send a key to someone else's Convex deployment.
- The rule's purpose stays the same: the page's connections, and so the key's documented path, go only to our own backend, now running on Convex, and from there only to the provider the user chose.
- **Rejected: proxying Convex through the Worker.** Live updates use a WebSocket, so the Worker would carry every sync message and return as a moving part, which is what this ADR removes.
- The CSP change lands with the first PR that connects the browser to Convex (#35), together with every description of the policy: the rule in `docs/internals/byok-and-secrets.md` and the CSP sentence in `.github/SECURITY.md` ("connections only to our own origin"), so no document describes a policy the code no longer has. The description of where the key goes (ADR 0003 and the key section of `SECURITY.md`) changes later, with the chat move, because that is when the key starts going to Convex.

### No browser storage of conversations

IndexedDB storage (ADR 0013) is removed, with `idb`, `fake-indexeddb`, the BroadcastChannel hint and the `persist()` notice. Data already in browsers is dropped without a notice (no users yet). There is no offline mode: every turn needs the model API anyway. Provider keys stay in the browser exactly as ADR 0003 describes; that store is unrelated.

### Data model

- One document per **idea** (the conversation: owner, title, status, timestamps) and one per **message**, keyed by idea and `seq`. One message per document keeps each well under the 1 MiB limit, which a whole conversation in one document could outgrow.
- ADR 0012 still holds: messages are the source of truth, the tree is derived by `deriveTree`, `seq` is the only order, and messages are append-only. The `nextSeq` and `titleRev` checks of ADR 0013 become checks inside Convex mutations, which run as transactions.
- **Only final messages become message documents.** The finality rule of ADR 0013 and its #28 notes stays: a message is final when it will no longer change. That means user messages, assistant messages whose tool calls all have an answer (the answer is stored with the message, ADR 0012), and a closing reply once its run has finished. The savable-prefix logic decides this, as it does today.
- **Everything not yet final lives in one turn document per idea.** This covers a reply that is still streaming, and a round or finish proposal waiting for the user's answer. Message documents are never edited; a message moves from the turn document to a message document only by being appended at `seq = nextSeq …` in the same mutation that clears the turn document. That happens:
  - when the user answers a round or finish proposal (the answered message becomes final);
  - when a run ends with a closing reply that needs no answer, in the mutation that ends the run.

  A failed or stopped run is never appended.
- **One run per idea, owned by a run id (planned).** A turn document will have one of three statuses: `running` (the action is streaming), `waiting` (the run ended with a round or finish proposal that needs the user's answer) and `interrupted`. Starting a run will be a mutation that writes a new run id, `running` and a last-write time.
  - **Batch writes and the end-of-run mutation** will require the same run id **and** `running`, in the same transaction. A run that resumes after its turn was marked `interrupted`, or after another run took over, is rejected and writes nothing. The end-of-run mutation either appends a closing reply and clears the turn, or sets `waiting`.
  - **The answer mutation** will require `waiting` and the run id the user is answering, and check `nextSeq` where it appends.
  - A new run will be allowed to start only when there is no turn, or the turn is `interrupted`; a second tab or a Try again cannot start one while another run owns the turn.
- **Marking a run interrupted will not rely on the action (planned).** If the action fails or is stopped, it will mark the turn `interrupted` itself, with the same guard as its other writes (its own run id and `running`), so a failing stale run cannot interrupt a newer run's turn. If it dies without doing so, a scheduled check will. The start mutation will schedule a check mutation, with only the idea id and run id as arguments, never the key. When it runs:
  - if another run owns the turn, or the turn is no longer `running`, it does nothing and does not reschedule;
  - if the same run owns the turn and has not written for a set time, it marks the turn `interrupted`;
  - otherwise the run is still active, and it schedules itself again for the set time after the run's last write.

  So a live run always has one pending check, and a run that dies is marked within about the set time after its last write. The time will be chosen when this is built, above the longest normal gap between batches. Try again will be offered only for an `interrupted` turn, and will replace it with a new run.
- Documents hold only what the app needs. Provider keys never appear in any document, argument or log (ADR 0003).
- Schema changes are backward compatible, as ADR 0009 required for D1: add a field before code uses it, migrate data, then remove the old field only when nothing reads it, because the previous release's code may run against the new schema during a deploy.

### The interview runs in Convex

- The model call moves from `routes/api/chat.ts` to a **Convex HTTP action** that streams the reply to the browser, as the Worker route does today.
- **The key arrives in a request header, never as a function argument.** An argument to a scheduled function is stored in Convex until the job runs, and an ordinary argument is a value we would have to keep out of every log and error by hand. The log stream schema has no field for HTTP headers. So the browser calls the HTTP action with the key in the `x-byok-<provider>` header, and the action never passes the key to `ctx.scheduler`, `ctx.runMutation`, `ctx.runAction` or a log line.
- The action checks that the caller is signed in and owns the idea before calling the model, and writes the reply to the idea's turn document (see Data model) as it streams, in batches rather than per token.
- Every rule in `docs/internals/byok-and-secrets.md` carries over: the safe logger, the library logger override, fixed error strings, scrubbed `RUN_ERROR` chunks, the sentinel key test and the lint rules. ADR 0003 and `SECURITY.md` are updated in the PR that moves the route.

### Where the code lives

Decided on 2026-11-18, while building #35. The Convex functions and schema live in their own workspace package, **`packages/backend`** (`@unfold/backend`, with its `convex/` folder), not inside `apps/web`.

- A native app (Expo) is planned. The decision is that every app uses **one shared backend package and the same production deployment**, so an idea started on one device is there on the other, and every app depends on `@unfold/backend` for the generated API and types. A `convex/` folder per app would mean two sets of schema and functions to keep in step. Each `convex deploy` pushes one folder's "functions, indexes, and schema" to the deployment chosen by the deploy key ([Convex, "`npx convex deploy`"](https://docs.convex.dev/cli/reference/deploy), read 2026-11-18), so two folders would either need two deployments, and so two databases, or take turns overwriting one deployment's schema.
- It is a package rather than an app because it has no pages; it is deployed with the Convex CLI from its own folder. Convex's monorepo template has the same layout: "`apps/web`", "`apps/native` - the Expo native app" and "`packages/backend` - the Convex backend and generated API types" ([get-convex/turbo-expo-nextjs-clerk-convex-monorepo](https://github.com/get-convex/turbo-expo-nextjs-clerk-convex-monorepo), README, read 2026-11-18).
- This is an exception to the rule that a package waits for a second consumer (`AGENTS.md`): the backend is not shared helper code, and moving it after the auth, storage and chat moves would touch every import, the CI check and the deploy.
- Rejected: `apps/web/convex` now and a move later (the cost above), and `apps/convex` (works, but less common for code other apps import).

### Deployment

- One production Convex deployment, in **`aws-us-east-1`** (standard price; the region cannot be changed later), plus one development deployment per developer or a local backend.
- On release, Convex functions deploy **before** the Worker, so new pages never call functions that do not exist yet. The deploy key is a secret in the `production` GitHub environment, set by the maintainer, never in chat.

## Cost

Read 2026-11-17 from [Convex pricing](https://www.convex.dev/pricing), its [FAQ](https://www.convex.dev/pricing/faq), and [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

|             | Free                                                                                                                                                                                                                                                                                      | Paid                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Convex**  | Free & Starter: 1M function calls, 20 GB-hours of action compute, 0.5 GB database storage, 1 GB database I/O, 1 GB file storage and 1 GB egress per month. Query and mutation compute is free. Free has hard caps; Starter pays per use above them (for example $2.20 per extra 1M calls) | Professional: $25 per developer per month, with 25M calls, 250 GB-hours, 50 GB storage and 50 GB I/O |
| **Workers** | 100,000 requests per day, 10 ms CPU per invocation, no charge for duration                                                                                                                                                                                                                | $5 per month minimum: 10M requests and 30M CPU-ms included, then $0.30 per extra million requests    |

- On the Free plan, after a limit is hit "new mutations that attempt to commit more insertions or updates may fail", and the FAQ says the deployment "may return HTTP errors" if a limit is exceeded "for an extended period of time". Notification emails come first.
- Action compute is memory multiplied by time (implied by the log stream docs). Whether the time is wall-clock or CPU time is not stated. If it is wall-clock, a streamed reply that waits on the model is billed for the whole wait.
- Every reply costs function calls three ways: the action itself, the mutations that write the turn document in batches, and the live query that re-runs for each open tab after each batch. **Not measured yet.** The PR that moves the chat measures one reply and records it here.
- After the move, Workers only serves pages, so it stays well inside its free plan.

### Built in #74 (storage)

Recorded on 2026-11-19, while building the storage move.

- **Ideas keep their browser-made id.** An idea has a `clientId` (the UUIDv7 the browser already makes) with its own index, and addresses stay `/c/<clientId>`. The screen gives a new idea its address on the first save without remounting the chat, which needs the id before the save returns; a Convex `_id` would arrive only after it.
- **A message is stored as JSON text** (`message: v.string()`), not as a Convex object. A `UIMessage` can hold a `Date` and keys that Convex does not allow as field names. The append mutation checks that each one parses, has an `id`, a known `role` and `parts`, and is at most 512 KiB.
- **The turn document waits for #75.** While the chat runs on the Worker, the server never holds a message that is not final: the browser keeps it, as before. The turn document, run ids and statuses are built with the HTTP action that writes them.
- **The list of ideas is a live query** through `@convex-dev/react-query`, so a change in another tab or on another device shows up without the BroadcastChannel hint. One-off reads and writes go through the existing `ConversationStore` seam.
- **An idea holds at most 8 MiB of messages** (`MAX_IDEA_BYTES`, tracked in `ideas.bytes`). `load` returns every message and `remove` reads every message, each in one call, and Convex caps a call at 16 MiB read and returned; the cap keeps both possible for any idea. An interview is a few hundred KiB, so the cap is thousands of turns. A save past it is refused, and the app says the conversation is not saved. Paging both reads would remove the cap, if ideas ever need to be larger. One write carries at most 100 messages; the browser splits a longer queue.
- `ownerId` became `v.id("users")` and `message` became a string. Neither is backward compatible in general, but no function had written either table, so no document existed to break.

## Changes to earlier ADRs

ADRs are immutable (ADR 0001); these notes record what changes and where.

- **ADR 0003 (BYOK):** once the chat move ships, the documented hop will be Unfold's Convex HTTP action instead of the Worker route. The rules stay; rule 1 will read "never written to a Convex document, a function argument, a log …". Until then ADR 0003 and `SECURITY.md` describe the Worker route, which is what the code does. Both are updated in detail by the chat move.
- **ADR 0005 (deployment):** adds the Convex deploy before the Worker deploy, and a Convex deploy key. The post-deploy smoke test stays.
- **ADR 0008 (Better Auth):** superseded. ADR 0016 replaces it: Convex Auth v2 with Google, required before the first chat. Two parts of ADR 0008 still hold: Google is the sign-up method, and provider keys are never stored by the server.
- **ADR 0011 (testing):** item 3 becomes "the production build with a local Convex backend, no Convex or Cloudflare account". Item 10 (how E2E signs in) is settled by the auth spike (#33) and recorded in ADR 0016.
- **ADR 0012 (interview model):** unchanged, except that "local storage and sync" means Convex.

## Consequences

- Sync, conflict handling, tombstones and per-browser ownership (ADR 0013, "Open for #36") are no longer problems: there is one copy, and Convex pushes changes to every open tab and device.
- Once this is built, a reload will no longer lose a round waiting for an answer, or the part of a reply already written to the turn document; ADR 0013 loses both. Whether an HTTP action keeps running after the browser disconnects is **not verified**. If it stops, the turn document will keep what was written up to the last batch until it is marked `interrupted` (by the action, or by the scheduled check), and the user will press Try again, which replaces it with a new run. A partial reply is never appended as a message.
- Conversations are stored on our server, tied to the user's account. The privacy note and `SECURITY.md` must say so before this ships.
- Once the chat move ships, provider keys will pass through Convex instead of Cloudflare. Users will have to trust that our Convex functions do not log them; self-hosting stays possible.
- The IndexedDB work from #28 is removed. The interview logic, `deriveTree`, the savable-prefix logic, the canvas and the UI stay.
- Development needs a Convex backend: `pnpm dev` runs alongside it (documented in `docs/operations/development.md` when it lands). CI needs one too, local and without secrets.
- One more vendor and one more deploy step. A Convex outage takes the whole app down except static pages.
- Not yet verified:
  - TanStack AI's server `chat()` running inside a Convex HTTP action (Convex runtime or Node runtime), and streaming its output as a `ReadableStream`;
  - whether an HTTP action outlives the client's disconnect, and its time limit;
  - whether action compute is billed on wall-clock time;
  - the real function-call cost of one reply;
  - running a local Convex backend in CI and E2E, and reaching aimock from it;
  - the TanStack Query integration under TanStack Start's current version.
