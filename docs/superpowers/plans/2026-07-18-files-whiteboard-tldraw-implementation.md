# Files Whiteboard tldraw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DOM scroll-container Whiteboard with a full-bleed tldraw canvas supporting LinX resource cards, camera persistence, selection, resize, relations, groups, quick creation, and existing Files detail behavior.

**Architecture:** Treat tldraw as an interaction/rendering engine, never as the business-data authority. Custom shape records hold stable resource references and geometry; current resource content is projected from Files data. Versioned snapshots live in `.meta`; predicate-bound relation changes continue through existing proposal controllers.

**Tech Stack:** React 19, TypeScript 7, `tldraw@5.2.5`, TanStack DB collections, Vitest, Testing Library, browser integration tests.

---

## File Structure

- Create `apps/web/src/modules/files/domain/structured/structured-whiteboard-snapshot.ts`: versioned app-owned snapshot and migration.
- Create `apps/web/src/modules/files/domain/structured/structured-whiteboard-snapshot.test.ts`: corruption/reconciliation/migration tests.
- Create `apps/web/src/modules/files/features/structured/whiteboard/linx-subject-shape.tsx`: custom tldraw subject shape.
- Create `apps/web/src/modules/files/features/structured/whiteboard/linx-whiteboard-adapter.ts`: resource-to-shape projection and stable IDs.
- Create `apps/web/src/modules/files/features/structured/whiteboard/linx-whiteboard-adapter.test.ts`: reconciliation tests.
- Create `apps/web/src/modules/files/features/structured/whiteboard/useLinxWhiteboardController.ts`: editor lifecycle and Files commands.
- Create `apps/web/src/modules/files/features/structured/whiteboard/LinxWhiteboardCanvas.tsx`: full-bleed canvas composition.
- Create `apps/web/src/modules/files/features/structured/whiteboard/LinxWhiteboardToolbar.tsx`: minimal toolbar and search.
- Replace `apps/web/src/modules/files/features/structured/StructuredWhiteboardView.tsx`: adapter entry only.
- Retire the old absolute-position drag logic in `useStructuredWhiteboardViewController.ts` after migration tests pass.
- Modify `apps/web/src/modules/files/domain/structured/structured-view-metadata.ts`: snapshot envelope.
- Modify `apps/web/src/modules/files/features/structured/useStructuredViewMetadataController.ts`: snapshot persistence.
- Modify `apps/web/package.json` and `yarn.lock`: exact `tldraw@5.2.5`.

### Task 1: Add tldraw and Prove Runtime Compatibility

**Files:**
- Modify: `apps/web/package.json`
- Modify: `yarn.lock`
- Create: `apps/web/src/modules/files/features/structured/whiteboard/tldraw-runtime.test.tsx`

- [ ] **Step 1: Add a failing runtime smoke test**

Render a minimal `<Tldraw inferDarkMode={false} />` inside a fixed-size container and assert the editor mounts and a canvas element is present.

- [ ] **Step 2: Install the exact dependency**

Run: `yarn workspace @linx/web add --exact tldraw@5.2.5`
Expected: package and lockfile use exactly `5.2.5`; no Yjs/collaboration package is added intentionally.

- [ ] **Step 3: Import required stylesheet once at the feature boundary**

```ts
import 'tldraw/tldraw.css'
```

Keep the canvas container at a stable nonzero height; do not mount it inside a decorative card.

- [ ] **Step 4: Run smoke and build checks**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/whiteboard/tldraw-runtime.test.tsx && yarn workspace @linx/web build:check`
Expected: PASS. If jsdom cannot provide canvas APIs, move only the render assertion to browser integration; do not replace tldraw with another engine.

- [ ] **Step 5: Commit the runtime foundation**

Commit with Lore intent: `Give Files Whiteboard a real interaction engine`.

### Task 2: Define and Migrate the App-Owned Snapshot

**Files:**
- Create: `apps/web/src/modules/files/domain/structured/structured-whiteboard-snapshot.ts`
- Create: `apps/web/src/modules/files/domain/structured/structured-whiteboard-snapshot.test.ts`
- Modify: `apps/web/src/modules/files/domain/structured/structured-view-metadata.ts`

- [ ] **Step 1: Write failing migration tests**

```ts
expect(normalizeStructuredWhiteboardSnapshot({
  version: 1,
  camera: { x: 10, y: 20, z: 1.2 },
  nodes: [{ resourceUri: 'urn:a', x: 40, y: 60, w: 288, h: 160, z: 1 }],
  groups: [], visualRelations: [],
}, ['urn:a', 'urn:b']).nodes.map(node => node.resourceUri)).toEqual(['urn:a', 'urn:b'])
```

Also cover legacy `whiteboardPositions`, duplicate resource URIs, corrupt camera values, deleted resources, unknown versions, and deterministic placement of new subjects.

- [ ] **Step 2: Verify RED**

Run the focused domain test and expect missing snapshot functions.

- [ ] **Step 3: Implement the snapshot contract**

```ts
export type StructuredWhiteboardSnapshotV1 = {
  version: 1
  camera: { x: number; y: number; z: number }
  nodes: Array<{ resourceUri: string; x: number; y: number; w: number; h: number; z: number; groupId?: string }>
  groups: Array<{ id: string; title: string; color: string }>
  visualRelations: Array<{ id: string; from: string; to: string; label?: string; predicate?: string }>
}
```

Clamp dimensions and zoom, validate finite coordinates, deduplicate resource identity, migrate legacy positions, and produce a deterministic grid fallback.

- [ ] **Step 4: Run domain tests**

Run snapshot plus existing structured-view metadata tests. Expected: PASS with backward compatibility.

- [ ] **Step 5: Commit snapshot semantics**

Commit with Lore intent: `Preserve Whiteboard arrangement without copying resource content`.

### Task 3: Build the Resource-to-tldraw Adapter

**Files:**
- Create: `apps/web/src/modules/files/features/structured/whiteboard/linx-whiteboard-adapter.ts`
- Create: `apps/web/src/modules/files/features/structured/whiteboard/linx-whiteboard-adapter.test.ts`

- [ ] **Step 1: Write failing stable-ID and reconciliation tests**

Assert the same resource URI always maps to the same app shape ID, title changes update shape props without geometry changes, deleted resources remove only resource shapes, and visual arrows survive unrelated content refreshes.

- [ ] **Step 2: Verify RED**

Run the adapter test and expect missing functions.

- [ ] **Step 3: Implement adapter records**

```ts
export type LinxSubjectShapeProps = {
  resourceUri: string
  title: string
  summary: string
  classLabel?: string
  pending: boolean
  facts: Array<{ id: string; label: string }>
  w: number
  h: number
}
```

Use tldraw-safe deterministic IDs derived from a hash of `resourceUri`; keep mutable resource content in props and geometry in the app snapshot.

- [ ] **Step 4: Verify adapter purity**

Run adapter tests and Files architecture tests. Expected: PASS; adapter imports domain/UI contracts but no Pod client.

- [ ] **Step 5: Commit adapter**

Commit with Lore intent: `Bind canvas shapes to resources without making shapes authoritative`.

### Task 4: Implement the Custom LinX Subject Shape

**Files:**
- Create: `apps/web/src/modules/files/features/structured/whiteboard/linx-subject-shape.tsx`
- Create: `apps/web/src/modules/files/features/structured/whiteboard/linx-subject-shape.test.tsx`
- Reuse: `apps/web/src/modules/files/ui/StructuredSubjectCard.tsx`

- [ ] **Step 1: Write failing shape presentation tests**

Cover title, two-line summary, pending marker, resize bounds, selected state, double-click open callback, and no permanent action row.

- [ ] **Step 2: Verify RED**

Run the focused test and expect missing shape utility.

- [ ] **Step 3: Implement `LinxSubjectShapeUtil`**

Render `StructuredSubjectCard` within tldraw's HTML container; enforce minimum `240x120`, maximum `480x360`, rounded radius no greater than 8px, and stable resize behavior. Stop pointer propagation only for explicit card actions.

- [ ] **Step 4: Run shape and shared-card tests**

Expected: PASS with no duplicate card implementation.

- [ ] **Step 5: Commit shape surface**

Commit with Lore intent: `Carry the Files card language onto the canvas`.

### Task 5: Replace the DOM Whiteboard With a Full-Bleed Canvas

**Files:**
- Create: `apps/web/src/modules/files/features/structured/whiteboard/LinxWhiteboardCanvas.tsx`
- Create: `apps/web/src/modules/files/features/structured/whiteboard/useLinxWhiteboardController.ts`
- Modify: `apps/web/src/modules/files/features/structured/StructuredWhiteboardView.tsx`
- Test: `apps/web/src/modules/files/features/structured/useStructuredWhiteboardViewController.test.tsx`

- [ ] **Step 1: Write failing controller tests**

Cover initial resource insertion, camera restore, selection retention across content refresh, snapshot projection on geometry/camera changes, double-click detail opening, and deterministic empty-state framing.

- [ ] **Step 2: Verify RED**

Run focused controller tests and expect missing tldraw adapter behavior.

- [ ] **Step 3: Implement editor lifecycle**

On mount register custom shapes, project resources, restore snapshot and camera, and subscribe to store changes. Debounce app-snapshot writes; ignore resource-content-only changes when calculating geometry persistence.

- [ ] **Step 4: Replace old rendering**

`StructuredWhiteboardView` becomes a thin feature entry that passes projection, snapshot, relations, and Files callbacks into `LinxWhiteboardCanvas`. Remove the old SVG lines and absolute-position nodes after tests prove parity.

- [ ] **Step 5: Verify canvas behavior**

Run controller, relation-model, and FileDetailPane tests. Expected: PASS for opening and metadata hydration.

- [ ] **Step 6: Commit canvas migration**

Commit with Lore intent: `Turn Whiteboard from a scrollable diagram into a spatial workspace`.

### Task 6: Add Minimal Toolbar, Search, Quick Create, and Groups

**Files:**
- Create: `apps/web/src/modules/files/features/structured/whiteboard/LinxWhiteboardToolbar.tsx`
- Create: `apps/web/src/modules/files/features/structured/whiteboard/LinxWhiteboardToolbar.test.tsx`
- Modify: `apps/web/src/modules/files/features/structured/whiteboard/useLinxWhiteboardController.ts`

- [ ] **Step 1: Write failing interaction tests**

Cover select/hand tools, add subject, relation, group, search and zoom controls; double-click empty canvas quick-create; search selects and zooms to a resource; secondary actions remain in context menus.

- [ ] **Step 2: Verify RED**

Run toolbar tests and expect missing controls.

- [ ] **Step 3: Implement compact toolbar**

Use icon-only Lucide controls with tooltips, stable 28px controls, and no descriptive helper copy. Reuse tldraw's commands for zoom, grouping, alignment, duplicate, delete, z-order, undo, and redo.

- [ ] **Step 4: Implement resource quick-create**

Creating a subject invokes the existing class/subject proposal command and inserts the resulting resource shape only after a stable resource URI exists. It must not create an orphan tldraw-only card.

- [ ] **Step 5: Run interaction tests**

Expected: PASS for toolbar, search, quick-create, and grouping.

- [ ] **Step 6: Commit controls**

Commit with Lore intent: `Keep Whiteboard tools nearby without surrounding the canvas in chrome`.

### Task 7: Implement Visual and Predicate-Bound Relations

**Files:**
- Modify: `apps/web/src/modules/files/features/structured/whiteboard/useLinxWhiteboardController.ts`
- Modify: `apps/web/src/modules/files/features/structured/structured-whiteboard-relation-model.ts`
- Modify: `apps/web/src/modules/files/features/structured/useStructuredWhiteboardRelationController.ts`
- Test: `apps/web/src/modules/files/features/structured/structured-whiteboard-relation-model.test.ts`

- [ ] **Step 1: Write failing relation tests**

Cover visual-only arrows writing `.meta`, eligible predicate binding producing a proposal, rejected proposal preserving the arrow as unsynced, relation deletion removing the appropriate metadata/source value, and endpoint deletion cleanup.

- [ ] **Step 2: Verify RED**

Run relation tests and expect missing tldraw relation plans.

- [ ] **Step 3: Map tldraw arrows to relation records**

Arrow endpoints reference stable resource URIs, not transient shape IDs. Visual labels and styles remain view metadata. Predicate-bound edges carry the predicate URI and source-write status.

- [ ] **Step 4: Route predicate writes through proposals**

Reuse `onCommitCellWriteProposal`; apply optimistic edge state, then mark synced or rollback binding status on failure without deleting the user's visual relation.

- [ ] **Step 5: Run relation and metadata tests**

Expected: PASS for both visual-only and RDF-bound paths.

- [ ] **Step 6: Commit relation semantics**

Commit with Lore intent: `Let spatial relations become RDF only when the user binds them`.

### Task 8: Whiteboard Integration, Performance, and Visual Verification

**Files:**
- Create: `tests/e2e/files-whiteboard.spec.ts`
- Modify: relevant Files visual verification scripts under `apps/prototype/scripts/verify-files-*` only when they remain authoritative.

- [ ] **Step 1: Add complete browser coverage**

Test entry from `.ttl`, nonblank canvas, pan/zoom, marquee and Shift selection, move/resize, copy/paste, delete, undo/redo, quick create, relation, group, detail opening, reload restoration, and resource-content refresh without geometry loss.

- [ ] **Step 2: Add scale coverage**

Load at least 200 resource shapes and assert interaction remains responsive and the canvas does not eagerly render offscreen DOM card bodies beyond tldraw's normal virtualization behavior.

- [ ] **Step 3: Run unit and build gates**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/whiteboard src/modules/files/domain/structured/structured-whiteboard-snapshot.test.ts && yarn workspace @linx/web build:check`
Expected: PASS.

- [ ] **Step 4: Run authenticated real-Pod integration**

Expected: geometry/camera writes touch `.meta`; predicate-bound relation writes touch source `.ttl` through proposals; visual-only relations never mutate source RDF.

- [ ] **Step 5: Capture desktop and narrow screenshots plus pixel checks**

Verify a nonblank full-bleed scene, correct framing, no overlapping toolbar/card content, readable selected cards, and working zoom at wide and narrow viewports.

- [ ] **Step 6: Commit verified Whiteboard**

Commit with Lore intent: `Prove Files Whiteboard as a durable spatial workspace`.

