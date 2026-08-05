# Deferred Collection Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix F17, F9, F11, F10, and F12 without expanding subscription count, losing resident windows, swallowing Pod failures, or persisting unsafe/incorrect collection state.

**Architecture:** Stabilize observable error and window semantics first. Then remove Chat N+1 hydration, introduce scope-aware parameterized thread/message queries while sharing one resource subscription, and finally persist only confirmed first-window snapshots through an opt-in IndexedDB adapter.

**Tech Stack:** TypeScript, React, TanStack DB/Query, drizzle-solid, IndexedDB, Vitest, self-bootstrapped xpod integration tests, Playwright/CDP e2e.

---

### Task 1: Preserve collection errors through hooks and panes

**Files:**
- Create: `apps/web/src/components/collection/CollectionErrorPane.tsx`
- Modify: `apps/web/src/modules/chat/data/collections.ts`
- Modify: `apps/web/src/modules/inbox/data/collections.ts`
- Modify: `apps/web/src/modules/chat/components/ChatListPane.tsx`
- Modify: `apps/web/src/modules/inbox/components/__tests__/InboxListPane.test.tsx`
- Test: `apps/web/src/modules/chat/components/ChatListPane.test.tsx`
- Test: `apps/web/src/modules/inbox/collections.test.ts`
- Test: `apps/web/src/lib/data/live-query-contract.test.tsx`

- [ ] Add a failing live-query contract test where queryFn throws `new Error('pod unavailable')` and assert `isError === true` plus the original `error`.
- [ ] Run `yarn workspace @linx/web vitest run src/lib/data/live-query-contract.test.tsx` and confirm the new assertion fails only if stores actually swallows the error.
- [ ] Add failing Chat/Inbox tests asserting hook errors are not replaced with `null`, cached rows remain visible during refetch failure, and empty/error states are distinct.
- [ ] Remove `error: null` from `useChatList`, `useThreadList`, `useThreadIndex`, and `useMessageList`; aggregate the first non-null Inbox query error.
- [ ] Add a pure `CollectionErrorPane({ error, onRetry })` and wire only panes proven by failing tests; keep cached content visible for background failures.
- [ ] Run the focused Chat/Inbox/live-query tests and `yarn workspace @linx/web build:check`.

### Task 2: Rebuild resident windows atomically on refetch

**Files:**
- Modify: `packages/stores/src/pod-collection.ts`
- Test: `packages/stores/test/pod-collection.test.ts`
- Test: `packages/stores/test/bounded-query-sync-perf.test.ts`

- [ ] Add failing tests for a five-page resident window: refetch retains five pages, refreshes row values, preserves `nextCursor`, and never exceeds `maxResidentPages`.
- [ ] Add a failing test where rebuilding page three throws and the pre-refetch collection rows remain intact.
- [ ] Extract a local `fetchResidentWindow(db, pageCount)` that accumulates pages and metadata without writing collection state.
- [ ] Make `fetchRows` capture the previous resident page count, fetch the bounded replacement locally, update page metadata only after all requests succeed, and return flattened rows once.
- [ ] Run `yarn workspace @linx/stores build` and the two focused store tests; record SELECT count to prevent accidental N+1 beyond the resident page count.

### Task 3: Deduplicate Chat document hydration

**Files:**
- Create: `apps/web/src/modules/chat/data/chat-hydration-cache.ts`
- Modify: `apps/web/src/modules/chat/data/collections.ts`
- Test: `apps/web/src/modules/chat/collections.query-scope.test.ts`
- Test: `apps/web/src/modules/chat/collections.integration.test.ts`

- [ ] Add failing tests proving repeated hydration in one database scope performs zero additional GETs, adding one chat performs one GET, and switching scope with the same short id does not reuse cached participants.
- [ ] Implement a bounded LRU keyed by opaque database scope plus canonical chat resource IRI; cache participants and hydrated metadata.
- [ ] Invalidate before transforming an updated chat row, clear the old scope on database rebind, and invalidate explicit participants/memberRoles mutations.
- [ ] Add an inactive-subscription test that performs one conditional revalidation rather than accepting indefinitely stale data.
- [ ] Run focused Chat tests and capture GET counts for stable and changed lists.

### Task 4: Parameterize thread/message queries without multiplying subscriptions

**Files:**
- Modify: `packages/stores/src/pod-collection.ts`
- Create: `apps/web/src/modules/chat/data/parameterized-chat-collections.ts`
- Modify: `apps/web/src/modules/chat/data/collections.ts`
- Test: `packages/stores/test/pod-collection.test.ts`
- Test: `apps/web/src/modules/chat/collections.integration.test.ts`
- Test: `apps/web/src/modules/chat/collections.query-scope.test.ts`

- [ ] Add a failing real-xpod integration test proving relation filters compare full IRIs and generated SELECTs return only the requested chat/thread.
- [ ] Add a typed collection `filter` option that composes with cursor predicates using `and`, without embedding Chat-specific semantics in stores.
- [ ] Add failing instance-pool tests for scope-aware keys, ref counts, LRU eviction of inactive instances, in-flight cancellation, and disposal.
- [ ] Implement `threadCollectionFor(chatId)` and `messageCollectionFor(threadId)` with parameterized query keys and bounded windows.
- [ ] Configure message initial query as latest 50 descending, project rows ascending for display, and load older pages backward; retain a separate bounded thread index.
- [ ] Route one shared resource subscription into active instances; assert visiting 20 threads leaves logical subscription/channel count constant.
- [ ] Migrate mutation invalidation keys and hooks, then run Chat integration/e2e tests and record rows read plus p50/p95 cold-start latency.

### Task 5: Persist confirmed first-window snapshots safely

**Files:**
- Create: `packages/stores/src/collection-snapshot-persister.ts`
- Create: `packages/stores/test/collection-snapshot-persister.test.ts`
- Modify: `packages/stores/src/pod-collection.ts`
- Modify: `packages/stores/src/index.ts`
- Test: `packages/stores/test/pod-collection.test.ts`
- Test: `apps/web/src/lib/data/pod-collection.integration.test.ts`

- [ ] Add failing adapter tests for canonical query keys, version mismatch, TTL, byte-budget LRU, scope isolation, row codec round-trip, and awaited scope clear.
- [ ] Implement the minimal IndexedDB adapter with an injectable in-memory backend for deterministic store tests; do not add a package dependency.
- [ ] Add failing collection tests for atomic rows/window/cursor restoration, `snapshotState`, stale revalidation, and exclusion of pending optimistic mutations.
- [ ] Add opt-in `persister`, `scopeKey`, and row codec options to `createPodCollection`; restore rows and first-window metadata in one batch before explicit revalidation.
- [ ] Enable snapshots incrementally for favorites, contacts, inbox, chat, and parameterized thread/message collections; exclude credentials, tokens, secrets, and raw private file bodies.
- [ ] Run self-bootstrapped xpod e2e for online cold start, offline restart, account switch, logout clear, and stale revalidation error; report snapshot-visible p50/p95 with p95 below 100ms locally.

### Task 6: Full verification and documentation closure

**Files:**
- Modify: `docs/pod-subscription-budget-design.md`
- Modify: `docs/collection-query-model-test-matrix.md`
- Modify: the five specs under `docs/design/`

- [ ] Run all focused store/web integration suites, then `yarn workspace @linx/web build:check`, `yarn workspace @linx/service build`, and desktop build.
- [ ] Run the real Pod collection integration suite with performance logging and the notification-channel CDP walkthrough.
- [ ] Record measured request counts, SELECT rows, resident pages, channel count, snapshot bytes, p50/p95, and raw report path; do not replace measurements with estimates.
- [ ] Mark each spec Implemented only when its named tests and runtime evidence pass; leave any unmet item explicitly open.
- [ ] Commit implementation slices with Lore trailers and push only after the full verification gate succeeds.
