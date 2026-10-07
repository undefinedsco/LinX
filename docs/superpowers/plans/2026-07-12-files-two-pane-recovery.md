# Files Two-Pane Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanent Files tree/list/detail stack with a responsive two-pane browser, bounded progressive Pod loading, usable folder history, and destination-aware local/web import.

**Architecture:** The Shell owns one Files list pane and one Files content pane. `FilesListPane` becomes the browser owner for current path, invoked tree, history, search, filters, and add/import actions; `FilesWorkspacePane` renders only detail on desktop and retains compact list/detail switching. Data queries return minimal root/current-folder structure first and move statistics/metadata behind independent queries.

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Query/Table, Radix/shadcn primitives, Vitest/Testing Library, Playwright/Electron.

---

### Task 1: Establish the two-pane Shell contract

**Files:**
- Modify: `apps/web/src/modules/layout/micro-app-registry.tsx`
- Modify: `apps/web/src/modules/layout/PrimaryLayout.test.tsx`
- Modify: `apps/web/src/modules/files/app/FilesWorkspacePane.tsx`
- Modify: `apps/web/src/modules/files/components/FilesWorkspacePane.test.tsx`
- Modify: `apps/web/src/modules/files/features/list/FilesListPane.tsx`

- [ ] **Step 1: Write failing composition tests**

Assert `files.ListPane` resolves to `FilesListPane`, desktop `FilesWorkspacePane` contains no nested file list, and the rendered desktop surface has exactly two persistent Files sections after the global rail.

```ts
expect(microAppRegistry.files.ListPane).toBe(FilesListPane)
expect(screen.queryAllByLabelText('文件列表')).toHaveLength(1)
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `yarn workspace @linx/web vitest run src/modules/layout/PrimaryLayout.test.tsx src/modules/files/components/FilesWorkspacePane.test.tsx`

Expected: FAIL because the registry still uses `FilesTreePane` and workspace nests list/detail.

- [ ] **Step 3: Recompose desktop and retain compact behavior**

Set the desktop list slot to `FilesListPane`. Make `FilesWorkspacePane` render `FileDetailPane` only at `md+`; below `md`, preserve the existing list/detail switch and tree sheet. Keep the tree component available only through invoked overlay paths.

- [ ] **Step 4: Run composition tests**

Run the same command. Expected: PASS.

### Task 2: Add current-folder history, path, and folder overview

**Files:**
- Modify: `apps/web/src/modules/files/app/store.ts`
- Modify: `apps/web/src/modules/files/store.test.ts`
- Create: `apps/web/src/modules/files/domain/list/folder-history.ts`
- Create: `apps/web/src/modules/files/domain/list/folder-history.test.ts`
- Modify: `apps/web/src/modules/files/features/list/useFilesListPaneController.ts`
- Modify: `apps/web/src/modules/files/features/list/FilesListPane.tsx`
- Modify: `apps/web/src/modules/files/features/detail/FileDetailPane.tsx`
- Modify: `apps/web/src/modules/files/components/FileDetailPane.test.tsx`

- [ ] **Step 1: Write failing history and overview tests**

Cover push-on-open, back restoration, account/reset clearing, current path projection, and a current-folder overview when `selectedFileId` is null.

```ts
expect(projectFolderBack(history)).toEqual({ targetNodeId: parentId, restoreSelectionId: folderUri })
```

- [ ] **Step 2: Confirm failure**

Run: `yarn workspace @linx/web vitest run src/modules/files/domain/list/folder-history.test.ts src/modules/files/store.test.ts src/modules/files/components/FileDetailPane.test.tsx`

Expected: FAIL because the store has no browser history and detail is empty.

- [ ] **Step 3: Implement one history container and list-head path UI**

Store a bounded array of `{ treeNodeId, selectedFileId, scrollKey }`, push only on explicit folder entry, and expose `goBackFolder`. Render an icon back button plus compact current path in the list head. Folder single-click continues to preview; double-click/Enter enters.

- [ ] **Step 4: Project current-folder detail**

When no child is selected, `FileDetailPane` consumes the selected container/current entries and renders name, path, count, modified summary, and add/upload actions instead of a blank prompt.

- [ ] **Step 5: Run focused Files tests**

Run the command from Step 2. Expected: PASS.

### Task 3: Make root and container reads bounded and progressive

**Files:**
- Create: `apps/web/src/modules/files/data/pod-adapter/pod-request-boundary.ts`
- Create: `apps/web/src/modules/files/data/pod-adapter/pod-request-boundary.test.ts`
- Modify: `apps/web/src/modules/files/data/pod-adapter/index.ts`
- Modify: `apps/web/src/modules/files/data/collections/resource-query-collection.ts`
- Modify: `apps/web/src/modules/files/data/queries/resource-queries.ts`
- Modify: `apps/web/src/modules/files/data/pod-adapter/index.test.ts`
- Modify: `apps/web/src/providers/query-provider.tsx`

- [ ] **Step 1: Write failing timeout and progressive-root tests**

Use a never-resolving fetch/list promise. Assert the visible root/current-folder result resolves without recursive Recent scanning and that timeout errors preserve a typed `forbidden`, `timeout`, or `offline` category.

```ts
await expect(withPodRequestBoundary(() => never, { timeoutMs: 2_500, signal }))
  .rejects.toMatchObject({ kind: 'timeout' })
```

- [ ] **Step 2: Confirm failure**

Run: `yarn workspace @linx/web vitest run src/modules/files/data/pod-adapter/pod-request-boundary.test.ts src/modules/files/data/pod-adapter/index.test.ts`

Expected: FAIL because root building currently awaits recursive scanning and has no abort boundary.

- [ ] **Step 3: Implement minimum root projection**

Return Pod root and current direct children first. Move Recent count, optional control-container probes, tags, and per-resource metadata into independent lazy queries/cache enrichment. Pass TanStack `signal` into query functions and avoid retry for 401/403.

- [ ] **Step 4: Render operation-specific errors and retry**

Ensure tree/list/detail projectors distinguish timeout, forbidden, offline, empty, and ready-with-stale-cache. A settled failure cannot remain `loading`.

- [ ] **Step 5: Run Files data/query tests**

Run:

```bash
yarn workspace @linx/web vitest run src/modules/files/data src/modules/files/components/FilesTreePane.test.tsx src/modules/files/components/FilesListPane.test.tsx
```

Expected: PASS.

### Task 4: Replace the duplicate Files shortcut with contextual scope

**Files:**
- Modify: `apps/web/src/modules/layout/micro-app-registry.tsx`
- Modify: `apps/web/src/modules/layout/PrimaryLayout.tsx`
- Modify: `apps/web/src/modules/layout/PrimaryLayout.test.tsx`
- Modify: `apps/web/src/modules/files/features/list/FilesListPane.tsx`
- Modify: `apps/web/src/modules/files/features/list/useFilesListPaneController.ts`

- [ ] **Step 1: Add a failing single-entry test**

Assert one folder-shaped global navigation action and a Files scope action for `全部文件 / 最近 / 聊天文件` inside the browser head.

- [ ] **Step 2: Remove the rail shortcut and preserve navigation intent**

Delete `chat-files` from `microAppShortcuts`. Route contextual Chat actions to Files with `entryScope='chat-files'`, and expose the same scope from the Files browser menu.

- [ ] **Step 3: Run Shell and Files navigation tests**

Run: `yarn workspace @linx/web vitest run src/modules/layout/PrimaryLayout.test.tsx src/modules/files/store.test.ts src/modules/files/components/FilesListPane.test.tsx`

Expected: PASS.

### Task 5: Add destination-aware create/upload actions

**Files:**
- Create: `apps/web/src/modules/files/domain/list/files-add-menu-model.ts`
- Create: `apps/web/src/modules/files/domain/list/files-add-menu-model.test.ts`
- Create: `apps/web/src/modules/files/features/list/FilesAddMenu.tsx`
- Create: `apps/web/src/modules/files/features/list/FilesAddMenu.test.tsx`
- Modify: `apps/web/src/modules/files/features/folder/useFolderDetailUploadController.ts`
- Modify: `apps/web/src/modules/files/domain/folder/folder-upload-model.ts`
- Modify: `apps/web/src/modules/files/features/ingest/source-ingest-toolbar-model.ts`
- Modify: `apps/web/src/modules/files/features/ingest/SourceIngestAction.tsx`
- Modify: `apps/web/src/modules/files/components/FilesListPane.test.tsx`

- [ ] **Step 1: Write failing menu and hierarchy tests**

Assert the five user operations, current destination label, disabled reason when not writable, file upload, folder upload using `webkitRelativePath`, conflict-safe container creation, and absence of `创建 Ingest 卡片`.

- [ ] **Step 2: Confirm failure**

Run: `yarn workspace @linx/web vitest run src/modules/files/domain/list/files-add-menu-model.test.ts src/modules/files/features/list/FilesAddMenu.test.tsx src/modules/files/components/FilesListPane.test.tsx`

Expected: FAIL because the list only exposes Source Ingest.

- [ ] **Step 3: Implement the add menu and hidden native inputs**

Use `input[type=file]` for files and `input[type=file][webkitdirectory]` for folders so Electron/Chromium opens the platform picker. Reuse the folder upload mutation with current container URI and preserve relative path segments by creating missing containers before file writes.

- [ ] **Step 4: Rename the web source command**

Display `添加网页` and `正在添加...`; keep Ingest wording only in resulting source status/detail. Do not rename RDF/storage implementation types.

- [ ] **Step 5: Run Files feature tests**

Run: `yarn workspace @linx/web vitest run src/modules/files`

Expected: PASS.

### Task 6: Verify desktop workflow

**Files:**
- Create: `tests/e2e/specs/files-two-pane-desktop.spec.ts`
- Modify: `tests/e2e/package.json` only if a focused script is already the repository pattern

- [ ] **Step 1: Cover pane count, folder history, errors, and import copy**

Assert one Files rail entry, two persistent panes, invoked tree overlay, folder open/back/path, nonblank folder overview, current destination in add menu, file/folder picker controls, and no `创建 Ingest 卡片` text.

- [ ] **Step 2: Run unit, E2E, lint, typecheck, and builds**

Run:

```bash
yarn workspace @linx/web vitest run src/modules/files src/modules/layout/PrimaryLayout.test.tsx
yarn workspace @linx/web lint
yarn workspace @linx/web tsc --noEmit
yarn workspace @linx/web build:check
yarn workspace @linx/desktop build
```

Expected: all PASS; only documented upstream bundle warnings remain.
