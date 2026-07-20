# Files Prototype Shell Alignment Design

- Status: Approved
- Date: 2026-07-20 (revised 2026-07-20: `.meta` sidebar, folder views, empty states)
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

There is no third persistent preview pane. `.meta` lives in a right sidebar that may become a fourth column; **it is collapsed by default** and toggled from the workspace head. It is not an overlay drawer and never covers the workspace.

The resource workspace provides read-only browsing and preview. Full document editing is a modal overlay named `DocumentEditorModal`; it is not a side sheet or an embedded editor.

## Shell Contract

- The rail, tree head, and workspace head share the same approximately 48px horizontal boundary.
- The workspace page title is supplied by the selected resource. It must not remain a fixed generic label such as `文件`. The workspace head shows the current resource path beside the title.
- The resource tree is resizable from 232px to 360px and remembers its width.
- The tree owns hierarchical navigation and expansion. There is no back button anywhere; the workspace does not add another persistent hierarchy pane.
- Tree rows are approximately 28px high with consistent icon, disclosure, and text baselines.
- Row-level favorite and more actions appear only on hover, focus, or selection.
- Resource actions do not occupy the workspace page head unless they are global application actions.
- Selection uses one quiet neutral/purple-tinted background. It does not combine a colored fill, outline, and nested selected control. Multi-selection uses the same single background, never fill plus inset outline.
- Structure is border-led. Page sections and tables are not wrapped in decorative cards.

## Resource Opening Contract

### Folders

- Single click selects a folder and renders it in the workspace.
- Folder views use the same `View` concept as structured resources, but expose only `Table` and `Grid`.
- `Table` is the sortable column view (name, kind, size, modified, permission). `Grid` is the Finder-style borderless icon tile view. There is no `List` view (it duplicates `Table`) and no `Columns` view.
- Folder views share the bottom add row with the structured table's add grammar; in `Grid`, the add affordance is the last tile.

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
- The right side contains compact Class, search, filter, sort, and column-visibility controls. Controls use icons and tooltips where labels are not needed. The single namespace switch lives inside the column-visibility menu, not as a standalone toolbar control.
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

## Empty And Guided States

- Every empty state names a specific next action: browse, clear the search, create a document, upload, or add a web page. Plain unexplained text rows are not allowed.
- An empty structured resource (no class yet) renders a guided state instead of a bare table: create the first class inline from the class menu, then define predicates, then add subjects. For an empty resource the class menu shows only created classes plus the create row; existing unrelated classes are not offered.
- Denied resources show a centered state with the path, the effective status (for example `403 · authenticated, no read access`), the policy source, and two actions: request access and view the Access source. Authentication failure (401) and authorization failure (403) are distinct states and never trigger token clearing.
- Retry actions must be real and remain close to the failed content; an error row must never advertise a retry that has no handler.

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
2. Tree rows are compact, resizable (232–360px, persisted), and show row actions only contextually.
3. Folder workspace offers only Table and Grid through the shared View grammar.
4. Ordinary-file single click shows read-only workspace preview; explicit open/edit shows one centered document modal.
5. Tree, folder, and subject entry points reuse the same preview and editor implementations.
6. TTL has one compact toolbar and Table/Kanban/Whiteboard/Raw projections; the namespace switch lives inside the column-visibility menu.
7. Table cells retain production type-driven editing and approval behavior with prototype-level density.
8. Loading keeps layout stable and avoids duplicate blocking reads.
9. `.meta` stays lazy in workspace previews, appears at the bottom of the document editor, and opens as a right sidebar that is collapsed by default.
10. Empty states always name a next action; an empty structured resource follows the guided create-class flow.
11. Desktop and compact browser walkthroughs preserve selection and return context.

## Verification

- Component tests for resource opening decisions and modal reuse.
- Architecture tests for View-bar and preview/editor ownership boundaries.
- Interaction tests for tree roving, hover actions, view switching, subject peek, and return context.
- Visual screenshots at desktop and compact widths for folder, ordinary file, TTL table, Kanban, Whiteboard, Raw, document modal, empty states, and the empty-structured guided flow.
- Real Pod walkthrough for cached listing, background refresh, opening, editing, and `.meta`/Access lazy behavior.
