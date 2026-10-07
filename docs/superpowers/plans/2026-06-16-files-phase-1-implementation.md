# Files Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Files phase with Tiptap editor detail sheets, structured tables, Kanban, and Whiteboard aligned to the Files card-first spec.

**Architecture:** Keep the prototype app working while extracting focused Files primitives out of the current large `apps/prototype/src/main.tsx`. Use headless libraries where they are stable for the target interaction: TanStack Table for structured table state, Tiptap for rich text, and dnd-kit for Kanban drag/sort. Whiteboard phase 1 is a deterministic DOM projection of subject cards and relation lines; freeform canvas engines remain a later canvas-specific decision. `.ttl` remains an embedded table workspace; editable non-`.ttl` files open in macOS sheet-style editor overlays with `.meta` at the bottom.

**Tech Stack:** React 19, Vite, TypeScript, lucide-react, Tiptap/ProseMirror, TanStack Table, dnd-kit, DOM-projected Whiteboard.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-06-15-files-minimal-card-first-design.md`
- Module contract: `docs/prototype/module-files.md`
- Global design contract: `DESIGN.md`
- Current prototype entry: `apps/prototype/src/main.tsx`
- Current prototype styles: `apps/prototype/src/prototype.css`

## Dependency Additions

Add these dependencies to `apps/prototype/package.json` in the implementation branch:

```json
{
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^10.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "@tanstack/react-table": "^8.21.3",
  "@tiptap/extension-placeholder": "^3.26.1",
  "@tiptap/react": "^3.26.1",
  "@tiptap/starter-kit": "^3.26.1"
}
```

Run:

```bash
yarn install
yarn workspace @linx/prototype build
```

Expected: install completes and prototype build passes before feature edits proceed.

## File Structure

Create a Files prototype module so workers do not keep expanding `main.tsx`:

```text
apps/prototype/src/files/
  files-model.ts
  FilesWorkspace.tsx
  FolderView.tsx
  FileEditorSheet.tsx
  StructuredTableView.tsx
  StructuredKanbanView.tsx
  StructuredWhiteboardView.tsx
  ResourceSidecars.tsx
  typed-cell-editors.tsx
  files-ui.tsx
```

Responsibilities:

- `files-model.ts`: sample data, view ids, type definitions, metadata placement matrix, subject routing helpers.
- `FilesWorkspace.tsx`: orchestrates folder/table/file/editor/sheet/view switching.
- `FolderView.tsx`: Finder-like list/column/icon folder detail and selected-item preview.
- `FileEditorSheet.tsx`: Tiptap editor sheet with title, byline, blocks, access action, bottom `.meta`.
- `StructuredTableView.tsx`: TanStack Table-backed `.data` and `.vocab` tables.
- `StructuredKanbanView.tsx`: dnd-kit board grouped by predicate value.
- `StructuredWhiteboardView.tsx`: projected whiteboard with subject card shapes and RDF/visual relation lines.
- `ResourceSidecars.tsx`: `.meta` drawer and Access modal.
- `typed-cell-editors.tsx`: text/date/checkbox/relation/select/multi-select cell editors.
- `files-ui.tsx`: small local UI primitives reused by Files only.

## Task 1: Extract Files Module Shell

**Files:**
- Create: `apps/prototype/src/files/files-model.ts`
- Create: `apps/prototype/src/files/files-ui.tsx`
- Create: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/main.tsx`
- Modify: `apps/prototype/src/prototype.css`

- [x] Move Files sample data and selection state types from `main.tsx` into `files-model.ts` / `files-types.ts`.
- [x] Move first repeated Files controls into `files-ui.tsx`: page header/title, Access icon action, `.meta` toggle, and `InfoRow`. View tabs, empty state, and sheet header can be extracted later without changing behavior.
- [x] Create `FilesWorkspace.tsx` with the same rendered states currently shown in the prototype.
- [x] Replace the Files branch in `main.tsx` with `<FilesWorkspace />`.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Verify the existing Files screenshots still have the same entry points: folder, `.data` table, `.vocab` table, editable file, readonly image.
- [ ] Commit only the extraction after build passes.

## Task 2: Implement Sidecar and Sheet Placement Matrix

**Files:**
- Create: `apps/prototype/src/files/ResourceSidecars.tsx`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/files/FileEditorSheet.tsx`
- Modify: `apps/prototype/src/prototype.css`

- [x] Implement one right `.meta` drawer for folder, readonly file, `.ttl`, and `.vocab` resources. It starts collapsed.
- [x] Implement one Access modal opened by a Shield action. It must show whether the resource uses ACL or ACR as provider-dependent policy.
- [x] Implement sheet-local bottom `.meta` for editable file/card detail. Do not show the page drawer while the sheet is open.
- [x] Use semantic icons: Info for `.meta`, Shield for Access.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Verify: folder meta drawer, `.ttl` meta drawer, image meta drawer, editable file bottom meta, Access modal with scope-specific ACL/ACR semantics.
- [ ] Commit sidecar/sheet placement separately.

## Task 3: Add Tiptap File/Card Editor Sheet

**Files:**
- Create: `apps/prototype/src/files/FileEditorSheet.tsx`
- Modify: `apps/prototype/src/files/files-model.ts`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/prototype.css`
- Modify: `apps/prototype/package.json`

- [x] Add Tiptap dependencies listed above.
- [x] Build `FileEditorSheet` with title, byline, Tiptap editor body, subtle block placeholder, Access action, and bottom `.meta`.
- [x] Editable non-`.ttl` file selection opens the sheet directly. It must not first show an embedded document preview.
- [x] Seed editor content from sample blocks separated by two newlines.
- [x] Preserve source/ingest byline: source, sync status, ingest progress, local edit count.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Verify: type in editor, close sheet, reopen sample, bottom meta remains visible, block seed renders, and edited content persists as Tiptap JSON.
- [ ] Commit Tiptap editor integration separately.

## Task 4: Replace Hand-Rolled Table State With TanStack Table Shell

**Files:**
- Create: `apps/prototype/src/files/StructuredTableView.tsx`
- Create: `apps/prototype/src/files/typed-cell-editors.tsx`
- Modify: `apps/prototype/src/files/files-model.ts`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/prototype.css`
- Modify: `apps/prototype/package.json`

- [x] Add TanStack Table dependency listed above.
- [x] Implement `.data` subject table and `.vocab` registry table as separate modes.
- [x] Keep schema order: `subject`, predicate columns, `+ Predicate`.
- [x] Keep class scope as a single compact icon/control in the table head. Do not render class as a normal table column.
- [x] Implement toolbar actions: Filter, Sort, Search, namespace switch, column visibility.
- [x] Implement Excel-like column resizing from header dividers.
- [x] Implement typed cells: text inline edit, date inline edit, checkbox direct toggle, relation/url open/replace affordance, select and multi-select tag selector.
- [x] Implement pending `*` on class scope and predicate headers in the current prototype.
- [x] Implement prototype-local pending `*` on enum option chips; production should back it with first-class proposal resources.
- [x] Lock `.vocab` registry table: no business `+ Subject`, no business `+ Predicate`, no ordinary cell editing.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Manually verify: `.data` table editable, `.vocab` table locked, namespace switch, column visibility, enum search/create popover.
- [ ] Commit table shell separately.

## Task 5: Implement Finder-Like Folder Detail

**Files:**
- Create: `apps/prototype/src/files/FolderView.tsx`
- Modify: `apps/prototype/src/files/files-model.ts`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/prototype.css`

- [x] Add list, column, and icon view toggles.
- [x] Show selected item preview as a lightweight pane with name, type, URI/path, summary, and key metadata.
- [x] Keep folder `.meta` in the right drawer, not inside selected-item preview.
- [x] Clicking editable file opens `FileEditorSheet`.
- [x] Clicking `.ttl` opens structured table.
- [x] Clicking readonly image/media opens lightweight preview.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Verify: folder detail does not render a card wall and does not embed editable document body.
- [ ] Commit folder detail separately.

## Task 6: Implement Kanban View

**Files:**
- Create: `apps/prototype/src/files/StructuredKanbanView.tsx`
- Modify: `apps/prototype/src/files/files-model.ts`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/prototype.css`
- Modify: `apps/prototype/package.json`

- [x] Add dnd-kit dependencies listed above.
- [x] Render Kanban as a `+ View` option for structured resources.
- [x] Group cards by one predicate, starting with status/mode sample data.
- [x] Card content: subject title, summary, class/pending marker, selected predicate chips, relation count.
- [x] Dragging a card between columns updates the grouped predicate in local prototype state.
- [x] Locked vocab mode may show proposal/status cards but must not mutate canonical vocab.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Manually verify drag between columns and return to table without losing table scope.
- [ ] Commit Kanban separately.

## Task 7: Implement Whiteboard View

**Files:**
- Create: `apps/prototype/src/files/StructuredWhiteboardView.tsx`
- Modify: `apps/prototype/src/files/files-model.ts`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`
- Modify: `apps/prototype/src/prototype.css`
- Modify: `apps/prototype/package.json`

- [x] Keep Whiteboard phase 1 dependency-free after tldraw runtime errors in the prototype dev server; revisit tldraw/Excalidraw/React Flow when the freeform canvas model is specified.
- [x] Render Whiteboard as a `+ View` option for structured resources.
- [x] Seed the board with selected subject cards only, not every triple.
- [x] Keep spatial layout as prototype board metadata: subject cards can be dragged, layout is keyed by class/predicate projection and subject, clamped to the board, mirrored into prototype `localStorage`, and verified across view switch and page reload.
- [x] Distinguish RDF relation lines from temporary visual lines in labels or styling.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Manually verify the canvas is nonblank, selected subject cards are visible, and switching back to table preserves scope.
- [ ] Commit Whiteboard separately.

## Task 8: Implement Subject Routing and Source-Linked Card State

**Files:**
- Modify: `apps/prototype/src/files/files-model.ts`
- Modify: `apps/prototype/src/files/StructuredTableView.tsx`
- Modify: `apps/prototype/src/files/FileEditorSheet.tsx`
- Modify: `apps/prototype/src/files/FilesWorkspace.tsx`

- [x] Add route targets for fragment subject, file resource, external IRI, vocab term, and source-linked card.
- [x] Single-click subject opens a compact peek with actions.
- [x] Double-click or explicit Open navigates according to target type.
- [x] Source-linked card shows original source, ingested blocks, ingest state, sync status, and review updates action.
- [x] Preserve prototype return context for table, class scope, active view, row, filters, and sort state.
- [x] Preserve production scroll position and cross-file navigation history once real routing replaces prototype sheets.
- [x] Run `yarn workspace @linx/prototype build`.

## Execution Checkpoint: 2026-06-16

Completed in the current prototype pass:

- [x] Added the first implementation dependencies: Tiptap, TanStack Table, and dnd-kit.
- [x] Replaced the editable Markdown detail body with a real Tiptap/ProseMirror editor sheet.
- [x] Added dnd-kit-backed Kanban cards with local reorder/move state.
- [x] Added projected Whiteboard seeded with subject card shapes and relation/layout lines.
- [x] Added a compact subject peek and verified that a file-resource subject can open the focused file detail sheet.
- [x] Added verified source-linked card and external URL subject Open routes.
- [x] Added the first `apps/prototype/src/files/` extraction boundary: shared Files types, Files model/sample data, and a `FilesWorkspace` shell entry.
- [x] Wired the first structured table toolbar actions with verification: Search filters rows, Sort reorders subjects, and predicate visibility hides columns.
- [x] Reworked Kanban to derive cards from subject rows and `udfs:reviewStatus`; drag updates the same local cell value the table reads.
- [x] Enriched Kanban cards with subject grouping, source-linked byline, class/pending marker, selected predicate chips, and relation action/count.
- [x] Reworked Kanban and Whiteboard to consume the shared structured projection, so search and predicate visibility propagate beyond Table.
- [x] Extracted Kanban into `apps/prototype/src/files/StructuredKanbanView.tsx`.
- [x] Extracted Whiteboard into `apps/prototype/src/files/StructuredWhiteboardView.tsx`; `main.tsx` now mounts it without carrying canvas engine details.
- [x] Extracted the Tiptap file/card detail sheet into `apps/prototype/src/files/FileEditorSheet.tsx` and shared `.meta`/Access UI into `apps/prototype/src/files/ResourceSidecars.tsx`.
- [x] Extracted Finder-like folder detail into `apps/prototype/src/files/FolderView.tsx`.
- [x] Extracted structured table, vocab table, class filter, view tabs, and Discover view into `apps/prototype/src/files/StructuredTableView.tsx`.
- [x] Extracted Files tree, regular file preview, right `.meta` drawer, and files-local UI chrome into `FilesList.tsx`, `RegularFileSurface.tsx`, `FilesDetail.tsx`, and `FilesChrome.tsx`, with `FilesModule.tsx` as the remaining orchestration boundary.
- [x] Split the remaining Files orchestration into `FilesMain.tsx`, `RegularFileMain.tsx`, and `StructuredRaw.tsx`; `FilesModule.tsx` is now a barrel export.
- [x] Moved structured table header, row cell, and add-row placeholder rendering onto TanStack Table header/cell APIs while preserving the Files selectors used by the browser verifier.
- [x] Added a shared structured projection helper so Discover, Kanban, Whiteboard, and Raw use the same class scope, search, sort, visible predicates, and cell overrides as Table.
- [x] Reworked Discover from a fixed sample list into a class-scoped subject/predicate exploration view with metrics and predicate chips.
- [x] Reworked Raw from hardcoded Turtle into class-scoped Turtle-like output derived from visible predicates and current cell overrides.
- [x] Extracted typed predicate cell rendering into `typed-cell-editors.tsx`, covering readonly vocab cells, inline text/date/number editing, checkbox toggles, relation/url popovers, and select/multi-select enum search/create menus.
- [x] Added verified subject Open routes for vocab terms and ordinary RDF fragment subjects, including term definition/shape usage and return-context preview sheets.
- [x] Added verified subject Resource action: a vocab term subject can open its containing `/.vocab/terms.ttl` resource from the compact peek.
- [x] Added verified direct-open subject interactions: single click keeps the compact peek, while Enter/Space and double-click open the resolved target directly.
- [x] Added durable parent-level last opened subject route state in `FilesMain`, exposed through `data-last-route-*` and verified after closing subject sheets.
- [x] Extended subject route state with row index, table scroll offset, resource destination, and row restoration after closing subject sheets. Browser verification confirms the originating row is restored and `.data -> .vocab` resource navigation records its destination.
- [x] Extended external URL subject detail to show Ingest manifest semantics: existing manifest reuse on matching hash, progressive ingest-on-read chunks, scheduled sync, and source lineage.
- [x] Added prototype Ingest manifest state keyed by source URL. Source-linked cards and external URL sheets now share read progress, manifest path, source hash, and sync state through prototype `localStorage`; browser verification covers read progress and page reload persistence.
- [x] Added interactive pending predicate approval in the definition menu: Approve removes the `*` while keeping the column, and Discard removes the pending draft column for the active class scope.
- [x] Lifted predicate proposal state from `StructuredTableView.tsx` to `FilesMain.tsx` so proposed predicates survive view switches and feed Discover, Kanban, Raw, and Whiteboard projections.
- [x] Added interactive pending enum option approval in cell menus: created options show `*`, Approve removes the pending marker, and Discard removes the proposed value from the current cell.
- [x] Added interactive pending class approval/discard handlers in the class definition menu. Browser verification covers approving `GrantPage*`; discard is wired to remove the proposed class from the menu and reset scope when needed.
- [x] Extracted prototype-local proposal helpers into `apps/prototype/src/files/files-proposals.ts` for class/predicate approve-discard, enum option cleanup, and source-linked accept/keep review snapshots.
- [x] Moved predicate proposal creation, predicate proposal URI generation, enum option proposal URI generation, and class-scoped proposal keys into `files-proposals.ts` to avoid cross-class state leakage.
- [x] Added `yarn workspace @linx/prototype verify:files:proposals` to lock proposal helper behavior without launching the browser.
- [x] Added prototype proposal resource records for source Accept/Keep, class approval/discard, predicate create/approve/discard, and enum option create/approve/discard, exposed under `/.data/proposals/*.ttl`-shaped URIs and verified in the browser flow.
- [x] Added browser verification for Access modal entry points from vocab, folder, and editable file detail contexts.
- [x] Wired editable file Favorite into the Favorites module state. Browser verification adds and removes `multi-channel-access.md` from the editor sheet and checks the Favorites feed updates.
- [x] Added a restricted resource state for `restricted.ttl`, with permission-denied copy, Request Access action, and Access modal verification.
- [x] Locked vocab registry view to Table so `/.vocab/terms.ttl` does not enter ordinary business Kanban/Whiteboard mutation flows.
- [x] Reworked Whiteboard to derive subject cards from the current class scope instead of a fixed demo seed; browser verification covers `GrantPage` subjects while excluding unrelated `Workspace` subjects.
- [x] Hardened predicate definition menu interactions by keeping header/menu elements out of the global floating-menu closer.
- [x] Added a source-linked card review panel backed by structured sample ingest metadata. It exposes source URL, ingest progress, pending source update count, protected local edit count, Accept Source, and Keep Local actions.
- [x] Lifted source-linked card review state to `FilesMain`, keyed by card path, so Accept/Keep decisions survive closing and reopening the editor sheet in the prototype session.
- [x] Added browser verification for both source-linked review branches: Accept Source in the main flow, and Keep Local Edits in an isolated browser context with page reload persistence.
- [x] Adjusted source-linked detail sheet layout to explicitly allocate header, editor, source review, and bottom `.meta` rows.
- [x] Completed the first Finder-like folder interaction pass: list/column/icon toggles, selected child preview, readonly image preview, and editable Markdown child opening the Tiptap sheet from inside the folder view.
- [x] Fixed folder Markdown child identity: each selected Markdown child now opens a detail sheet keyed by that child path instead of always reusing `multi-channel-access.md`.
- [x] Added prototype-local editable file content state in `PrototypeApp`, passed into Tiptap sheets by file path, so typed Markdown survives close/reopen within the current prototype session.
- [x] Added a compact file/card Properties panel to detail sheets, positioned between editor/source review and bottom `.meta`; status/tags reuse `TypedPredicateCell`, are keyed by file path in prototype-local state, and are verified across close/reopen.
- [x] Mirrored editable file content, file/card detail properties, and source-linked review state into prototype `localStorage`, with browser checks covering page reload persistence. This is a prototype bridge only; production persistence remains a Pod/model task.
- [x] Mirrored structured table working state into prototype `localStorage`: class approvals/discards, draft predicates, predicate approvals/discards, predicate visibility, and cell overrides. Browser verification now confirms a Kanban-driven table cell override survives page reload.
- [x] Wired source-linked card subject sheets into the same file content/property state callbacks as regular file sheets; browser verification edits a source-linked card property and confirms it survives page reload.
- [x] Added source-linked card property verification so the card sheet exposes source lineage alongside the source review controls and bottom `.meta`.
- [x] Added folder-child `.ttl` routing so a structured Turtle child opens the embedded structured table from the folder browser.
- [x] Extended `verify:files` to cover folder tree navigation, folder `.meta` open/close, editable document auto sheet with page `.meta` close, and image readonly preview without editor modal.
- [x] Extended `verify:files` with narrow/mobile checks for the Files tree, structured table shell, contained table horizontal scroll, and Tiptap sheet viewport fit at `390x844`.
- [x] Added `yarn workspace @linx/prototype verify:files` as a repeatable Playwright verification script.
- [x] Verified build, whitespace, and browser behavior: table open, subject peek, subject-to-detail, Tiptap typing, Kanban card count, whiteboard shape count, hidden generic style panel.

Remaining before this plan is fully complete:

- [x] Replace the prototype-only subject route previews with production navigation state backed by the real router/search stack. Current checks verify durable parent route state for subject, kind, class, view, search, sort, row index, scroll offset, destination, and row restoration; production Files now mirrors subject resource opens into TanStack route search and restores them through the injected Files route bridge.
- [x] Add a typed route/search boundary for the production subject route. The TanStack `/$microAppId` route now validates Files structured subject search params through the Files route-state codec while preserving unrelated search params.
- [x] Replace the production Files-local `window.history` push/replace and `popstate` restore path with a TanStack `useNavigate` / `useSearch` bridge. The `/$microAppId` route now injects a typed Files route bridge into the Files panes; structured table subject opens and return-to-source clearing use that bridge in production, while browser-history helpers remain only as fallback for direct-render component tests.
- [x] Persist Ingest manifest state through the real Pod resource layer instead of prototype `localStorage`. Files now has a first-phase app-local `/.data/ingest/sources/{source}/manifest.ttl` Ingest manifest contract with create/reuse/replace, priority range queueing, and ETag-protected range-complete updates that move ranges from pending/priority to ingested without writing canonical card content. New `/.data/ingest` writes use `SourceIngestManifest` plus `ingest*` / `ingested*` predicates only; `/.data/index/sources/...`, `SourceIndex*`, and `parser*` / `parsed*` remain only legacy compatibility bridges for reading or old-resource maintenance.
- [ ] Promote the Ingest manifest contract into `@undefineds.co/models` schema/repository once the shared Files vocab namespace is settled. Current audit: this is blocked in the app checkout because `packages/models` is not initialized and installed `@undefineds.co/models@0.2.39` does not expose the Ingest manifest/schema, `SourceLinkedCard`, `bodyResource`, Ingest lineage predicates, range/queue predicates, or matching repositories. Legacy `parserManifest` / `parserVersion` support should remain a read-only compatibility alias, not a new shared writer contract. The next implementation step belongs in the models submodule/release, not as another app-local schema.
- [x] Persist editable file bodies through the real Pod resource layer instead of `PrototypeApp` in-memory `fileContentsByPath`. Production Files reads full raw resources with ETag, saves Markdown rich-editor and raw-source edits through authenticated `PUT` + `If-Match`, reloads the resource after save, and keeps `fileContentsByPath` confined to prototype-local storage.
- [x] Add the first production RDF-backed detail property panel for source-linked cards. The file detail sheet now stages title, tags, reviewStatus, and body relation changes through structured cell proposals instead of writing prototype-local property state or canonical card resources directly.
- [x] Extend the production RDF-backed detail property panel to ordinary editable files. The sheet now hydrates title, tags, reviewStatus, and source relation from the file `.meta` sidecar `#meta` subject and stages changes back through structured cell proposals, while rich body content still uses the existing ETag-protected raw resource save path.
- [ ] Promote the predicate/value helpers for detail sheets into `@undefineds.co/models` instead of keeping Files-local predicate strings. Current audit confirms `@undefineds.co/models@0.2.39` exposes generic `UDFS` / `DCTerms` / `RDFS` helpers and shared approval/inbox resources, but not Files-specific constants for `SourceLinkedCard`, `reviewStatus`, `tags`, `bodyResource`, Ingest lineage, or structured cell/source proposal terms. Smallest future step after submodule checkout is a constants/vocab-only models patch before moving app imports; legacy parser predicate aliases should stay in compatibility readers only.
- [x] Replace the prototype proposal resource log in production flows with real Pod proposal TTL resources plus shared Inbox approval records. Vocab/source/access/AI/cell proposals now persist under `/.data/proposals/{domain}/...`, mirror to `approvalResource`/Inbox, apply approved changes through the domain-specific publisher, and mark proposal TTL `udfs:status` as approved/rejected when the Inbox decision resolves.
- [ ] Promote Files proposal TTL resources into shared `@undefineds.co/models` proposal schemas once the Files vocab/model release is available.
- [x] Add explicit vocab publish write-permission preflight before applying approved vocab proposals. The approval path now HEAD-checks `.vocab/terms.ttl`, `.vocab/shapes.ttl`, and `.vocab/namespaces.ttl` before mutating canonical resources; 401/403 or a WAC-Allow user mode without `write/control` aborts the Inbox resolve before approval/proposal status changes, while missing resources may still be bootstrapped and providers without WAC-Allow are not hard-failed.
- [x] Generalize the right `.meta` drawer beyond the current Files-specific `FilesDetail.tsx` implementation. The reusable UI-only `SidecarDrawer` shell now owns the right-edge overlay chrome, title, scroll region, and close action; Files keeps a thin `ResourceMetaDrawer` adapter for `.meta` fetching and rendering.
- [x] Add source-linked card Ingest state and approval/review action details to the editor sheet.
- [x] Persist source-linked card approval/review state across sheet close/reopen in prototype-local Files state.
- [x] Verify subject-to-file jump and prototype return context with `yarn workspace @linx/prototype verify:files`.
- [x] Add real Pod smoke coverage for ordinary editable file bottom `.meta`: the e2e seeds a Markdown resource plus `.md.meta` via authenticated SPARQL PATCH and verifies the sheet tail renders source/link/vocab/shape metadata from real Pod bytes.
- [x] Add real Pod smoke coverage for Finder-style folder detail child creation. The e2e opens a real folder detail, creates a child folder from the UI, verifies the Pod resource exists, and verifies the UI switches to the new folder detail; production folder creation now falls back from browser-blocked/unsupported `MKCOL` to LDP `POST + ldp:BasicContainer`.
- [x] Add real Pod smoke coverage for folder uploads. The folder e2e now uploads both Markdown text and binary PNG files through the folder toolbar, then reads the uploaded resources back with authenticated fetch to verify status, content type, and bytes/content.
- [x] Add folder selected-child Access entry. Folder-level Access remains scoped to the current container, while the lightweight selected-child preview exposes its own Access action that targets the child resource `.acl` / `.acr` candidates without changing the global folder selection.
- [x] Harden copy/move fallback for Solid Pods that return unsupported WebDAV responses. `COPY` / `MOVE` now fall back to GET + PUT (+ DELETE for move) on HTTP 405/501 as well as browser-blocked TypeError, while 409/412 still report destination conflicts. The fallback also copies the source resource `.meta` sidecar via SPARQL PATCH, rewrites owner-subject triples to the destination resource, skips system-derived metadata such as size/mtime/format, and deletes the source `.meta` after successful move. Real Pod smoke coverage intercepts `COPY` 405 and `MOVE` 501 while allowing fallback GET/PUT/DELETE/PATCH/DELETE-sidecar to hit xpod.
- [x] Tighten Finder-like folder operation sheets. Copy now defaults to a sibling-safe `name copy.ext`, copy/move accept relative target paths such as `diagram copy.png` or `archive/`, and the UI blocks unchanged targets, same-folder name conflicts, cross-Pod absolute targets, path escapes, and create/rename path-like names before sending Pod mutations.
- [x] Tighten Chat Files data boundaries. Chat file projection now keeps `聊天引用` / `运行产物` as provenance labels instead of resource tags, so tag filters only consume real metadata tags. Active threads without a workspace URI still show explicit `richContent` file/artifact records, but do not recursively scan Pod root.
- [x] Add real Pod smoke coverage for folder detail Markdown creation. The e2e opens a real folder, uses the folder toolbar `新建 Markdown 文件` action, and verifies the created resource has `text/markdown` content with the default title body.
- [x] Add real Pod smoke coverage for URL source ingest approval closure. The e2e ingests a fetchable URL as a `SourceLinkedCard`, reads the actual Ingest proposal TTL and Ingest manifest/body links from the Pod, approves the mirrored Inbox approval, verifies the proposal TTL becomes approved, and verifies the card descriptor plus source links remain intact. Legacy `parserManifest` remains readable for old resources, but new descriptor/proposal writes use only `ingestManifest` / `ingestVersion`. Production Ingest proposal parsing and proposal-status writes now tolerate Pod-expanded absolute predicate IRIs as well as compact `udfs:` / `dcterms:` Turtle.
- [x] Generalize app-local Files proposal RDF parsing for Pod-expanded predicates. Source, access, AI change, and structured cell proposal parsers now share one compact/expanded predicate reader so Inbox approval works whether a provider preserves `udfs:` / `dcterms:` prefixes or returns absolute predicate IRIs; focused tests cover each proposal domain plus proposal status updates.
- [x] Add real Pod smoke coverage for structured cell approval closure. The e2e now stages a `.data` Turtle title edit, reads the real `/.data/proposals/cell/*.ttl` proposal, approves it through Inbox, verifies canonical `.ttl` contains the approved value, and verifies the proposal TTL is marked approved. The canonical patcher now supports provider-expanded N-Triples/full IRI subject and predicate tokens without falling back to lossy table reserialization.
- [x] Extend source-linked card real Pod smoke coverage through refresh. The URL import e2e now changes the upstream URL body, clicks `刷新来源`, verifies the Ingest manifest update and a new immutable Ingest proposal while the canonical body still contains the previous approved content, asserts the old proposal TTL is not overwritten, then approves the refreshed proposal through Inbox and verifies the body switches to the refreshed indexed content without importing navigation/aside noise.
- [x] Add the first non-URL source refresh Ingest adapter boundary. PDF-style source resources now refresh through authenticated `session.fetch`, compute a stable source hash from bytes, update the Ingest manifest and create a new Ingest proposal, and leave canonical card/body resources unchanged until approval; detailed PDF/DOC/PPT extraction remains a worker/model follow-up.
- [x] Align relation-cell opening with subject opening. Same-document fragment relations continue to open subject preview; cross-resource fragment targets such as `/.vocab/terms.ttl#tags` open the term definition card first, with explicit navigation to the containing resource file.
- [x] Add the first durable Whiteboard visual relation boundary. Structured view metadata now round-trips `udfs:whiteboardVisualRelation` in `.meta`, hydrates it into Files UI state, projects visual lines separately from RDF-derived relation lines, and PATCHes only the `<#view>` block without writing canonical `.ttl` data.
- [x] Add Whiteboard temporary visual relation editing. Users can create a non-RDF visual relation between selected board subjects, edit its label by stable id, remove the visual relation independently, and persist only `whiteboard.visualRelations` through structured view metadata; removing/clearing board subjects also removes affected visual edges.
- [x] Add RichText paste sanitization coverage and handling. Editable Tiptap sheets now intercept HTML paste through a safe plain-text path before Markdown save, preventing script/event/javascript URL fragments from becoming persisted note content.
- [x] Add RichText undo-to-baseline coverage and handling. Editable Tiptap sheets now keep the initial source text as the save baseline, so undoing a transient edit back to the original Markdown clears dirty state without issuing a no-op raw resource save.
- [x] Tighten RichText note-taking interaction semantics. Tiptap sheets now derive dirty state from serialized Markdown so undo immediately restores the saved indicator, redo persists the redone Markdown on blur, undo/redo buttons expose real availability, slash block commands support keyboard active-descendant selection, unimplemented drag handles are disabled, and the rich/raw file detail switch exposes the active mode with `aria-pressed`.
- [ ] Commit routing separately.

## Task 9: Visual Verification

**Files:**
- Modify: `docs/prototype/visual-verification-report.md`
- Create or update: `docs/prototype/assets/*.png`

- [x] Start the prototype dev server: `yarn workspace @linx/prototype dev --port 5871`.
- [x] Capture screenshots for `.data` table, `.vocab` locked registry, folder detail, editable file sheet, readonly preview, Kanban, Whiteboard, Access modal, bottom `.meta`.
- [x] Verify desktop viewport `1440x900`.
- [x] Verify mobile or narrow viewport for no text overlap in toolbar and sheet.
- [x] Run `yarn workspace @linx/prototype build`.
- [x] Run `git diff --check`.
- [x] Stop the dev server.
- [ ] Commit verification assets/report separately.

## Self-Review Notes

- The plan covers the accepted decisions: scattered independent cards, chunked/two-newline blocks, unified approval/proposal model, vocab/type-index open questions, macOS sheet editor, Tiptap, Kanban, and Whiteboard.
- Remaining unresolved design items stay in the spec Open Decisions and should not block the prototype implementation.
- Do not add shared durable RDF schemas in `apps/prototype`; production shared schema work must happen in `@undefineds.co/models`.
