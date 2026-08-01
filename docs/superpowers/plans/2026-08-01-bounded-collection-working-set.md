# Bounded Collection Working Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-table Pod Collection hydration with stable Top-100 cursor windows that correctly reconcile ordering changes, paginate on demand, and cap resident memory.

**Architecture:** Add a pure ordered-window engine in `@linx/stores`, then make `createPodCollection` own bounded hydration, cursor pagination, page eviction, subscription reconciliation, and optimistic position rollback. Product modules declare only ordering policies; Contacts reuses its existing remote search for non-resident matches. Chat, Files raw LDP queries, Profile, and small Model Services registries remain outside this migration.

**Tech Stack:** TypeScript 7, TanStack DB, TanStack Query DB Collection, drizzle-solid query conditions, Vitest, xpod integration runtime.

---

## File Structure

- Create `packages/stores/src/ordered-window.ts`: pure stable comparison, cursor, page merge, membership, eviction, and rollback primitives.
- Create `packages/stores/test/ordered-window.test.ts`: deterministic algorithm contract.
- Create `packages/stores/test/bounded-query-sync-perf.test.ts`: 1k/10k IO and resident-size benchmark gate.
- Modify `packages/stores/src/pod-collection.ts`: bounded query, page state, pagination commands, subscription reconciliation, optimistic snapshots.
- Modify `packages/stores/test/pod-collection.test.ts`: shared Pod adapter behavior and request-count contract.
- Modify module Collection declarations under Favorites, Inbox, Contacts, and Symphony to configure Top-100 windows.
- Modify Contacts list/controller tests to prove search uses the remote path when non-empty.
- Modify `apps/web/src/lib/data/pod-collection.integration.test.ts`: real xpod cursor, cache, reorder, and backfill verification.
- Modify `docs/collection-query-model-test-matrix.md` and `docs/data-flow-paradigm-design.md`: mark P7 implemented and record benchmark evidence.

### Task 1: Pure Stable Ordered Window Engine

**Files:**
- Create: `packages/stores/src/ordered-window.ts`
- Create: `packages/stores/test/ordered-window.test.ts`

- [ ] **Step 1: Write failing stable-order and cursor tests**

Cover descending dates, ascending strings, null values, and `id ASC` ties:

```ts
const policy = createOrderedWindowPolicy<Row>({
  limit: 3,
  orderBy: [{ column: 'updatedAt', direction: 'desc' }],
})

expect(policy.sort([sameTimeB, newest, sameTimeA])).toEqual([
  newest,
  sameTimeA,
  sameTimeB,
])
expect(policy.cursorFor(sameTimeA)).toEqual({
  values: [sameTimeA.updatedAt],
  id: sameTimeA.id,
})
```

- [ ] **Step 2: Run tests and verify the missing API failure**

Run: `yarn workspace @linx/stores vitest run test/ordered-window.test.ts`

Expected: FAIL because `ordered-window.ts` does not exist.

- [ ] **Step 3: Implement policy types and deterministic comparison**

Implement these public contracts:

```ts
export type OrderedWindowSort<T> = {
  column: keyof T
  direction: 'asc' | 'desc'
}

export type OrderedWindowOptions<T> = {
  limit: number
  orderBy: OrderedWindowSort<T>[]
  maxResidentPages?: number
}

export type OrderedWindowCursor = {
  values: unknown[]
  id: string
}

export function createOrderedWindowPolicy<T extends { id?: string }>(
  options: OrderedWindowOptions<T>,
): {
  compare(left: T, right: T): number
  sort(rows: T[]): T[]
  cursorFor(row: T): OrderedWindowCursor
  belongsBeforeOrAt(row: T, cursor: OrderedWindowCursor): boolean
}
```

Normalize `Date` to epoch milliseconds, compare strings with `localeCompare`,
put null after concrete values in either direction, and always compare `id ASC`
last.

- [ ] **Step 4: Add membership, page merge, eviction, and rollback tests**

Prove:

```ts
expect(reconcileWindow(top100, newerOutsideRow).entered).toBe(true)
expect(reconcileWindow(top100, newerOutsideRow).evicted).toBe(boundaryRow)
expect(removeAndBackfill(top100, deletedId, nextRow).rows).toHaveLength(100)
expect(restoreWindow(snapshot)).toEqual(originalRows)
expect(evictResidentPages(fourPages, 3).residentRows).toHaveLength(300)
```

- [ ] **Step 5: Implement immutable window operations**

Add `reconcileOrderedWindow`, `removeFromOrderedWindow`,
`captureOrderedWindowSnapshot`, `restoreOrderedWindowSnapshot`, and
`evictOrderedWindowPages`. Keep these functions independent of TanStack and
drizzle-solid.

- [ ] **Step 6: Run the pure contract**

Run: `yarn workspace @linx/stores vitest run test/ordered-window.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the engine**

Commit only the two engine files with a Lore message recording stable `id` ties
and null ordering.

### Task 2: Bounded Initial Hydration And Page API

**Files:**
- Modify: `packages/stores/src/pod-collection.ts`
- Modify: `packages/stores/test/pod-collection.test.ts`

- [ ] **Step 1: Extend the test harness with `limit` and cursor query spies**

Model a chainable query with `orderBy`, `where`, and `limit`, then assert:

```ts
expect(query.limit).toHaveBeenCalledWith(101)
expect(await options.queryFn()).toHaveLength(100)
expect(collection.window.hasNextPage).toBe(true)
```

- [ ] **Step 2: Run the bounded hydration test and verify failure**

Run: `yarn workspace @linx/stores vitest run test/pod-collection.test.ts`

Expected: FAIL because `createPodCollection` has no `window` option.

- [ ] **Step 3: Add the window option and public page state**

Extend `PodCollectionOptions`:

```ts
window?: OrderedWindowOptions<TData>
```

Expose:

```ts
collection.window = {
  hasNextPage: false,
  isLoadingNextPage: false,
  residentPages: 0,
  loadNextPage: async (): Promise<TData[]> => [],
  reset: async (): Promise<void> => {},
}
```

For a bounded first read, issue `limit(window.limit + 1)`, retain only `limit`,
and store the last retained row's composite cursor.

- [ ] **Step 4: Write failing cursor pagination tests**

Assert the second query uses a lexicographic cursor condition equivalent to:

```text
primary < cursor.primary OR
(primary = cursor.primary AND id > cursor.id)
```

Reverse primary comparison for ascending order. Verify page merge deduplicates
by Collection key and never uses offset.

- [ ] **Step 5: Implement `loadNextPage` and three-page LRU residency**

Build drizzle-solid cursor conditions from `and`, `or`, `eq`, `lt`, and `gt`.
Fetch `limit + 1`, merge by canonical key, track page access, and remove the
least-recently-used settled page when `maxResidentPages` is exceeded.

- [ ] **Step 6: Verify bounded request shape**

Run: `yarn workspace @linx/stores vitest run test/pod-collection.test.ts`

Expected: PASS, with no select reading more than 101 rows.

- [ ] **Step 7: Commit bounded hydration**

Commit `pod-collection.ts` and its tests with a Lore message recording why
offset pagination is rejected.

### Task 3: Sorted Subscription And Optimistic Reconciliation

**Files:**
- Modify: `packages/stores/src/pod-collection.ts`
- Modify: `packages/stores/test/pod-collection.test.ts`

- [ ] **Step 1: Write failing remote-membership tests**

Cover these exact transitions:

```ts
await callbacks.onUpdate({ object: outsideRowIri })
expect(collection.toArray[0].id).toBe(outsideRow.id)
expect(collection.toArray).not.toContainEqual(oldBoundary)

await callbacks.onDelete({ object: residentRowIri })
expect(boundaryBackfill).toHaveBeenCalledOnce()
expect(collection.toArray).toHaveLength(100)
```

- [ ] **Step 2: Run tests and verify ordering/membership failures**

Run: `yarn workspace @linx/stores vitest run test/pod-collection.test.ts`

Expected: FAIL because remote upsert only calls `writeUpsert`.

- [ ] **Step 3: Reconcile subscribed rows against the active window**

After exact row projection, call the pure window engine. Apply one coherent
TanStack synced-state update, remove an evicted boundary key, and schedule one
boundary read when a resident row leaves or is deleted.

- [ ] **Step 4: Add burst-coalescing tests**

Deliver 100 create/update events in one microtask burst and assert:

```ts
expect(fullRefetch).not.toHaveBeenCalled()
expect(reconciliationCommits.mock.calls.length).toBeLessThanOrEqual(2)
```

- [ ] **Step 5: Batch remote reconciliation**

Queue resolved remote rows by identity, flush once per microtask, and perform at
most one boundary backfill per Collection flush. Preserve current invalidation
fallback only when exact row resolution or synced-state mutation fails.

- [ ] **Step 6: Add optimistic reorder and exact rollback tests**

Update a resident row's sort key, verify immediate movement, reject persistence,
then assert both original data and original position are restored.

- [ ] **Step 7: Implement optimistic position snapshots**

Capture window state before insert/update/delete, pin pending rows against LRU
eviction, and restore the snapshot on `isPersisted.promise` rejection.

- [ ] **Step 8: Run shared tests and commit**

Run:

```bash
yarn workspace @linx/stores vitest run test/ordered-window.test.ts test/pod-collection.test.ts
yarn workspace @linx/stores build
```

Expected: PASS. Commit the shared reconciliation change.

### Task 4: Migrate Favorites And Inbox

**Files:**
- Modify: `apps/web/src/modules/favorites/data/collections.ts`
- Modify: `apps/web/src/modules/favorites/collections.test.ts`
- Modify: `apps/web/src/modules/inbox/data/collections.ts`
- Modify: Inbox Collection tests under `apps/web/src/modules/inbox/`

- [ ] **Step 1: Write failing module policy tests**

Capture `createPodCollection` options and assert:

```ts
expect(favoriteOptions.window).toEqual({
  limit: 100,
  orderBy: [{ column: 'favoredAt', direction: 'desc' }],
  maxResidentPages: 3,
})
expect(approvalOptions.window.orderBy[0].column).toBe('createdAt')
```

- [ ] **Step 2: Run module tests and verify missing window configuration**

Run:

```bash
yarn workspace @linx/web vitest run src/modules/favorites/collections.test.ts src/modules/inbox
```

Expected: FAIL on `window` assertions.

- [ ] **Step 3: Configure four Inbox windows and Favorites**

Add `window` to each declaration, using `favoredAt DESC` or `createdAt DESC`,
limit 100, and three resident pages. Keep existing `orderBy` temporarily only
if the shared API requires backward compatibility; add a removal assertion once
all modules migrate.

- [ ] **Step 4: Verify filtering derives from bounded live state**

Keep local category/filter operations scoped to resident rows. Add a test that
explicit retry invokes one `fetch({ refetch: true })` and normal render invokes
none.

- [ ] **Step 5: Run and commit**

Run the Task 4 tests plus `yarn workspace @linx/web tsc --noEmit`. Expected:
PASS. Commit Favorites and Inbox together as the first product migration.

### Task 5: Migrate Contacts With Remote Search

**Files:**
- Modify: `apps/web/src/modules/contacts/data/resource-collections.ts`
- Modify: `apps/web/src/modules/contacts/data/collections.ts`
- Modify: `apps/web/src/modules/contacts/features/list/ContactListPane.tsx`
- Modify: `apps/web/src/modules/contacts/features/groups/CreateGroupDialog.tsx`
- Modify: `apps/web/src/modules/contacts/features/detail/useContactGroupMembershipController.ts`
- Modify: corresponding Contacts tests.

- [ ] **Step 1: Write failing Contacts window/search tests**

Assert Contacts config is `name ASC`, limit 100. Seed 150 contacts with the only
search match outside Top-100, enter a search term, and expect `contactOps.search`
to supply that result rather than filtering the resident array alone.

- [ ] **Step 2: Verify the tests fail against current full/local behavior**

Run:

```bash
yarn workspace @linx/web vitest run src/modules/contacts/features/list/ContactListPane.test.tsx src/modules/contacts/data/collections.durability.test.ts
```

Expected: FAIL on bounded config or non-resident search discovery.

- [ ] **Step 3: Configure the Contacts window and lock the Agent exception**

Set Contacts to `name ASC`, limit 100, three pages. Keep Agents fully hydrated as
a small registry alongside Model Services, and add a test asserting that
`agentCollection` has no bounded `window` option. Changing that exception later
requires measured Agent cardinality and a separate product decision.

- [ ] **Step 4: Route non-empty search through the existing remote search owner**

Use the existing `contactOps.search(query)` implementation. Maintain a separate
query identity for search results, debounce input with the existing list timing,
and do not merge search-only rows into the primary working set.

- [ ] **Step 5: Keep group candidate UI on shared resident state**

Group dialogs use the resident Contact Live Query when no search is entered and
the remote search owner when searching. They must not restore React Query
wrappers around `contactOps.getAll()`.

- [ ] **Step 6: Run Contacts tests, architecture tests, and commit**

Run:

```bash
yarn workspace @linx/web vitest run src/modules/contacts
yarn workspace @linx/web tsc --noEmit
```

Expected: PASS. Commit Contacts migration.

### Task 6: Migrate Symphony And Add Central Performance Gates

**Files:**
- Modify: `apps/web/src/modules/symphony/collections.ts`
- Modify: Symphony tests under `apps/web/src/modules/symphony/`
- Create: `packages/stores/test/bounded-query-sync-perf.test.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write failing Symphony policy tests**

Assert all eight Collections declare limit 100, preserve their existing
`updatedAt`/`createdAt DESC` primary ordering, and use three resident pages.

- [ ] **Step 2: Configure Symphony windows and verify snapshot semantics**

Keep `fetchSnapshot({ refetch: true })` as an explicit command over the bounded
windows. Update tests so a snapshot is explicitly a resident control-plane
snapshot, not an entire historical table dump.

- [ ] **Step 3: Write 1k/10k bounded IO benchmark tests**

For both source sizes assert:

```ts
expect(metrics.maxRowsPerSelect).toBeLessThanOrEqual(101)
expect(metrics.initialSelects).toBe(1)
expect(metrics.residentRows).toBeLessThanOrEqual(300)
expect(metrics.fullTableRefetchesAfter100Events).toBe(0)
```

- [ ] **Step 4: Add a benchmark script**

Add:

```json
"benchmark:bounded-collection": "vitest run --config vitest.benchmark.config.ts packages/stores/test/bounded-query-sync-perf.test.ts --disableConsoleIntercept --reporter=verbose"
```

If the Web Vitest root cannot load the stores test, place the command in
`packages/stores/package.json` and invoke it through that workspace instead.

- [ ] **Step 5: Run module and benchmark gates**

Run Symphony tests, stores tests, and the new benchmark. Expected: all count and
resident-size assertions pass for 1k and 10k sources.

- [ ] **Step 6: Commit Symphony and benchmark coverage**

Commit with measured numbers in Lore `Tested` trailers.

### Task 7: Real xpod Integration, Documentation, And Full Verification

**Files:**
- Modify: `apps/web/src/lib/data/pod-collection.integration.test.ts`
- Modify: `docs/collection-query-model-test-matrix.md`
- Modify: `docs/data-flow-paradigm-design.md`

- [ ] **Step 1: Add real xpod bounded-window integration cases**

Create 105 timestamped rows, hydrate Top-100, update a non-resident row to the
newest timestamp, and verify it enters while the old boundary leaves. Delete a
resident row and verify one boundary row backfills. Assert each network query
reads no more than 101 rows.

- [ ] **Step 2: Run the real integration test**

Run:

```bash
yarn workspace @linx/web test:integration:perf run src/lib/data/pod-collection.integration.test.ts
```

Expected: PASS with one initial hydration request, bounded page/backfill reads,
and no full-table refetch after subscription updates.

- [ ] **Step 3: Update architecture and performance documentation**

Mark P7 implemented, record 1k/10k metrics, list module policies, and retain the
explicit Chat/Files/Profile/Model Services exceptions. Update the centralized
test matrix rather than adding repeated generic CRUD tests to each module.

- [ ] **Step 4: Run complete verification**

Run:

```bash
yarn workspace @linx/stores build
yarn workspace @linx/stores vitest run
yarn workspace @linx/web tsc --noEmit
yarn workspace @linx/web vitest run
yarn workspace @linx/web build:check
git diff --check
```

Expected: all tests and builds pass. Existing upstream build warnings about
browser-externalized Node modules and drizzle-solid direct eval may remain, but
no new warning is accepted.

- [ ] **Step 5: Final review and commit**

Review the diff against every requirement in the design spec, verify no
full-table compatibility flag remains without a removal test, then commit docs
and final integration evidence with Lore trailers.
