# Files Prototype Shell Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production Files use the approved compact resource-tree/workspace shell, shared resource opening semantics, and a single centered document editor while retaining real Pod, optimistic collection, approval, and structured-data behavior.

**Architecture:** Keep data access and optimistic state in existing feature controllers. Introduce data-agnostic View-bar and document-modal UI boundaries, then adapt folder, ordinary-file, and structured-resource feature containers to those boundaries. The resource tree owns hierarchy and row actions; the workspace owns selected-resource preview and return context.

**Tech Stack:** React, TypeScript, Zustand, Radix UI, Lucide, TanStack Table, Tiptap, Vitest, Testing Library, Playwright/agent-browser visual verification.

---

### Task 1: Lock the shell and resource-opening contract

**Files:**
- Modify: `apps/web/src/modules/files/app/files-app.architecture.test.ts`
- Modify: `apps/web/src/modules/files/components/FilesListPane.test.tsx`
- Modify: `apps/web/src/modules/files/components/FileDetailPane.test.tsx`
- Modify: `apps/web/src/modules/files/components/FilesTreePane.test.tsx`

- [ ] **Step 1: Add failing architecture assertions**

Assert that desktop Files renders one resource tree beside one workspace, uses a selected-resource page title, and does not mount a third persistent preview/list pane.

- [ ] **Step 2: Add failing opening interaction tests**

Cover single-click preview, double-click/Enter editor opening, folder-row selection, and return-context preservation.

- [ ] **Step 3: Run the focused tests and confirm the new assertions fail**

Run: `yarn workspace @linx/web vitest run src/modules/files/app/files-app.architecture.test.ts src/modules/files/components/FilesListPane.test.tsx src/modules/files/components/FilesTreePane.test.tsx src/modules/files/components/FileDetailPane.test.tsx`

Expected: failures identify the current shell/opening mismatches rather than unrelated runtime errors.

- [ ] **Step 4: Keep the tests as the contract for Tasks 2-5**

Do not weaken existing Pod, optimistic update, approval, or type-driven editing assertions.

### Task 2: Align the desktop shell and resource tree

**Files:**
- Modify: `apps/web/src/modules/files/app/FilesWorkspacePane.tsx`
- Modify: `apps/web/src/modules/files/features/list/FilesListPane.tsx`
- Modify: `apps/web/src/modules/files/features/tree/FilesTreePane.tsx`
- Modify: `apps/web/src/modules/files/ui/FilesExplorerRow.tsx`
- Modify: `apps/web/src/modules/files/app/store.ts`
- Test: `apps/web/src/modules/files/components/FilesListPane.test.tsx`
- Test: `apps/web/src/modules/files/components/FilesTreePane.test.tsx`

- [ ] **Step 1: Make desktop layout rail-adjacent tree plus workspace**

Render the expandable resource tree in the left Files pane and the selected resource in the right workspace. Preserve the compact tree drawer as the same tree component.

- [ ] **Step 2: Add bounded width persistence**

Store a tree width clamped to `232..360` pixels, expose a separator drag target with keyboard accessibility, and restore the persisted width without introducing a second layout store.

- [ ] **Step 3: Align the 48px heads and dynamic title**

Use the selected resource display name as the workspace title and keep global notification/theme controls outside resource-level actions.

- [ ] **Step 4: Keep tree rows at 28px with contextual actions**

Show Favorite and More only on hover, focus, menu-open, or selected state; use one quiet selected background and preserve roving focus/disclosure semantics.

- [ ] **Step 5: Run shell/tree tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/components/FilesListPane.test.tsx src/modules/files/components/FilesTreePane.test.tsx src/modules/files/app/files-app.architecture.test.ts`

Expected: all tests pass.

### Task 3: Introduce shared compact View bar and remove Folder Columns

**Files:**
- Create: `apps/web/src/modules/files/ui/ResourceViewBar.tsx`
- Create: `apps/web/src/modules/files/ui/resource-view-bar-model.ts`
- Create: `apps/web/src/modules/files/ui/ResourceViewBar.test.tsx`
- Modify: `apps/web/src/modules/files/features/folder/FolderDetailPreview.tsx`
- Modify: `apps/web/src/modules/files/features/folder/FolderDetailChildViews.tsx`
- Modify: `apps/web/src/modules/files/features/folder/useFolderDetailViewController.ts`
- Modify: `apps/web/src/modules/files/features/structured/StructuredResourceToolbar.tsx`
- Modify: `apps/web/src/modules/files/domain/structured/structured-view-metadata.ts`
- Test: `apps/web/src/modules/files/components/FolderDetailPreview.architecture.test.ts`
- Test: `apps/web/src/modules/files/components/StructuredResourceToolbar.architecture.test.ts`

- [ ] **Step 1: Test the data-agnostic View bar**

Require one desktop row with existing views on the left, one trailing Add View control, and supplied compact action slots on the right.

- [ ] **Step 2: Implement `ResourceViewBar`**

Accept view descriptors, active id, selection callback, add callback, and a right-actions slot. Use familiar Lucide icons, accessible names, and tooltips without business-data imports.

- [ ] **Step 3: Restrict folder projections to List and Grid**

Remove the Columns option, state branch, and rendered column workspace while preserving folder operations, sorting, selection, upload, and empty-state creation.

- [ ] **Step 4: Adapt structured projections to the shared bar**

Expose Table, Kanban, Whiteboard, and Raw as peer projections; keep Class, search, filter, and sort in the compact right slot. Keep one trailing `+` rather than separate Add View labels/buttons.

- [ ] **Step 5: Run view-bar, folder, and structured toolbar tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/ui/ResourceViewBar.test.tsx src/modules/files/components/FolderDetailPreview.architecture.test.ts src/modules/files/components/StructuredResourceToolbar.architecture.test.ts`

Expected: all tests pass and no folder Columns assertion remains.

### Task 4: Unify ordinary-file preview and centered document editing

**Files:**
- Create: `apps/web/src/modules/files/features/editor/DocumentEditorModal.tsx`
- Create: `apps/web/src/modules/files/features/editor/document-editor-modal-model.ts`
- Create: `apps/web/src/modules/files/components/DocumentEditorModal.test.tsx`
- Modify: `apps/web/src/modules/files/features/detail/FileDetailPreview.tsx`
- Modify: `apps/web/src/modules/files/features/detail/FileDetailPane.tsx`
- Modify: `apps/web/src/modules/files/features/editor/FileEditorSheet.tsx`
- Modify: `apps/web/src/modules/files/features/editor/FileEditorSheetMetaTail.tsx`
- Modify: `apps/web/src/modules/files/features/editor/useFileEditorSheetController.ts`
- Modify: `apps/web/src/modules/files/features/folder/useFolderDetailNavigationController.ts`
- Test: `apps/web/src/modules/files/components/FileDetailPane.test.tsx`
- Test: `apps/web/src/modules/files/components/FileEditorSheet.architecture.test.ts`

- [ ] **Step 1: Test modal reuse and read-only preview behavior**

Assert that workspace preview renders title/body/basic facts without editor or eager `.meta`, and tree/folder explicit edit opens the same modal implementation.

- [ ] **Step 2: Implement `DocumentEditorModal` as the canonical surface**

Use a large centered Radix dialog constrained to the content viewport. Render editable title, Tiptap body, low-chrome contextual tools, compact Source/Access controls, and `.meta` at the document tail.

- [ ] **Step 3: Preserve compatibility without a second editor**

Make legacy `FileEditorSheet` imports re-export or delegate to `DocumentEditorModal`; do not retain separate sheet markup or state behavior.

- [ ] **Step 4: Restore origin context on close**

Capture tree/folder origin, selected resource, workspace scroll, and structured origin before opening. Restore them after closing without issuing another blocking read.

- [ ] **Step 5: Run editor and detail tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/components/DocumentEditorModal.test.tsx src/modules/files/components/FileDetailPane.test.tsx src/modules/files/components/FileDetailPane.rich-save.test.tsx src/modules/files/components/FileEditorSheet.architecture.test.ts`

Expected: all tests pass; legacy architecture assertions confirm one implementation.

### Task 5: Reuse preview/editor for structured subject links

**Files:**
- Modify: `apps/web/src/modules/files/features/structured/StructuredResourcePreview.tsx`
- Modify: `apps/web/src/modules/files/features/structured/useStructuredResourcePreviewController.ts`
- Modify: `apps/web/src/modules/files/features/structured/StructuredProjectionTable.tsx`
- Modify: `apps/web/src/modules/files/app/route-state.ts`
- Modify: `apps/web/src/modules/files/app/store.ts`
- Test: `apps/web/src/modules/files/features/structured/useStructuredResourcePreviewController.test.tsx`
- Test: `apps/web/src/modules/files/components/StructuredProjectionTable.test.tsx`
- Test: `apps/web/src/modules/files/components/FileDetailPane.test.tsx`

- [ ] **Step 1: Add failing local-subject peek tests**

Verify that a subject resolving to a local file opens the shared read-only preview first and preserves projection, class, filters, sort, columns, subject, and scroll.

- [ ] **Step 2: Route subject Edit to `DocumentEditorModal`**

Reuse the same modal and controller as tree/folder entry points; do not introduce a structured-only editor.

- [ ] **Step 3: Restore structured return context**

On preview or modal close, restore the exact structured workspace state and focused subject without resetting view metadata.

- [ ] **Step 4: Run structured subject tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/features/structured/useStructuredResourcePreviewController.test.tsx src/modules/files/components/StructuredProjectionTable.test.tsx src/modules/files/components/FileDetailPane.test.tsx`

Expected: all tests pass.

### Task 6: Tune table density and stable loading/error behavior

**Files:**
- Modify: `apps/web/src/modules/files/features/structured/StructuredProjectionTable.tsx`
- Modify: `apps/web/src/modules/files/features/structured/StructuredTableCell.tsx`
- Modify: `apps/web/src/modules/files/features/detail/FileDetailPane.tsx`
- Modify: `apps/web/src/modules/files/features/detail/FileDetailPreview.tsx`
- Modify: `apps/web/src/modules/files/features/list/useFilesListPaneController.ts`
- Test: `apps/web/src/modules/files/components/StructuredProjectionTable.test.tsx`
- Test: `apps/web/src/modules/files/components/FileDetailPane.test.tsx`
- Test: `apps/web/src/modules/files/features/list/useFilesListPaneController.test.tsx`

- [ ] **Step 1: Add density and loading regression tests**

Cover subject/predicates/+ order, approximately 32px rows, resize handles, whole-cell editing, pending marker, cached snapshot display, local skeleton, and local retry.

- [ ] **Step 2: Apply compact table chrome**

Keep type-specific editors and approvals unchanged while reducing row padding, separator contrast, and redundant buttons.

- [ ] **Step 3: Keep destination layout mounted during revalidation**

Render cached/root snapshot data first, overlay local loading state, and attach errors/retry to the affected row or workspace surface instead of clearing Files.

- [ ] **Step 4: Confirm workspace previews do not eagerly fetch `.meta`**

Only load `.meta` when the user opens Info or when the document modal tail becomes visible/required.

- [ ] **Step 5: Run focused data and table tests**

Run: `yarn workspace @linx/web vitest run src/modules/files/components/StructuredProjectionTable.test.tsx src/modules/files/components/FileDetailPane.test.tsx src/modules/files/features/list/useFilesListPaneController.test.tsx`

Expected: all tests pass.

### Task 7: Verify the full product path visually and against a real Pod

**Files:**
- Modify: `tests/e2e/files-*.spec.ts`
- Modify: `apps/prototype/scripts/verify-files.mjs` only if the production-alignment assertions are shared there
- Create: `docs/prototype/files-verification/2026-07-20/` screenshots

- [ ] **Step 1: Run full Files unit/integration suite**

Run: `yarn workspace @linx/web vitest run src/modules/files`

Expected: all Files tests pass.

- [ ] **Step 2: Run type and production build checks**

Run: `yarn workspace @linx/web tsc --noEmit`

Run: `yarn workspace @linx/web build:check`

Expected: both exit successfully; pre-existing bundler warnings are recorded separately from failures.

- [ ] **Step 3: Walk desktop resource paths**

Capture folder List/Grid, ordinary preview, document modal with `.meta` tail, TTL Table/Kanban/Whiteboard/Raw, subject peek, and return context at a desktop viewport.

- [ ] **Step 4: Walk compact resource paths**

Verify the same tree opens in the drawer, closes on selection, controls collapse without overlap, and the document modal respects viewport/safe-area spacing.

- [ ] **Step 5: Walk a signed-in private Pod**

Verify cached listing, background revalidation, folder expansion, ordinary-file preview/edit/save, lazy `.meta`, Access dialog, structured view switching, subject peek, and error retry using real private resources.

- [ ] **Step 6: Review screenshots against the approved design**

Reject persistent third panes, generic workspace titles, two-row structured controls, folder Columns, visible always-on row actions, nested cards, or editor-sheet behavior.

