# Single-WSS Collection Leases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one authenticated multiplexed WSS per active device and bind LinX logical Pod subscriptions to visible Collection consumers instead of application bootstrap.

**Architecture:** xpod owns a device notification gateway with topic registration, bounded queues, resume, and resync. drizzle-solid consumes that optional extension through one session-scoped transport while retaining standard Solid Notifications fallback. LinX Collections acquire reference-counted logical leases from visible module lifecycles; GET/query remains the correctness path.

**Tech Stack:** TypeScript, Node HTTP/WebSocket, Community Solid Server ResourceStore, drizzle-solid, TanStack DB, React, Vitest, Playwright, real private xpod integration.

---

## File Map

### xpod

- Create `src/notifications/DeviceNotificationHub.ts`: connection registry, topic membership, sequence, queue coalescing, resume/resync.
- Create `src/api/handlers/DeviceNotificationTicketHandler.ts`: mint short-lived one-time authenticated connection tickets.
- Create `src/http/DeviceNotificationWebSocketServer.ts`: upgrade, protocol messages, ticket consumption, heartbeat, cleanup.
- Create `src/notifications/DeviceNotificationResourceListener.ts`: bridge ResourceStore changes to the hub.
- Modify `src/storage/ObservableResourceStore.ts`: expose listener registration without duplicate wrapper ownership.
- Modify `src/api/ApiServer.ts` and runtime/container wiring: attach the WebSocket server and listener to the active runtime.
- Create unit and integration tests under `tests/notifications/` and `tests/integration/`.

### drizzle-solid

- Create `src/core/notifications/channels/multiplex-websocket-channel.ts`: one socket, control acknowledgements, topic handlers, reconnect/resume.
- Create `src/core/notifications/multiplex-notifications-client.ts`: discover xpod extension, reference-count logical topics, fallback to standards.
- Modify `src/core/notifications/notifications-client.ts`: delegate to multiplex transport when advertised.
- Modify notification types and PodDatabase lifecycle so `close()` releases the device session.
- Extend unit and CSS/xpod integration tests.

### LinX

- Create `packages/stores/src/collection-subscription-lease.ts`: grace-period reference-counted lease helper.
- Modify `packages/stores/src/pod-collection.ts`: expose an idempotent acquire/release lease and retain existing exact-row reconciliation.
- Create `apps/web/src/lib/data/use-pod-collection-subscription.ts`: React lifecycle adapter.
- Modify module roots for Chat, Files, Favorites, Inbox, Contacts, and Symphony to acquire only while visible.
- Modify `apps/web/src/providers/pod-collections-bootstrap.tsx`: retain initialization and Secretary bootstrap, remove business subscriptions.
- Update unit, integration, and Playwright network assertions.

## Protocol Contract

xpod advertises the extension through a response header or well-known descriptor:

```json
{
  "protocol": "xpod.notifications.v1",
  "ticketEndpoint": "/v1/notifications/tickets",
  "webSocketEndpoint": "/v1/notifications/ws"
}
```

The browser mints a one-time ticket through authenticated fetch. The ticket is passed in `Sec-WebSocket-Protocol`, never in the URL. Control frames are:

```ts
type ClientFrame =
  | { type: 'hello'; protocol: 'xpod.notifications.v1'; resumeFrom?: number }
  | { type: 'register'; requestId: string; topics: string[] }
  | { type: 'unregister'; requestId: string; topics: string[] }
  | { type: 'ack'; sequence: number }

type ServerFrame =
  | { type: 'ready'; connectionId: string; sequence: number }
  | { type: 'registered' | 'unregistered'; requestId: string; topics: string[] }
  | { type: 'event'; sequence: number; eventId: string; topic: string; object?: string; operation: 'create' | 'update' | 'delete' | 'invalidate'; emittedAt: string }
  | { type: 'resync-required'; topics: string[]; reason: 'gap' | 'overflow' | 'expired' }
  | { type: 'error'; requestId?: string; code: string; message: string }
```

## Task 1: Lock The xpod Multiplex Contract

**Files:**
- Create: `/Users/ganlu/develop/xpod/tests/notifications/DeviceNotificationHub.test.ts`
- Create: `/Users/ganlu/develop/xpod/tests/integration/device-notification-websocket.integration.test.ts`
- Create: `/Users/ganlu/develop/xpod/src/notifications/device-notification-protocol.ts`

- [ ] **Step 1: Add protocol type and parser tests**

Cover malformed frames, duplicate request IDs, invalid topic URLs, oversized topic batches, monotonic sequence, and redacted errors. Topic URLs must be same-origin Pod resource URLs authorized by the ticket identity.

- [ ] **Step 2: Run the tests and confirm the gateway is absent**

Run:

```bash
bun run test:run -- tests/notifications/DeviceNotificationHub.test.ts tests/integration/device-notification-websocket.integration.test.ts
```

Expected: failure because protocol and gateway exports do not exist.

- [ ] **Step 3: Implement only protocol parsing and serialization**

Use discriminated unions from the contract above. Reject unknown fields that affect authorization, but tolerate future additive server fields on the client side.

- [ ] **Step 4: Verify protocol tests**

Expected: parser tests pass; integration test remains red.

- [ ] **Step 5: Commit**

Use a Lore commit describing the extension boundary and standard Solid fallback requirement.

## Task 2: Implement The xpod Device Hub And Resource Bridge

**Files:**
- Create: `/Users/ganlu/develop/xpod/src/notifications/DeviceNotificationHub.ts`
- Create: `/Users/ganlu/develop/xpod/src/notifications/DeviceNotificationResourceListener.ts`
- Modify: `/Users/ganlu/develop/xpod/src/storage/ObservableResourceStore.ts`
- Test: `/Users/ganlu/develop/xpod/tests/notifications/DeviceNotificationHub.test.ts`

- [ ] **Step 1: Add failing hub tests**

Prove one connection can register 100 topics, duplicate registration is idempotent, unregister removes only requested memberships, disconnect removes all memberships, matching changes fan out only to authorized members, queue overflow emits one `resync-required`, and slow clients cannot grow memory without bound.

- [ ] **Step 2: Implement a bounded hub**

Use `Map<connectionId, ConnectionState>` and `Map<topic, Set<connectionId>>`. Each connection queue is bounded by count and bytes. Coalesce events by `(topic, object)`; preserve delete over older update. Keep a bounded replay ring keyed by sequence for resume.

- [ ] **Step 3: Bridge ResourceStore events**

Convert `ResourceChangeEvent.path` to canonical resource URL and publish only location metadata. Do not read or broadcast RDF bodies.

- [ ] **Step 4: Run hub and existing store tests**

Run:

```bash
bun run test:run -- tests/notifications/DeviceNotificationHub.test.ts tests/storage/ObservableResourceStore.test.ts
```

- [ ] **Step 5: Commit**

## Task 3: Add Authenticated xpod Ticket And WebSocket Runtime

**Files:**
- Create: `/Users/ganlu/develop/xpod/src/api/handlers/DeviceNotificationTicketHandler.ts`
- Create: `/Users/ganlu/develop/xpod/src/http/DeviceNotificationWebSocketServer.ts`
- Modify: `/Users/ganlu/develop/xpod/src/api/ApiServer.ts`
- Modify: relevant `/Users/ganlu/develop/xpod/src/api/container/` runtime wiring
- Test: `/Users/ganlu/develop/xpod/tests/integration/device-notification-websocket.integration.test.ts`

- [ ] **Step 1: Add failing auth and lifecycle integration tests**

Prove ticket TTL, one-time consumption, identity binding, no token in URL/logs, unauthorized topic rejection, heartbeat cleanup, one socket with 36 topics, resume success, expired replay resync, and identity-switch cleanup.

- [ ] **Step 2: Implement ticket minting and consumption**

Tickets are random, single-use, short-lived server records bound to WebID, Pod origin, and device-session generation. Store only a digest. Validate Read authorization when registering each topic.

- [ ] **Step 3: Attach the WebSocket server**

Use the existing HTTP server upgrade lifecycle. Require `xpod.notifications.v1` plus the one-time ticket subprotocol. Stop must close sockets and clear memberships.

- [ ] **Step 4: Wire ResourceStore listener and well-known discovery**

Both local and cloud runtime configurations must use the same hub contract. Add cross-node delivery adapter only where cloud runs multiple notification nodes; local mode remains in-process.

- [ ] **Step 5: Run integration-lite and notification integration**

```bash
bun run test:run -- tests/integration/device-notification-websocket.integration.test.ts
bun run test:integration:lite
```

- [ ] **Step 6: Commit**

## Task 4: Add drizzle-solid Multiplex Transport With Standards Fallback

**Files:**
- Create: `/Users/ganlu/develop/drizzle-solid/src/core/notifications/channels/multiplex-websocket-channel.ts`
- Create: `/Users/ganlu/develop/drizzle-solid/src/core/notifications/multiplex-notifications-client.ts`
- Modify: `/Users/ganlu/develop/drizzle-solid/src/core/notifications/notifications-client.ts`
- Modify: `/Users/ganlu/develop/drizzle-solid/src/core/notifications/types.ts`
- Modify: `/Users/ganlu/develop/drizzle-solid/src/core/pod-database.ts`
- Test: `/Users/ganlu/develop/drizzle-solid/tests/unit/core/notifications/multiplex-notifications-client.test.ts`

- [ ] **Step 1: Add failing transport tests**

Assert 36 topics construct one WebSocket, same-topic consumers share one register frame, last release sends unregister, reconnect sends resume and current memberships, resync invalidates only active topics, auth/session change closes the old socket, and non-xpod providers retain current WebSocket/SSE behavior.

- [ ] **Step 2: Implement session-scoped multiplex transport**

Key the transport by authenticated database/session identity and endpoint. Maintain topic reference counts and callback sets. Serialize register/unregister until `ready`; reject pending requests on close.

- [ ] **Step 3: Integrate discovery and fallback**

Use xpod multiplex only when explicitly advertised. Never guess the extension from hostname. Standard Solid Notifications remains unchanged for other providers.

- [ ] **Step 4: Add reconnect, resume, and resync handling**

Use exponential backoff with full jitter. On `resync-required`, invoke topic invalidation callbacks rather than hydrating unrelated resources.

- [ ] **Step 5: Verify**

```bash
bun test tests/unit/core/notifications/multiplex-notifications-client.test.ts
bun test tests/unit/core/notifications/notifications-client.test.ts
bun test tests/integration/css/notifications.test.ts
```

- [ ] **Step 6: Commit and publish a new drizzle-solid version**

Push/tag through the repository release workflow, then update LinX to the exact published version. Do not use an unpublished workspace dependency in the LinX release artifact.

## Task 5: Add Shared Collection Lease Semantics In LinX

**Files:**
- Create: `packages/stores/src/collection-subscription-lease.ts`
- Modify: `packages/stores/src/pod-collection.ts`
- Modify: `packages/stores/src/index.ts`
- Test: `packages/stores/test/collection-subscription-lease.test.ts`
- Test: `packages/stores/test/pod-collection.test.ts`

- [ ] **Step 1: Add failing reference-count and grace-period tests**

Test first acquire, concurrent consumers, Strict Mode release/reacquire during grace, last release, DB identity switch, failed connection retry, and idempotent release.

- [ ] **Step 2: Implement the generic lease helper**

The helper owns only lifecycle. It calls the existing Collection `subscribeToPod`, shares in-flight acquisition, delays final release by a short configured grace period, and exposes state for diagnostics.

- [ ] **Step 3: Integrate without changing reconciliation**

Keep exact-row resolution, sorted-window membership, optimistic updates, and query invalidation behavior unchanged.

- [ ] **Step 4: Verify shared stores**

```bash
yarn workspace @linx/stores vitest run test/collection-subscription-lease.test.ts test/pod-collection.test.ts
```

- [ ] **Step 5: Commit**

## Task 6: Move LinX Business Subscriptions To Explicit Module Runtimes

**Files:**
- Create: `apps/web/src/lib/data/use-pod-collection-subscription.ts`
- Create: `apps/web/src/modules/layout/micro-app-runtime.ts`
- Create: `apps/web/src/modules/layout/micro-app-runtime-registry.ts`
- Create: `apps/web/src/modules/layout/use-active-micro-app-runtime.ts`
- Modify: `apps/web/src/providers/pod-collections-bootstrap.tsx`
- Modify: runtime entry points for Chat, Files, Favorites, Inbox, Contacts, and Symphony
- Test: `apps/web/src/providers/pod-collections-bootstrap.test.tsx`
- Create: `apps/web/src/lib/data/use-pod-collection-subscription.test.tsx`

- [ ] **Step 1: Change bootstrap tests first**

Assert Bootstrap initializes Collections and Secretary state but calls no business `subscribeToPod`. Preserve DB-switch cleanup and welcome behavior.

- [ ] **Step 2: Add lease and runtime handoff tests**

Assert repeated consumers share one lease, module activation acquires, handoff aborts and releases the old runtime, late activation completion is released, modules without a runtime do not acquire, and Strict Mode produces one logical registration.

- [ ] **Step 3: Implement explicit runtime activation and the React adapter**

Each data-aware module exports a `MicroAppRuntime.activate()` implementation. The layout coordinator owns handoff and the React hook only bridges the active module id/database identity into that coordinator. It must not expose transport details to components or mix runtime data concerns into the visual registry.

- [ ] **Step 4: Migrate modules incrementally**

Order: Favorites, Inbox, Contacts, Files, Symphony, Chat. After each module, run its existing Collection tests. Files resource invalidation subscription remains URI-scoped and must not become a full-Pod subscription.

- [ ] **Step 5: Remove global subscriptions**

Delete Chat, Files, Favorites, Inbox, and Symphony subscription orchestration and unsubscribe variables from Bootstrap.

- [ ] **Step 6: Verify Web tests and build**

```bash
yarn workspace @linx/web vitest run src/providers/pod-collections-bootstrap.test.tsx src/lib/data/use-pod-collection-subscription.test.tsx src/modules/files
yarn workspace @linx/web build:check
```

- [ ] **Step 7: Commit**

## Task 7: Prove Real Private-Pod Behavior And Capacity

**Files:**
- Create: `tests/e2e/specs/pod-notification-multiplex.spec.ts`
- Create: `/Users/ganlu/develop/xpod/scripts/device-notification-benchmark.ts`
- Update: `docs/pod-subscription-budget-design.md` with measured values

- [ ] **Step 1: Add CDP network assertions**

Log into a real private xpod, mount all relevant modules, register at least 36 topics, and assert exactly one notification WSS. Verify ordinary GET requests complete while the WSS remains open.

- [ ] **Step 2: Add dual-client correctness cases**

Client A observes; client B creates, updates, deletes, and changes an ordering field. Assert active bounded windows update and inactive Collections do not stay resident.

- [ ] **Step 3: Add reconnect and identity cases**

Restart xpod, suspend/resume the browser, expire resume history, and switch accounts. Assert recovery without reload, targeted resync, and zero old-identity memberships.

- [ ] **Step 4: Run a single-node capacity benchmark**

Measure 1,000 and 10,000 idle WSS connections, 1/10/100 topics per connection, event fan-out, slow-consumer overflow, RSS, CPU, event-loop lag, heartbeat bandwidth, reconnect distribution, and cleanup.

- [ ] **Step 5: Run final release gates**

```bash
# drizzle-solid
bun test

# xpod
bun run check:platform-package-version
bun run build
bun run test:run
bun run test:integration:all

# LinX
yarn workspace @linx/stores test
yarn workspace @linx/web test
yarn workspace @linx/web build:check
yarn playwright test tests/e2e/specs/pod-notification-multiplex.spec.ts
```

- [ ] **Step 6: Record evidence and commit**

Do not claim the cost target from estimates. Replace the design document's provisional memory and heartbeat ranges with measured environment, command, sample size, p50/p95/p99, and raw report path.

## Rollback Boundaries

- xpod multiplex endpoint is additive; disabling its discovery advertisement returns clients to standard Solid Notifications.
- drizzle-solid keeps the existing standards transport and can disable multiplex selection independently.
- LinX module leases can fall back to query revalidation without restoring Bootstrap-wide subscriptions.
- No rollback may reintroduce one persistent HTTP stream per Collection on HTTP/1.1.
