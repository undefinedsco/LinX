# Files Kanban Heptabase-Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Files Kanban into a compact, horizontally scrolling, predicate-backed board with shared subject cards, robust drag behavior, quick creation, collapse state, and `.meta` persistence.

**Architecture:** Keep `dnd-kit` and the existing proposal controllers. Extract a pure shared subject-card surface, add deterministic board metadata models in `domain/structured`, and keep Pod writes in the existing feature/data adapters. Cross-lane movement updates source RDF through proposals; ordering, collapsed lanes, and viewport state update `.meta` only.

**Tech Stack:** React 19, TypeScript 7, dnd-kit, TanStack DB collections, Vitest, Testing Library.

---

## Source Documents

- `docs/superpowers/specs/2026-07-18-files-kanban-whiteboard-heptabase-design.md`
- `docs/ui-component-architecture.md`
- `docs/frontend-module-abstraction.md`
- `docs/pod-interaction-layering.md`

## File Structure

- Create `apps/web/src/modules/files/ui/StructuredSubjectCard.tsx`: pure card presentation and keyboard/hover action surface.
- Create `apps/web/src/modules/files/ui/StructuredSubjectCard.test.tsx`: presentation and interaction contract.
- Create `apps/web/src/modules/files/domain/structured/structured-kanban-board-state.ts`: collapse, lane order, viewport, and reconciliation.
- Create `apps/web/src/modules/files/domain/structured/structured-kanban-board-state.test.ts`: deterministic metadata tests.
- Create `apps/web/src/modules/files/features/structured/StructuredKanbanCard.tsx`: data-aware adapter around the shared card.
- Create `apps/web/src/modules/files/features/structured/StructuredKanbanLane.tsx`: lane shell, collapse, quick add, drop target.
- Modify `apps/web/src/modules/files/features/structured/StructuredKanbanView.tsx`: horizontal board composition and drag overlay.
- Modify `apps/web/src/modules/files/features/structured/useStructuredKanbanViewController.ts`: selection, drag overlay, collapse, quick-create commands.
- Modify `apps/web/src/modules/files/features/structured/structured-kanban-view-model.ts`: shared card view models and lane chrome.
- Modify `apps/web/src/modules/files/domain/structured/structured-view-metadata.ts`: versioned Kanban metadata fields.
- Modify `apps/web/src/modules/files/features/structured/useStructuredViewMetadataController.ts`: optimistic `.meta` persistence.

### Task 1: Lock the Shared Subject Card Contract

**Files:**
- Create: `apps/web/src/modules/files/ui/StructuredSubjectCard.test.tsx`
- Create: `apps/web/src/modules/files/ui/StructuredSubjectCard.tsx`

- [ ] **Step 1: Write failing tests for stable card geometry and low-chrome actions**

```tsx
render(<StructuredSubjectCard model={{
  subject: 'urn:task:1', title: 'Prepare launch', summary: 'Coordinate the release checklist.',
  classLabel: 'Task', facts: [{ id: 'owner', label: 'Ganlu' }], pending: false,
}} selected={false} onSelect={onSelect} onOpen={onOpen} />)
expect(screen.getByText('Prepare launch')).toBeVisible()
expect(screen.getByRole('button', { name: '打开 Prepare launch' })).toBeVisible()
expect(screen.getByTestId('structured-subject-card')).toHaveAttribute('data-card-density', 'compact')
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `yarn workspace @linx/web vitest run src/modules/files/ui/StructuredSubjectCard.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the pure card API**

```ts
export type StructuredSubjectCardModel = {
  subject: string
  title: string
  summary: string
  classLabel?: string
  facts: Array<{ id: string; label: string }>
  pending: boolean
  errorLabel?: string
  thumbnailUrl?: string
}
```

Implement single-click selection, double-click/Enter open, Space selection, two-line summary, at most two facts, and hover/focus actions whose absolute positioning does not change card size.

- [ ] **Step 4: Run tests and architecture checks**

Run: `yarn workspace @linx/web vitest run src/modules/files/ui/StructuredSubjectCard.test.tsx src/modules/files/features/files-features.architecture.test.ts`
Expected: PASS; pure UI must not import Files data/app modules.

- [ ] **Step 5: Commit the shared card**

Commit with Lore intent: `Give every structured projection one resource-card language`.

### Task 2: Add Versioned Kanban View Metadata

**Files:**
- Create: `apps/web/src/modules/files/domain/structured/structured-kanban-board-state.ts`
- Create: `apps/web/src/modules/files/domain/structured/structured-kanban-board-state.test.ts`
- Modify: `apps/web/src/modules/files/domain/structured/structured-view-metadata.ts`

- [ ] **Step 1: Write failing reconciliation tests**

```ts
expect(reconcileStructuredKanbanBoardState({
  saved: { version: 1, laneOrder: ['doing', 'done'], collapsedLaneIds: ['done'], scrollLeft: 260, cardOrder: { doing: ['a', 'gone'] } },
  lanes: [{ id: 'todo', subjects: ['b'] }, { id: 'doing', subjects: ['a', 'c'] }, { id: 'done', subjects: [] }],
})).toEqual({
  version: 1,
  laneOrder: ['doing', 'done', 'todo'],
  collapsedLaneIds: ['done'],
  scrollLeft: 260,
  cardOrder: { doing: ['a', 'c'], done: [], todo: ['b'] },
})
```

- [ ] **Step 2: Verify RED**

Run: `yarn workspace @linx/web vitest run src/modules/files/domain/structured/structured-kanban-board-state.test.ts`
Expected: FAIL with missing reconciliation function.

- [ ] **Step 3: Implement state normalization**

```ts
export type StructuredKanbanBoardStateV1 = {
  version: 1
  laneOrder: string[]
  collapsedLaneIds: string[]
  scrollLeft: number
  cardOrder: Record<string, string[]>
}
```

Drop unknown lanes and subjects, append new lanes and subjects deterministically, clamp `scrollLeft >= 0`, deduplicate IDs, and return defaults for corrupt metadata.

- [ ] **Step 4: Extend `.meta` parsing and serialization**

Add the board state beneath the existing structured-view metadata envelope. Keep compatibility with the current `kanbanOrder` field by migrating it into `cardOrder` when no versioned state exists.

- [ ] **Step 5: Run metadata tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/domain/structured/structured-kanban-board-state.test.ts src/modules/files/domain/structured/structured-view-metadata.test.ts`
Expected: PASS for empty, stale, duplicate, corrupt, and legacy metadata.

- [ ] **Step 6: Commit metadata migration**

Commit with Lore intent: `Keep Kanban arrangement durable without changing business RDF`.

### Task 3: Replace the Grid With Horizontal Lanes

**Files:**
- Create: `apps/web/src/modules/files/features/structured/StructuredKanbanLane.tsx`
- Create: `apps/web/src/modules/files/features/structured/StructuredKanbanLane.test.tsx`
- Modify: `apps/web/src/modules/files/features/structured/StructuredKanbanView.tsx`

- [ ] **Step 1: Write failing lane-layout tests**

Assert a board with four lanes renders one horizontal strip, each expanded lane has `data-lane-width="288"`, collapsed lanes have compact width, headers remain sticky, and each lane exposes `添加 Subject 到 <lane>`.

- [ ] **Step 2: Verify RED**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/StructuredKanbanLane.test.tsx`
Expected: FAIL because the lane component does not exist.

- [ ] **Step 3: Implement the lane shell**

Use `flex min-w-max items-start gap-3`, `w-72 shrink-0`, independent lane body scrolling, a sticky header, count, collapse icon, drop target, and final inline add row. Do not render page sections as floating cards.

- [ ] **Step 4: Compose lanes in `StructuredKanbanView`**

Replace `md:grid-cols-3`; preserve `SortableContext` per lane; keep one board-level horizontal scroll container and restore its scroll position from metadata.

- [ ] **Step 5: Verify responsive geometry**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/StructuredKanbanLane.test.tsx src/modules/files/components/StructuredKanbanView.architecture.test.ts`
Expected: PASS with stable lane dimensions and owner-layer imports.

- [ ] **Step 6: Commit horizontal lanes**

Commit with Lore intent: `Let Kanban scale by lanes instead of squeezing into a dashboard grid`.

### Task 4: Add Drag Overlay and Correct Write Semantics

**Files:**
- Create: `apps/web/src/modules/files/features/structured/StructuredKanbanCard.tsx`
- Modify: `apps/web/src/modules/files/features/structured/StructuredKanbanView.tsx`
- Modify: `apps/web/src/modules/files/features/structured/useStructuredKanbanViewController.ts`
- Modify: `apps/web/src/modules/files/features/structured/useStructuredKanbanMoveController.ts`
- Test: `apps/web/src/modules/files/features/structured/useStructuredKanbanViewController.test.tsx`

- [ ] **Step 1: Write failing drag-plan tests**

Cover: same-lane reorder emits metadata only; cross-lane move emits one predicate proposal plus metadata order; rejected proposal restores the source lane/order; drag overlay shows the shared card without duplicating actions.

- [ ] **Step 2: Verify RED**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/useStructuredKanbanViewController.test.tsx`
Expected: FAIL on missing overlay and rollback assertions.

- [ ] **Step 3: Implement one dnd-kit path**

Remove the parallel native HTML drag path after equivalent file-drop behavior is proven unnecessary for subject cards. Use `DragOverlay`, `PointerSensor`, `KeyboardSensor`, `sortableKeyboardCoordinates`, and one deterministic drag-end plan.

- [ ] **Step 4: Implement optimistic rollback**

Capture the pre-move board state. Apply the visual move immediately. Await `onCommitCellWriteProposal`; on `false` or rejection restore the snapshot and expose a card-local retry/error label.

- [ ] **Step 5: Run controller and component tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/useStructuredKanbanViewController.test.tsx src/modules/files/features/structured/structured-kanban-move-model.test.ts src/modules/files/ui/StructuredSubjectCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit drag semantics**

Commit with Lore intent: `Make Kanban movement immediate without confusing view order with RDF state`.

### Task 5: Quick Create, Collapse, and Detail Opening

**Files:**
- Modify: `apps/web/src/modules/files/features/structured/StructuredKanbanLane.tsx`
- Modify: `apps/web/src/modules/files/features/structured/StructuredKanbanCard.tsx`
- Modify: `apps/web/src/modules/files/features/structured/useStructuredKanbanViewController.ts`
- Test: `apps/web/src/modules/files/components/FileDetailPane.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Cover inline `+ Subject`, Escape cancellation, Enter creation, lane collapse/restore, single-click detail sheet, double-click file navigation, and empty-board creation affordances.

- [ ] **Step 2: Verify RED**

Run the named tests with Vitest and expect failures for missing quick-create/collapse behavior.

- [ ] **Step 3: Implement quick create through existing subject proposal commands**

The inline input creates a subject for the selected class, then writes the lane predicate through the same proposal path. It must not create a local-only Kanban card.

- [ ] **Step 4: Persist collapse and scroll state**

Debounce `.meta` writes through `useStructuredViewMetadataController`; restore scroll after lanes render; keep selection and detail sheet open across remote card-content refreshes.

- [ ] **Step 5: Verify interactions**

Run: `yarn workspace @linx/web vitest run src/modules/files/components/FileDetailPane.test.tsx src/modules/files/features/structured/StructuredKanbanLane.test.tsx`
Expected: PASS for empty, creation, collapse, and detail paths.

- [ ] **Step 6: Commit workflow completion**

Commit with Lore intent: `Make Kanban usable from an empty board through subject detail`.

### Task 6: Kanban Integration and Visual Verification

**Files:**
- Create: `tests/e2e/files-kanban.spec.ts`
- Modify: `apps/prototype/src/files/StructuredKanbanView.tsx` only if the prototype remains an acceptance fixture; otherwise delete stale Kanban-specific prototype assertions.

- [ ] **Step 1: Add browser integration coverage**

Test board entry from `.ttl`, predicate selection, quick create, same-lane reorder, cross-lane move, detail opening, collapse, reload restoration, and proposal rejection rollback.

- [ ] **Step 2: Run focused unit/integration suite**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured src/modules/files/ui/StructuredSubjectCard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run build checks**

Run: `yarn workspace @linx/web build:check`
Expected: TypeScript and Vite build pass; existing externalization warnings may remain unchanged.

- [ ] **Step 4: Run the real browser path**

Run the repository's authenticated Files e2e harness against a bootstrapped xpod. Expected: all Kanban steps pass and `.ttl` versus `.meta` network writes match the design contract.

- [ ] **Step 5: Capture wide and narrow screenshots**

Verify no clipped lane headers, overlay misalignment, nested cards, visible action clutter, or horizontal page overflow outside the board scroller.

- [ ] **Step 6: Commit verification artifacts**

Commit with Lore intent: `Prove the Kanban workflow across Pod state and responsive UI`.

