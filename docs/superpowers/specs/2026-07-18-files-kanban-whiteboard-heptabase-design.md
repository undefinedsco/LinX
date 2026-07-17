# Files Kanban and Whiteboard Heptabase-Level Design

## Objective

Make Kanban and Whiteboard first-class projections of Files resources rather than decorative alternatives to Table. They must preserve the same subject, class, predicate, proposal, access, and detail-sheet semantics while providing interaction quality comparable to Heptabase.

## Product Model

- A card represents a resource-backed subject. It is not a second copy of the data.
- Table, Kanban, Whiteboard, and Raw are views over the same selected class and subjects.
- Opening a card uses the existing subject/file detail sheet. Double-click navigates when the subject resolves to a file-backed resource.
- Business values remain in the source `.ttl` resource.
- View-only state belongs in the resource `.meta` sidecar: active view, Kanban ordering, Whiteboard camera, positions, dimensions, z-order, groups, and visual-only relations.
- A relation bound to an RDF predicate updates the source `.ttl` through the existing proposal/approval path. A visual relation without a predicate updates only `.meta`.
- Pending writes retain the existing `*` proposal marker and optimistic-update/rollback behavior.

## Shared Card Surface

Create a reusable, data-independent `StructuredSubjectCard` in the Files UI layer. Feature adapters provide its view model and commands.

The card shows:

- title as the primary line;
- up to two lines of content summary;
- class and at most two high-signal predicate values;
- compact pending/error state;
- optional cover or thumbnail only when the resource has inspectable media.

The card does not permanently show action rows. Selection, hover, and keyboard focus reveal context actions. Single click selects; double-click opens or navigates; Enter opens; Space selects. Card content and metadata must not resize when hover controls appear.

Kanban and Whiteboard use the same visual card, detail opening contract, proposal state, and loading/error treatment. Their containers and interaction affordances remain feature-specific.

## Kanban

### Layout

- Use the existing `dnd-kit` foundation.
- Replace the responsive three-column grid with a horizontally scrolling lane strip.
- Lanes have a stable width, independent vertical scrolling, sticky compact headers, item count, collapse state, and an end-of-lane `+ Subject` action.
- The final lane is an explicit unassigned/empty-value lane when applicable.
- Empty boards still expose group-predicate selection and subject creation.

### Interaction

- Reorder cards within a lane and move them across lanes with a visible placeholder and drag overlay.
- Keep keyboard-accessible move commands as a fallback, but place them in the hover menu.
- Cross-lane movement writes the grouping predicate through the existing cell-write proposal path. In-lane movement writes only Kanban order metadata.
- Support multi-selection and batch move after the single-card path is stable.
- A card click opens the subject detail sheet without changing the current board; double-click may navigate to a file-backed subject.
- Column headers expose collapse and predicate-value actions without turning every header into a card.

### Persistence

Persist group predicate, lane order, card order, collapsed lanes, and horizontal board position in `.meta`. Reconcile saved order against current subjects so deleted subjects disappear and new subjects append deterministically.

## Whiteboard

### Canvas Foundation

Use `tldraw` for camera, zoom, pan, selection, marquee selection, multi-selection, keyboard movement, snapping, resize, z-order, undo/redo, and performant rendering. Do not continue extending the current scroll-container coordinate system.

Provide custom LinX shapes:

- `linx-subject`: resource-backed shared card;
- `linx-file`: file-backed subject with file affordance;
- `linx-group`: visual section/group;
- tldraw arrows customized with optional RDF predicate metadata.

The first integrated Files projection must support structured subjects. The shape and persistence contracts must also accept ordinary files and standalone cards so the canvas does not need another migration to become a unified Files whiteboard.

### Interaction

- Wheel/trackpad zooms; drag empty canvas pans; marquee selects; Shift extends selection.
- Double-clicking empty canvas opens quick-create. Double-clicking a card opens the existing detail sheet.
- Dragging from a card connection handle creates a relation. The relation inspector can leave it visual-only or bind it to an eligible predicate.
- `Delete`, duplicate, copy/paste, bring forward/back, align, distribute, group, and zoom-to-selection follow tldraw conventions.
- Toolbar chrome stays minimal: select/hand, card, relation, group, search, and zoom controls. Secondary actions live in context menus.
- The canvas fills the available Files content area and must not sit inside a decorative card.

### Persistence

Persist a versioned Whiteboard snapshot in `.meta` containing camera, shape geometry, z-order, group membership, and visual relations. Store resource identity separately from transient shape IDs. Rehydrate resource content from current Files data so changing a title or predicate updates every projection without rewriting the canvas snapshot.

Use a migration function for every persisted snapshot version. Corrupt or unknown view metadata must fall back to a deterministic layout without hiding source subjects.

## Architecture

Follow the existing Files two-layer component rule:

- `ui/`: pure shared card, badges, lane shell, empty state, and tldraw shape presentation;
- `features/structured/`: Kanban/Whiteboard controllers, commands, proposal integration, and tldraw adapters;
- `domain/structured/`: deterministic projection, ordering, selection, snapshot normalization, migrations, and write plans;
- `data/`: `.meta` and source resource persistence through existing repositories/collections;
- `app/`: wiring only.

Do not let tldraw records become the business data source. The Files resource model remains authoritative. Do not write Pod resources directly from React components.

## Failure and Concurrency Behavior

- UI updates optimistically for card movement and metadata changes.
- A source-predicate write failure rolls back the affected Kanban move and presents a local retry state.
- A `.meta` save failure keeps the in-memory board usable, marks view state unsynced, and retries without losing source edits.
- Remote resource changes refresh card content while preserving local selection and camera.
- Conflicting view metadata uses revision-aware last-writer behavior initially; the format must permit later operation-based merging.

## Delivery Slices

1. Shared subject card and current-state regression coverage.
2. Kanban horizontal lanes, drag overlay, quick create, collapse, and metadata persistence.
3. tldraw adapter, custom subject shape, camera/selection/resize, and snapshot persistence.
4. Whiteboard relations, groups, quick create, and Files/detail-sheet integration.
5. Multi-selection and batch operations shared across both projections.
6. Visual, accessibility, integration, and real-Pod verification.

## Acceptance Criteria

### Kanban

- Works with zero, one, and many lanes and subjects.
- Supports mouse and keyboard reorder within and across lanes.
- Cross-lane moves update the predicate through proposal semantics; same-lane reorder does not modify source RDF.
- Reload restores lane order, card order, collapse state, and horizontal position.
- Card opening, pending state, errors, and detail sheets match Table behavior.

### Whiteboard

- Smoothly pans and zooms, including trackpad use.
- Supports single, marquee, Shift multi-selection, move, resize, copy/paste, delete, undo, and redo.
- Reload restores camera, geometry, groups, z-order, and visual relations.
- Resource changes update card content without losing geometry.
- Relation creation can remain visual-only or produce an RDF proposal when bound to a predicate.
- Ordinary files and standalone cards can use the same shape contract even if the first shipped entry point is a structured `.ttl` view.

### Quality Gates

- Domain projection and migration tests cover empty, stale, corrupt, and concurrent metadata.
- Component tests cover drag/drop, keyboard operation, quick create, card opening, and rollback.
- Real browser integration tests cover the complete Kanban and Whiteboard paths.
- Desktop and browser screenshots are verified at wide and narrow viewports.
- Canvas pixel checks prove the tldraw scene is nonblank and correctly framed.
- Real Pod integration proves `.ttl` and `.meta` writes stay separated.

## Explicit Non-Goals

- Real-time multi-user cursor presence and CRDT collaboration are not required in this delivery.
- Whiteboard text documents do not replace the existing Tiptap detail editor.
- Kanban columns are not independent containers; they are values of the selected grouping predicate.
