# Files Prototype Shell Alignment Design

- Status: Approved
- Date: 2026-07-20
- Scope: `apps/web/src/modules/files`
- Reference: `apps/prototype/src/files`, Heptabase, Finder, macOS document overlays

## Objective

Align the production Files module with the approved prototype's compact interaction shell without removing production capabilities such as real Pod data, optimistic collections, errors, approvals, Kanban, Whiteboard, access control, and sidecars.

The target is not a pixel-for-pixel prototype transplant. Production adopts the prototype's information hierarchy, density, and interaction grammar while retaining its stronger data and workflow model.

## Product Model

Files has three persistent desktop regions:

1. App rail.
2. Resizable resource tree.
3. Resource workspace.

There is no third persistent preview pane. A compact `.meta` drawer may cover the workspace below the page head when explicitly opened.

The resource workspace provides read-only browsing and preview. Full document editing is a modal overlay named `DocumentEditorModal`; it is not a side sheet or an embedded editor.

## Shell Contract

- The rail, tree head, and workspace head share the same approximately 48px horizontal boundary.
- The workspace page title is supplied by the selected resource. It must not remain a fixed generic label such as `文件`.
- The resource tree is resizable from 232px to 360px and remembers its width.
- Tree rows are approximately 28px high with consistent icon, disclosure, and text baselines.
- Row-level favorite and more actions appear only on hover, focus, or selection.
- Resource actions do not occupy the workspace page head unless they are global application actions.
- Selection uses one quiet neutral/purple-tinted background. It does not combine a colored fill, outline, and nested selected control.
- Structure is border-led. Page sections and tables are not wrapped in decorative cards.

## Resource Opening Contract

### Folders

- Single click selects a folder and renders it in the workspace.
- Folder views use the same `View` concept as structured resources, but expose only `List` and `Grid`.
- The folder has no `Columns` view.
- The resource tree owns hierarchical expansion. The workspace does not add another persistent hierarchy pane.

### Ordinary Files

- Single click selects the file and renders a lightweight read-only preview in the workspace.
- The preview shows the document title, rendered body, basic file facts, and concise state. It does not mount the full editor or eagerly fetch `.meta`.
- Double click, Enter, or an explicit Edit command opens `DocumentEditorModal`.
- The modal is a large centered overlay over the content region. It contains title, rich document body, low-chrome contextual formatting, and `.meta` at the document tail.
- Access and source controls use compact icons and open secondary dialogs or popovers.
- Closing the modal restores the exact tree selection, workspace preview, scroll position, and originating context.

### Structured Resources

- TTL/RDF resources render in the workspace rather than a modal.
- Available projections are `Table`, `Kanban`, `Whiteboard`, and `Raw`.
- The projection toolbar is one compact row. Existing views appear on the left and a single trailing `+` adds another view.
- The right side contains compact Class, search, filter, and sort controls. Controls use icons and tooltips where labels are not needed.
- `Raw` is a normal projection, not a separate oversized command.

### Subject Links

- A structured subject that resolves to a local file uses the same read-only resource preview model as the tree.
- The first action is a peek that preserves the table context.
- Entering edit opens the same `DocumentEditorModal`; no second editor implementation is allowed.
- Closing the peek or editor restores the originating subject, projection, filters, column state, and scroll position.

## Structured Table Contract

- Schema order is `subject`, visible predicates, then `+`.
- Class is required but represented by one compact toolbar control, not a table column.
- Rows are approximately 32px high. Column separators remain low contrast.
- Column boundaries use Excel-style drag resizing.
- Cells edit directly without a separate Edit or Confirm button.
- Type-specific interactions operate on the whole cell:
  - scalar/date/code: inline editing;
  - boolean: direct toggle;
  - relation/URL: inline value plus open affordance;
  - enum: one popover containing selected values, search, and create.
- Pending proposals retain the existing `*` marker and production approval workflow.

## Visual Density

- Files uses system typography and a neutral palette with sparse taro-purple emphasis.
- The page head is about 48px, the resource row about 28px, and the structured row about 32px.
- The View toolbar remains one line at desktop widths.
- Labels are removed when a familiar icon with an accessible name and tooltip communicates the action.
- Content uses whitespace and subtle dividers rather than nested cards.
- Popovers and dialogs may use shallow elevation; normal workflow surfaces do not.

## Loading And Error States

- Selection changes update the workspace shell immediately.
- Cached or root snapshot data renders before background revalidation.
- Loading preserves the destination layout and shows local skeletons. It must not clear the entire workspace.
- Errors stay attached to the affected tree row, preview, table, or editor operation.
- Global destructive toast treatment is reserved for failures that cannot be represented locally.
- Retry actions must be real and remain close to the failed content.

## Responsive Contract

- Desktop keeps rail, resizable tree, and workspace.
- Compact layouts expose the same resource tree in a drawer; they do not create a separate mobile navigation model.
- Selecting or opening a resource closes the compact tree drawer.
- Workspace controls remain a single compact row where possible; lower-priority actions collapse into the local more menu.
- Document editing remains an overlay, adapted to the viewport with safe-area-aware edge spacing.

## Component Boundaries

- Pure UI primitives remain data agnostic and receive state and callbacks through props.
- Files feature containers connect Pod queries, collections, optimistic updates, and Zustand UI state.
- `DocumentEditorModal` is the single ordinary-file editing surface used by tree, folder, and structured-subject entry points.
- Folder and structured toolbars share a reusable View-bar primitive but supply different projection registries.
- The resource tree owns row hover actions, disclosure, roving focus, and width persistence.
- The workspace owns selected-resource preview and return context; it does not own tree expansion.

## Acceptance Criteria

1. Tree and workspace heads align at approximately 48px.
2. Tree rows are compact, resizable, and show row actions only contextually.
3. Folder workspace offers only List and Grid through the shared View grammar.
4. Ordinary-file single click shows read-only workspace preview; explicit open/edit shows one centered document modal.
5. Tree, folder, and subject entry points reuse the same preview and editor implementations.
6. TTL has one compact toolbar and Table/Kanban/Whiteboard/Raw projections.
7. Table cells retain production type-driven editing and approval behavior with prototype-level density.
8. Loading keeps layout stable and avoids duplicate blocking reads.
9. `.meta` stays lazy in workspace previews and appears at the bottom of the document editor.
10. Desktop and compact browser walkthroughs preserve selection and return context.

## Verification

- Component tests for resource opening decisions and modal reuse.
- Architecture tests for View-bar and preview/editor ownership boundaries.
- Interaction tests for tree roving, hover actions, view switching, subject peek, and return context.
- Visual screenshots at desktop and compact widths for folder, ordinary file, TTL table, Kanban, Whiteboard, Raw, and document modal.
- Real Pod walkthrough for cached listing, background refresh, opening, editing, and `.meta`/Access lazy behavior.
