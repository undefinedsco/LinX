# Files Minimal Card-First Design

Date: 2026-06-15
Last updated: 2026-06-16
Status: Draft for user review

## Purpose

Redesign the Files module toward an Apple / WeChat minimalist interaction model while preserving the Solid/RDF power model. The Files surface should feel quiet by default, reveal structure progressively, and treat parsed knowledge cards as the primary editable object when source documents or URLs are imported.

This spec covers Files only. It also records a small reusable visual direction for the rest of LinX.

## Design Direction

Use the progressive-disclosure approach:

- Default screen is calm: current location, current content, and only essential actions.
- Advanced operations appear through hover, popover, sheet, or explicit `+ View`.
- Folder browsing stays familiar, but does not become a full Finder clone.
- `.ttl` resources behave like Heptabase-style typed card databases over RDF subjects.
- Editable file/source content opens as a focused card/document editor rather than an embedded preview.
- Source-linked documents are card-first: parsed blocks are the user-facing body; source files and URLs are provenance and sync inputs.

## Files Information Architecture

The Files workspace has these surfaces:

- Global narrow rail: unchanged app-level module navigation.
- Files resource rail: Pod tree and search. It can collapse to a narrow path/action rail.
- Main workspace: folder list, structured `.ttl` workspace, readonly media preview, or focused editor modal.
- Resource sidecar actions: `.meta` and Access are semantic object actions, not layout concepts.

Left tree stays path-based and does not invent category groups:

```text
Pod Home
  .data/
  .vocab/
    terms.ttl
    shapes.ttl
    namespaces.ttl
  files/
  chat/
  inbox/
```

`.acl` / `.acr` are not tree entries. They are provider-dependent access policy sidecars for the currently selected resource, similar in level to `.meta`.

## Sidecar Model

`.meta` and `.acl/.acr` are resource-level sidecars.

- `.meta` opens through an Info / metadata semantic icon.
- Access opens through a Shield icon.
- Both pop from the same head action area and use the same placement model.
- Long sidecar content may promote to a full sheet/panel, but the default mental model is "inspect this resource", not "open right sidebar".
- `.meta` can show permission summary, but ACL/ACR policy details remain in Access.
- Access can offer `Open policy source` as an advanced action when the provider exposes raw ACL/ACR resources.

Focused file/card editor modals do not use the page sidecar. Their metadata appears in the bottom tail, with Access and meta actions still available in the modal header.

## Vocab Structure

The user's vocab is a Pod container:

```text
.vocab/
  terms.ttl
  shapes.ttl
  namespaces.ttl
```

`terms.ttl` is the term registry:

- class, predicate, and enum option are term kinds.
- They are filtered views over rows, not separate folders.
- The default table view is readonly because the meta schema for terms is fixed.

`shapes.ttl` is the shape / constraint registry:

- SHACL shapes.
- Required fields.
- Range and cardinality rules.
- Default visible predicates for a class.
- Class-to-predicate applicability.
- UI form/display constraints when needed.

`namespaces.ttl` is the prefix / namespace registry:

- Prefix to namespace URI mapping.
- Source and version.
- Trust / ownership boundary.

Official or ecosystem vocab is referenced by namespace URI. It should not be represented as a fake folder under the user's `.vocab`.

## Structured Table Interaction

`.ttl` opens to Table by default, but the mental model is a Heptabase-style typed card database, not a spreadsheet.

### Class Scope

Class scope is the current database context:

```text
Workspace v
subject | title | repository | localPath | runtimeStatus* | + predicate
```

- Different classes do not mix in one table.
- The table does not repeat class as a column.
- Class scope has an info popover for term definition, shape summary, default predicates, and URI.
- Pending class definitions show `*`; full review is in the popover or proposal flow.

### Predicate Headers

Predicate headers are schema cells:

- Default label is local name.
- Namespace switch reveals prefixed labels.
- Pending predicates show `*`.
- Header actions are hidden until hover/active.
- Column width is adjusted by dragging header dividers.

Each predicate header has an info popover because each column maps to one predicate term. The popover shows:

- term URI
- label and description
- type/range/options
- shape usage for the current class
- status and proposal state
- actions: view definition, view shape rule, open URI, review proposal

### Cells

Cells are typed controls:

- text/code: click to edit inline, save on blur.
- date: click to edit date inline.
- checkbox: direct toggle.
- relation/url: click opens, hover exposes link/replace.
- select: click chip opens selector.
- multi-select: click chip area opens selector.

Cell controls should avoid visible text buttons. Actions appear as short icons only when context requires them.

### Enum Selector

Enumerable values use a Heptabase-like tag selector:

```text
[selected chips] [search or create]
Select an option or create one
rdf
core
solid-modeling
+ create "new value"
```

Selected values, search, and creation share one popover. Option colors, descriptions, and URI come from vocab terms. Option-level `...` appears on hover and opens the term definition popover.

### + Predicate

`+ Predicate` is a schema action, not a generic button.

Default first step:

- Search existing predicates.
- Show predicates available for the current class.
- First row is `Create new predicate`.

Create flow groups fields:

Term:

- namespace / prefix
- local name
- URI preview
- label
- description

Value:

- type
- range/options
- multi-value

Shape rule for current class:

- class scope
- required
- cardinality
- default visible
- validation
- display rule

Review:

- user-created or AI-suggested
- pending or confirmed
- proposal details when needed

Creating a predicate therefore creates or references a term and binds it to the current class shape rule.

### Subject Opening

Single-clicking a subject opens a Subject Peek instead of immediately navigating away. This keeps table context stable.

Subject Peek branches by type:

- fragment subject: show card details and actions to open card or containing resource file.
- file resource: open focused file detail/editor for editable files, preview for readonly files, structured table for `.ttl`.
- external IRI: show URI preview with open/copy actions.
- vocab term: show term definition and shape usage.
- source-linked card: show source, parsed card/body state, sync state, and open actions.

Double-click, Enter, or explicit `Open` performs navigation.

## Card-First Source Model

Card-first means the card is the user's note-taking object. Source/parser is a later capability layered onto that object, not the core note-taking model.

## Note Taking: Blocks And Cells

Files note taking uses a dual model:

```text
Card / Subject
  Blocks
  Cells
```

- Blocks are the writing, thinking, quote, list, code, image, embed, and linked-subject body.
- Cells are structured predicate values: tags, status, relations, dates, source, class, and other metadata.
- The same subject identity powers both. Table view is cell-first; card detail is block-first.

This aligns the references:

- Heptabase note/card body maps to blocks.
- Heptabase tags/properties map to cells/predicates.
- LinX subject maps to card identity.
- LinX predicate maps to cell schema.
- LinX `.ttl` table maps to a multi-card database view.

### Card Detail

Opening a subject or editable file shows a card detail surface:

```text
Title

Byline
Class · source · updated · sync/parser state

Blocks
paragraph
heading
todo
quote
code
image/file embed
linked subject
database/table embed

Properties
title
tags
source
status
relations
```

Properties may sit near the bottom or in a collapsible section. They should not become a permanent right-side form.

### Block Editing

Block editing is the primary note-taking flow:

- Empty line accepts normal typing.
- `/` opens a block menu.
- Hover shows `+`, drag handle, comment, and more actions.
- Blocks can be selected, moved, folded, linked, and copied.
- Source-derived blocks can carry provenance.
- User-edited blocks become user-owned content and are protected from parser overwrite.

Supported block types for the design target:

- paragraph
- heading
- list
- todo
- quote
- code
- image/file embed
- linked card
- inline database/table embed

Blocks are where users think and write. The UI must not force every idea into structured properties.

### Cell Editing

Cells are structured metadata editors for predicate values:

- class
- tags
- status
- relation
- date
- checkbox
- url
- number
- select / multi-select

Cell behavior is shared between table cells and card property cells. Editing `runtimeStatus` in the table updates the same value shown in card detail. Editing tags in card detail updates the table.

Cell type comes from predicate definition plus class shape rule. Select and multi-select cells use the same tag selector in table and card detail.

### Block And Cell Relationship

Blocks and cells do not replace each other:

- Blocks express content.
- Cells make content queryable, sortable, filterable, and linkable.
- Shapes decide which cells are required, recommended, visible, or hidden for a class.
- Important cells can be promoted into the byline.
- Table is many cards, cell-first.
- Card detail is one card, block-first.
- Kanban is many cards grouped by one cell.
- Whiteboard is many cards spatially arranged.

### Cell In Block

Inline structured editing is allowed but should stay restrained:

- `@subject` links another card.
- `#tag` updates tag cells.
- pasted URLs can create source-linked cards or embeds.
- inline property chips may edit common predicates when this feels natural.

Do not turn the writing surface into a form. Inline cells are shortcuts, not the default metadata UI.

### Empty Card State

New cards should feel like a note, not a setup wizard:

```text
Untitled
Class · Private

Start writing...
```

Only the most important 3-5 properties appear by default. More metadata is available through `+ property`, properties expansion, or sidecar actions.

## Source-Linked Cards

For URL/DOC/PPT/PDF imports, the parsed card/document is the user-facing primary object. Source files and URLs are provenance and sync inputs.

Conceptual model:

```text
card/document resource
  editable blocks
  source links
  parser state
  derived indexes
```

The source is not overwritten by user edits. The card is the long-lived knowledge object.

Suggested storage shape:

```text
.data/cards/{cardId}/
  card.ttl
  blocks/
  assets/
  sources/
    source.ttl
  parser/
    manifest.ttl
  indexes/
    search.ttl
    vector.ttl
    entities.ttl
```

For pure file browsing, files remain under `/files/...`. Once a file or URL enters the knowledge system, it gets a card resource that references the source.

## Source Sync and User Edits

Imported blocks carry origin metadata:

- `origin`: source, user, or ai.
- source block id.
- source hash.
- parser version.
- sync state: clean, source-updated, conflict, source-missing.

Rules:

- User edits always win by default.
- Parser updates may auto-update only source-derived blocks that the user has not edited.
- New source blocks can appear as pending updates.
- Source-deleted blocks become source-missing; user content is not deleted automatically.
- Conflicts enter review with keep mine, accept source, or merge actions.

Byline example:

```text
Imported from example.com · Synced 10m ago · 2 source updates · 1 local edit
```

Actions:

- Open source
- Sync now
- Review updates
- Detach source

## Lazy Progressive Parser

Parsing should be lazy and progressive.

Import creates a card shell and parses only minimum useful content:

- title
- source type
- first page/section
- thumbnail
- basic metadata

Then parse on demand:

- scroll to a page/section
- open outline
- search within document
- ask AI about the document
- open whiteboard/kanban summary
- user explicitly chooses parse all

Parser manifest records:

- source hash
- parser version
- status: partial, complete, stale, failed
- parsed ranges
- pending ranges
- priority queue
- last parsed time

URL sources may refresh snapshots periodically, but full reparse remains lazy. File sources use hash/mtime to avoid reparse when unchanged.

UI should show lightweight state:

```text
Parsed 3/40 pages · Parsing as you read
```

Advanced actions:

- Continue parsing
- Parse all
- Re-parse
- Review source updates

## File And Folder Opening

Folder:

- Finder-like list/column/icon view.
- Can show lightweight selected item preview.
- Does not embed editable document body.
- Folder `.meta` opens through metadata sidecar action.

Editable file:

- Opens directly into focused card/document editor.
- No embedded content preview in the main pane.
- Modal/page body uses byline + blocks.
- Meta is in the bottom tail.

Readonly media:

- May keep lightweight preview.
- Meta and Access use sidecar actions.

## Byline + Block Editor

Editable card/document surface should resemble Heptabase / Feishu / Tencent Docs:

- title
- byline with source/sync/parser state
- block body
- lightweight block hover controls
- bottom metadata tail

Byline can include:

- source
- sync state
- parser progress
- local edit count
- access summary

It should not turn into a technical status dashboard. Detailed state opens in source/status popover.

## Reference Product Tracking

Track reference products explicitly so design decisions do not drift into vague "make it like X" language. Each product note records role in LinX, what to copy, what not to copy, evidence/links, and last reviewed date.

### Primary UX References

| Product | Role in LinX | Copy | Do not copy | Evidence | Last reviewed |
| --- | --- | --- | --- | --- | --- |
| Heptabase | Primary card/database/whiteboard reference | card, tag/property, whiteboard, card database feel | Do not replace Files shell with a pure card wall | <https://wiki.heptabase.com/organize-knowledge-and-projects> | 2026-06-16 |
| Feishu Docs | Document detail and collaboration reference | byline, block editing, comments, doc polish | Do not copy enterprise chrome or heavy toolbar density | <https://www.feishu.cn/hc/en-US/articles/945900971706-get-started-with-docs>, <https://www.feishu.cn/hc/en-US/articles/629777077520-get-started-with-feishu-docs-new-version> | 2026-06-16 |
| Tencent Docs | Lightweight collaborative doc/table reference | restrained doc/table editing and sharing patterns | Do not copy broad office-suite complexity | <https://docs.qq.com/> | 2026-06-16 |
| Apple Finder / Notes | Quiet file and object action reference | calm file browsing, inspector-style object actions, typography restraint | Do not imply unsupported local Finder capabilities | <https://support.apple.com/guide/mac-help/organize-files-in-folders-mh26885/mac> | 2026-06-16 |
| WeChat | Minimal navigation and secondary-entry reference | quiet navigation, short copy, contextual sheets | Do not copy chat-first information architecture into Files | <https://www.wechat.com/> | 2026-06-16 |

### Knowledge / Object Model References

| Product | Role in LinX | Copy | Do not copy | Evidence | Last reviewed |
| --- | --- | --- | --- | --- | --- |
| Notion | Page + properties + database item reference | database item opens as page; properties plus block body | Do not inherit Notion's cluttered property surfaces wholesale | <https://www.notion.com/help/intro-to-databases>, <https://www.notion.com/help/database-properties> | 2026-06-16 |
| Obsidian | Local vault, links, and canvas reference | local-first vault, backlinks, graph/canvas, media in canvas | Do not make Markdown files the core data model | <https://obsidian.md/canvas> | 2026-06-16 |
| Logseq | Block-first outline and graph reference | block-first note taking, backlinks, PDF annotation, local knowledge graph | Do not copy Markdown-file-first constraints or outline-only UI | <https://logseq.com/>, <https://github.com/logseq/logseq> | 2026-06-16 |
| Anytype | Object-first local/offline workspace reference | object types, local-first ownership, database/kanban/gallery views | Do not copy its full object operating system complexity | <https://anytype.io/> | 2026-06-16 |
| Tana | Supertag / typed outline reference | typed outline and class-like tags | Do not copy power-user query complexity into default UI | <https://outliner.tana.inc/supertags>, <https://outliner.tana.inc/learn/features/supertags> | 2026-06-16 |
| Capacities | Object-based note-taking reference | object types and object-centric notes | Do not copy product taxonomy without mapping to RDF subjects | <https://capacities.io/>, <https://capacities.io/product> | 2026-06-16 |

### Open-Source / Implementation References

| Product / Library | Role in LinX | Copy | Do not copy | Evidence | Last reviewed |
| --- | --- | --- | --- | --- | --- |
| AppFlowy | Open-source Notion-like workspace reference | docs/grid/kanban/product surface, open-source tradeoffs | Do not make it the primary UX reference | <https://appflowy.com/>, <https://github.com/appflowy-io/appflowy>, <https://docs.appflowy.io/docs> | 2026-06-16 |
| AFFiNE | Open-source docs + whiteboard + database reference | docs/whiteboard/database combination and local-first positioning | Do not copy all-in-one workspace complexity by default | <https://affine.pro/>, <https://github.com/toeverything/affine> | 2026-06-16 |
| BlockNote | Block editor UX reference | ready-made block patterns and menus | Do not let its default UI define LinX's editor surface | <https://www.blocknotejs.org/docs> | 2026-06-16 |
| Tiptap / ProseMirror | Rich editor engine reference | headless extension model and custom schema/plugins | Do not use default examples as final UI | <https://tiptap.dev/docs/editor/getting-started/overview>, <https://prosemirror.net/docs/> | 2026-06-16 |
| TanStack Table | Headless table state reference | controlled row/column/sizing/filtering/visibility state | Do not treat it as UI components | <https://tanstack.com/table/latest> | 2026-06-16 |
| tldraw | Whiteboard engine reference | infinite canvas and custom shapes | Do not expose generic whiteboard UI when LinX needs card shapes | <https://tldraw.dev/> | 2026-06-16 |
| Yjs | Collaboration engine reference | CRDT shared types for future collaboration | Do not make real-time collaboration a first-phase dependency | <https://docs.yjs.dev/> | 2026-06-16 |
| Milkdown / Crepe | Markdown-first editor fallback | Markdown WYSIWYG if `.md` becomes the primary format | Do not make Markdown the core card model | <https://milkdown.dev/docs/guide/getting-started> | 2026-06-16 |

## Visual Direction

Reusable LinX minimalist direction:

- Default quiet, reveal complexity on intent.
- Use semantic icons instead of layout terminology.
- Fewer persistent buttons.
- Low-contrast borders, no heavy table grid.
- Compact but readable row height.
- Hover-only secondary controls.
- Short labels and no explanatory in-app copy.
- Smooth panel/modal hierarchy; avoid simultaneous sidebars and modals.
- White space should clarify grouping, not create empty card walls.
- Purple remains an accent, not a dominant theme.

Files-specific tone:

- Folder view: calm file manager.
- Structured table: typed database.
- Card/document editor: focused writing/reading surface.
- Vocab: quiet registry.
- Parser/source sync: subtle byline state, explicit review when needed.

## Open Decisions

- Whether source-linked card resources live under `.data/cards/` or a more domain-specific container.
- Whether block storage is one TTL per block or chunked by section/page for performance.
- Exact proposal resource shape for vocab and source update review.
- Whether focused editor is modal, full-page overlay, or route-level page in production.

These are implementation planning questions; the interaction model above does not depend on their final storage detail.

## Acceptance Criteria

- Files default view is visibly calmer with collapsible resource rail and no permanent right drawer concept.
- `.meta` and Access are semantic sidecar actions with consistent popover/sheet placement.
- `.ttl` table reads as a Heptabase-style typed card database.
- Class and predicate info exists but is hidden until requested.
- `+ Predicate` captures term definition, value definition, description, and class shape rule.
- Subject click opens a peek before navigation.
- Vocab tree is `terms.ttl`, `shapes.ttl`, `namespaces.ttl`.
- Imported URL/PDF/DOC/PPT content is card-first, with source as provenance.
- Parser is lazy and progressive.
- User edits are never overwritten by parser/source sync without review.
