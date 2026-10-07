# Files Explorer Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace folder page navigation in the Files list pane with a compact, lazy, accessible explorer tree.

**Architecture:** Add a pure flattened-tree projection in the list domain and a feature controller that owns expansion while delegating Pod reads to existing query hooks. Render a compact tree UI in `FilesListPane`; keep file opening and resource operations on existing controllers.

**Tech Stack:** React, Zustand, TanStack Query, Vitest, Testing Library, Tailwind CSS.

---

### Task 1: Lock the explorer interaction contract

**Files:**
- Modify: `apps/web/src/modules/files/components/FilesListPane.test.tsx`
- Modify: `apps/web/src/modules/files/features/list/useFilesListPaneController.test.tsx`
- Modify: `apps/web/src/modules/files/components/FilesWorkspacePane.test.tsx`

- [ ] Add failing tests proving folders expand inline, file selection opens detail, no back control is rendered, rows use tree semantics, and the list pane uses the compact width contract.
- [ ] Run `yarn workspace @linx/web vitest run src/modules/files/components/FilesListPane.test.tsx src/modules/files/features/list/useFilesListPaneController.test.tsx src/modules/files/components/FilesWorkspacePane.test.tsx` and confirm the new assertions fail for the old page-navigation UI.

### Task 2: Add lazy explorer state and projection

**Files:**
- Create: `apps/web/src/modules/files/domain/list/explorer-tree-model.ts`
- Create: `apps/web/src/modules/files/domain/list/explorer-tree-model.test.ts`
- Create: `apps/web/src/modules/files/features/list/useFilesExplorerController.ts`
- Create: `apps/web/src/modules/files/features/list/useFilesExplorerController.test.tsx`
- Modify: `apps/web/src/modules/files/features/list/useFilesListPaneController.ts`

- [ ] Implement pure rows with `uri`, `depth`, `expanded`, `expandable`, and retained ancestors for search matches.
- [ ] Implement expansion state that invokes existing container-entry queries only for expanded URIs and does not call `enterFolder` or mutate folder history.
- [ ] Cover lazy reads, collapse/re-expand cache behavior, inline errors, and keyboard state with focused tests.

### Task 3: Render the compact explorer

**Files:**
- Create: `apps/web/src/modules/files/ui/FilesExplorerRow.tsx`
- Create: `apps/web/src/modules/files/ui/FilesExplorerRow.test.tsx`
- Modify: `apps/web/src/modules/files/features/list/FilesListPane.tsx`
- Modify: `apps/web/src/modules/files/app/FilesWorkspacePane.tsx`

- [ ] Replace large list rows, path strip, and back action with 28px tree rows and disclosure controls.
- [ ] Preserve context-menu operations, multiselect, file detail/sheet opening, search, create, and sort actions.
- [ ] Set the desktop list pane default near 240px with 200–320px resize bounds; retain the existing mobile sheet behavior.
- [ ] Run the targeted tests and `yarn workspace @linx/web build:check` until green.

### Task 4: Verify the complete Files path

**Files:**
- Modify only if verification exposes a regression in the files listed above.

- [ ] Run `yarn workspace @linx/web vitest run src/modules/files/features/list src/modules/files/components/FilesListPane.test.tsx src/modules/files/components/FilesWorkspacePane.test.tsx`.
- [ ] Run `yarn workspace @linx/web build:check` and `git diff --check`.
- [ ] Walk root load, nested expansion, collapse, file open, editable sheet, search, inline error, keyboard navigation, create/upload, and context actions against the running Web app.

