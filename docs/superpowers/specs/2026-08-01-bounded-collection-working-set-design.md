# Bounded Collection Working Set Design

## Status

- Date: 2026-08-01
- Scope: Web table Collections except Chat
- Decision: Maintain a stable Top-100 working set instead of hydrating entire Pod tables

## Problem

The current table Collection query loads every matching row into TanStack DB on
first use. Multiple consumers share that hydration, but the hydrated state can
still grow into a local copy of the entire table. This causes unbounded network,
RDF parsing, memory, and reactive recomputation costs.

Incremental `writeUpsert` is also insufficient for a bounded sorted result. A
change to `updatedAt`, `favoredAt`, `createdAt`, `name`, or another ordering
field can move a row into, out of, or within the active window.

## Goals

- Initial hydration reads at most 100 rows per bounded Collection.
- Multiple consumers share one working set and one initial hydration.
- Local and remote updates preserve stable sorted-window membership.
- Pagination does not require retaining every previously visited row forever.
- Search can find rows outside the active working set.
- Optimistic updates reorder immediately and restore exactly on failure.

## Non-goals

- Chat and ChatKit migration.
- Applying table windows to raw Files LDP queries.
- Replacing singleton Profile reads.
- Persisting the working set to IndexedDB in the first phase.
- Providing arbitrary client-side filtering over rows that were never loaded.

## Working Set Contract

Bounded table Collections declare a window:

```ts
type CollectionWindow<T> = {
  limit: 100
  orderBy: Array<{
    column: keyof T
    direction: 'asc' | 'desc'
  }>
  maxResidentPages: 3
}
```

The effective ordering always appends `id ASC` as a stable tie-breaker. A query
therefore uses a composite cursor rather than an offset:

```text
(primary order values..., id)
```

The first page is the active Top-100 window. Additional pages are loaded on
demand. At most three pages, approximately 300 rows, remain resident. Eviction
uses least-recently-used page access while pinning optimistic rows until their
transactions settle.

## Module Policies

| Module | Ordering | Window |
| --- | --- | ---: |
| Contacts | `name ASC, id ASC` | 100 |
| Favorites | `favoredAt DESC, id ASC` | 100 |
| Inbox approvals | `createdAt DESC, id ASC` | 100 |
| Inbox audit | `createdAt DESC, id ASC` | 100 |
| Inbox notifications | `createdAt DESC, id ASC` | 100 |
| Inbox input requests | `createdAt DESC, id ASC` | 100 |
| Symphony resources | Existing `updatedAt` or `createdAt DESC`, then `id ASC` | 100 each |

Model Services remains fully hydrated because its provider, model, and
credential registries are intentionally small. Profile remains an exact WebID
singleton. Files retains URI/container-scoped raw LDP queries. Chat is excluded.

## Hydration And Pagination

Initial hydration executes one ordered query with `limit(100)`. It stores the
page cursor and whether another page exists. Loading the next page executes a
cursor query and merges rows by canonical Collection key.

The query fetches `limit + 1` rows when the backend requires a look-ahead to
determine `hasNextPage`; the extra row is cursor metadata and is not retained as
an active page member. No select may return more than 101 rows.

Offset pagination is prohibited because concurrent inserts or ordering changes
would produce skipped or duplicated rows.

## Sorted Membership Reconciliation

Every local or subscribed create/update/delete is reconciled against the active
window:

1. Resolve the canonical row and compute its composite sort key.
2. Apply an optimistic or confirmed upsert by row identity.
3. Reorder the affected resident page.
4. Move the row between resident pages when its key crosses a page boundary.
5. Remove the last unpinned row if a page exceeds its limit.
6. Backfill one row after a resident member leaves or is deleted.

Required cases:

- A non-resident row becomes newer and enters Top-100; the previous boundary
  row leaves the active page.
- A resident row becomes older and moves down or leaves the active page.
- Deleting a resident row backfills the next row.
- Equal primary sort values remain stable through `id ASC`.
- A failed optimistic mutation restores both row content and original position.

Remote event bursts are coalesced into a bounded reconciliation batch. They may
perform exact row reads and boundary backfills, but must not trigger one full
table refetch per event.

## Search And Filtering

Local filtering is valid only for the resident working set. Any user search that
must discover non-resident rows uses a remote search/query path with its own
query identity and result window. Search results do not become permanent members
of the main Top-100 window unless they independently qualify for it.

Clearing search restores the primary working set without another initial
hydration when it remains resident.

## API Boundaries

The shared stores package owns:

- ordered window configuration;
- stable cursor encoding and comparison;
- page residency and eviction;
- sorted membership reconciliation;
- optimistic position snapshots and rollback;
- boundary backfill scheduling.

Modules own only their ordering policy, remote search semantics, and product
projection. UI components consume Live Query state and pagination commands; they
must not call ORM queries or maintain a second list cache.

## Failure Handling

- Initial hydration failure exposes the Collection error and retains any valid
  previous working set.
- Exact remote-row resolution failure schedules one coalesced page refresh.
- Boundary backfill failure keeps the shorter page and exposes a recoverable
  stale state; it does not clear valid rows.
- Cursor rejection invalidates only the affected page chain, then reloads the
  first page.
- Optimistic persistence failure restores the captured row and sort position.

## Verification

Central shared tests cover the query model once. Module tests cover only ordering
and projection differences.

Required gates:

- Initial hydration returns at most 100 retained rows and reads at most 101.
- Twenty Live Query consumers produce one hydration query.
- Updating an ordering field repositions the row correctly.
- A non-resident row can enter Top-100 and evict the boundary row.
- Delete and optimistic rollback restore correct membership and ordering.
- Equal ordering values remain stable by `id`.
- Loading and evicting pages never retains more than 300 settled rows.
- A burst of 100 remote changes causes no full-table select and only a bounded
  number of reconciliation commits.
- Benchmarks with 1,000 and 10,000 source rows enforce
  `maxRowsPerSelect <= 101`.

Real xpod integration verifies cursor behavior, exact-row subscription updates,
and boundary backfill. Cloud Pod runs verify correctness and request shape but
are not fixed-latency CI gates.

## Rollout

1. Add shared ordered-window primitives and contract benchmarks.
2. Migrate Favorites and Inbox as descending time-ordered reference modules.
3. Migrate Contacts and add remote search for non-resident matches.
4. Migrate Symphony Collections.
5. Enable page eviction after pagination and rollback tests pass.

Each module migration is independently reversible through its Collection window
configuration. Full-table fallback is allowed only as an explicit temporary
compatibility flag with a removal test and must not be the shared default.
