# Files Production Interaction Audit

Date: 2026-07-02

Status: production evidence map with visual density, toolbar/byline, product-language, and final live visual taste passes verified; remaining visual work is future polish, not a Files refactor blocker.

This document tracks the product interaction gate from
`docs/frontend-module-abstraction.md`. It exists because the prototype visual
report proves the intended Files direction, but production sign-off also needs
evidence from Web implementation tests, Real Pod e2e, and live screenshot
review.

## Scope

Files is the current scope. This audit covers:

- Finder-style folder browsing and folder child detail behavior.
- Heptabase-style subject/card/meta alignment for structured resources.
- Non-`.ttl` editable file detail as a centered rich editor sheet with `.meta`
  at the bottom.
- `.ttl` default table view with class scope, predicate schema columns,
  type-aware cells, `+ Subject`, `+ Predicate`, and `+ View` projections.
- `.meta`, `.acl`, and `.acr` as file-level sidecars surfaced through drawer or
  Access modal, not mixed into ordinary content.
- Vocab and `.data` write semantics, including pending `*` proposal state.
- Ingest/source-linked cards, Kanban, and Whiteboard first-phase behavior.

## Gate Matrix

| Product constraint | Production evidence | Prototype evidence | Status |
| --- | --- | --- | --- |
| Folder detail should feel like Finder/File Browser, not a generic card grid. Single click selects/previews; explicit open or Enter navigates/opens. Sidecars are hidden from child listings. | `apps/web/src/modules/files/components/FileDetailPane.test.tsx` covers folder child rendering, Finder-style headers/sorting/keyboard selection, context menus, multi-select, child preview/open behavior, and hidden sidecars. Real Pod e2e covers `opens a real folder as Finder-style detail with right-side meta` and `creates a markdown file from a real folder detail action`. Live visual audit captures folder detail, `.meta`, and Access modal. | `prototype-files-folder-finder-detail-1440x900.png`, `prototype-files-folder-right-meta-1440x900.png`, `prototype-files-folder-access-1440x900.png`. | Covered by tests, live screenshots, and final visual review. |
| Non-`.ttl` editable files open as a centered editor sheet/modal. The main pane should not duplicate the body preview, and file `.meta` belongs at the bottom of the sheet. | `FileDetailPane.test.tsx` covers the centered editor modal, no main-pane content duplication, sheet-open routing, rich save path, and bottom sheet metadata. `FileDetailPane.rich-save.test.tsx` covers rich editor serialization, title save, proposal-only source-linked edits, and raw-source fallback. Live visual audit captures the editable sheet and bottom meta tail. | `prototype-files-regular-document-detail-1440x900.png`, `prototype-files-phase1-tiptap-sheet-1440x900.png`, `prototype-files-phase1-mobile-tiptap-sheet-390x844.png`. | Covered by tests, live screenshot, and final visual review. |
| `.ttl` opens embedded in the detail pane, defaulting to Table. Subject rows and predicate columns are the schema surface; class scope is required before mixing rows from different classes. | Real Pod e2e covers `opens a real Turtle resource as an embedded structured table with right-side meta`, `.data` cell approvals, and `.vocab` bootstrap. `structured-table.test.ts` covers class-scoped projection, empty typed tables, filter/sort/hidden predicates, vocab rows, shape rules, enum options, and required predicates. Live visual audit captures current production table and mobile Files layout. | `prototype-files-structured-table-1440x900.png`, `prototype-files-phase1-table-1440x900.png`, `prototype-files-structured-table-right-meta-1440x900.png`. | Covered functionally and captured visually; compact Files layout now keeps content reachable. |
| Predicate headers and cells should be compact and type-aware: namespace toggle, resizable columns, enum search/create in one popover, relation/link actions, date/boolean/scalar inline controls. | `StructuredProjectionTable.test.tsx` covers TanStack sorting, predicate definition menu choices, compact padding, existing predicates before create row, and anchored editors. `StructuredTableCellPrimitives.test.tsx` covers enum, multi-select, boolean, scalar, date, relation/link, pending marker, keyboard, and compact action behavior. `FileDetailPane.test.tsx` covers header definition context, default Pod vocab URI, pending enum options, relation/URL operations, and column sizing persisted to view metadata. Live visual audit captures predicate menu and enum cell menu. | `prototype-files-ns-toggle-1440x900.png`, `prototype-files-column-resized-1440x900.png`, `prototype-files-cell-select-menu-1440x900.png`, `prototype-files-cell-relation-menu-1440x900.png`, `prototype-files-cell-date-inline-1440x900.png`, `prototype-files-predicate-create-1440x900.png`. | Covered functionally, captured visually, and reviewed; future changes can still tune pixel density. |
| `+ Subject` is the final row. `+ Predicate` lives in the header and opens a rich definition flow with namespace, term, type, shape, and description semantics. | `FileDetailPane.test.tsx` covers `+ Subject` availability for empty typed `.ttl`, predicate definition context before create, default current Pod vocab, external predicate URI handling, and pending class/predicate proposals. `structured-table.test.ts` covers term/shape registry projection and shape-derived schema columns. Live visual audit captures the production `+ Predicate` menu. | `prototype-files-predicate-create-1440x900.png`, `prototype-files-data-editable-pending-table-1440x900.png`. | Covered by model/component tests and live screenshot. |
| `.meta` is a file-level sidecar. For folder, image, and `.ttl`, meta is in the right drawer collapsed by default. For editable file sheets, meta is at the bottom of the sheet. | `FileDetailPane.test.tsx` covers ordinary file sheet meta, no right drawer for editable sheet metadata, structured `.ttl` right drawer, image right drawer, missing/inaccessible/query-error meta states, and sidecar ownership detail. `ResourceSidecars.architecture.test.ts` keeps sidecar workflow owned by features and separates editor meta tail from query shape. Live visual audit captures folder and structured `.meta` drawers plus editable sheet meta tail. | `prototype-files-regular-document-right-meta-1440x900.png`, `prototype-files-regular-image-right-meta-1440x900.png`, `prototype-files-structured-table-right-meta-1440x900.png`. | Covered by tests and live screenshots; drawer overlay polish remains reviewable. |
| `.acl` / `.acr` are file-level policy sidecars exposed through Access, not inline metadata rows. Pod policy provider decides ACL vs ACR. | `FileDetailPane.test.tsx` covers access modal states, pending access proposals, inherited/candidate ACR/ACL targeting, visible proposal state without writing policy sidecars, and query-error handling. Real Pod e2e covers `creates and resolves a real access policy proposal according to the Pod policy provider`. Live visual audit captures the Access modal. | `prototype-files-access-modal-1440x900.png`, `prototype-files-detail-access-1440x900.png`, `prototype-files-folder-access-1440x900.png`. | Covered by tests, e2e, and live screenshot. |
| Vocab resources are registries of class/predicate/shape/namespace metadata. The registry table itself is not normal business data editing; `.data` tables are where personal data edits and pending `*` fields happen. | `FileDetailPane.test.tsx` covers locked vocab, shape, and namespace registry semantics plus read-only structured resources under `.vocab`. `structured-write-capability.test.ts` keeps vocab and public/reserved resources read-only. `vocab-approval.test.ts` covers approval, bootstrapping `.vocab`, shapes creation, current Pod/discovered private registry targeting, and preflight write access. | `prototype-files-vocab-readonly-table-1440x900.png`, `prototype-files-vocab-locked-table-1440x900.png`, `prototype-files-data-editable-pending-table-1440x900.png`. | Covered by tests; terminology remains sensitive and should stay aligned with Solid Type Index/vocab docs. |
| Source-linked cards use Ingest as the boundary for source snapshots, progressive ranges, and refresh proposals. Local edits are preserved through approval rather than rewriting source blindly. | `source-ingest*.test.ts`, `source-approval.test.ts`, and `FileDetailPane.rich-save.test.tsx` cover Ingest naming, progressive ranges, URL/doc/PDF/PPT source contracts, source refresh proposals, local keep behavior, staged content, and source-linked card previews. The current domain plan keeps card/body resources in the selected user container while resolving source-owned Ingest records to Pod-root `/.data/ingest/sources/.../manifest.ttl` and source proposals to `/.data/proposals/source/*.ttl`; legacy `/.data/index` remains read-compatible only. Real Pod e2e covers imports, rejected pending Ingest approval, and queued Ingest ranges. | `prototype-files-phase1-subject-source-1440x900.png`, `prototype-files-phase1-subject-peek-1440x900.png`. | Covered by tests and architecture policy; future work is model-package promotion, not Files-local path choice. |
| Kanban and Whiteboard are first-phase `+ View` projections over the same structured subjects, not a second data authority. | `structured-projections.test.ts` covers Kanban grouping, canonical group values, selected-subject Whiteboard cards, relation lines, and view-only visual relations. `FileDetailPane.test.tsx` covers Kanban/Whiteboard subject navigation, drag suppression, view metadata autosave, Kanban approval staging, and Whiteboard temporary relations without RDF writes. Real Pod e2e covers Whiteboard metadata persistence and Kanban approval mutation flow. Live visual audit captures both projections and now asserts compact toolbar/canvas scroll surfaces. | `prototype-files-phase1-kanban-1440x900.png`, `prototype-files-phase1-whiteboard-1440x900.png`, `prototype-files-structured-whiteboard-390x844.png`. | Covered by tests, live screenshots, and final visual review; future canvas polish remains non-blocking. |
| Architecture must keep reusable UI, smart feature logic, domain rules, data collection, and app composition separated. | `files-root.architecture.test.ts`, `app/files-app.architecture.test.ts`, `data/files-data.architecture.test.ts`, `domain/files-domain.architecture.test.ts`, `features/files-features.architecture.test.ts`, `structured-table.architecture.test.ts`, and component architecture tests are the required gate. The latest focused architecture run passed in this workstream. | Not applicable. | Covered by architecture tests; keep adding guards when new boundary issues are found. |

## Latest Verification Evidence

Freshly verified in this workstream before this audit was written:

- `yarn workspace @linx/web tsc --noEmit --pretty false` passed after the structured product-language cleanup.
- `yarn workspace @linx/web test --run src/modules/files --maxWorkers=1 --no-file-parallelism` passed with 182 test files and 1433 tests after the latest structured product-language cleanup.
- Focused architecture tests for Files app/data/domain/features/UI boundaries passed: 34 architecture test files and 175 tests.
- `git diff --check` and direct trailing-whitespace checks passed for touched files.

Real Pod e2e status:

- `yarn workspace @linx/e2e test:files` passed 23/23 on 2026-07-02 after the structured product-language cleanup and the stale structured cell editor e2e selector was aligned to the current `编辑 ... 的 title` UI copy. This covers the current Real Pod gate for Files.

Live production visual audit status:

- `LINX_E2E_BASE_URL=http://127.0.0.1:5875 LINX_E2E_REUSE_SERVER=0 yarn workspace @linx/e2e playwright test specs/files-production-visual-audit.spec.ts --workers=1` passed on 2026-07-02 after the product-language cleanup.
- The audit seeds real Pod resources under `.data/`, `.vocab/`, and a normal folder, then captures current Web implementation screenshots rather than prototype pages.
- The 390px capture now asserts that the outer micro-app list panel is removed from compact layout, the Files workspace starts immediately after the app rail, and structured toolbar/Whiteboard controls expose internal scroll surfaces instead of pushing the whole content pane wider.
- The first structured visual density pass reduced structured preview padding, made `CompactTableShell` a full-width quiet-border work surface, raised the Whiteboard canvas height, and then moved Whiteboard from a bordered card-like surface to an unframed canvas with only light horizontal separators. The visual audit was rerun after this pass and still passed.
- The structured toolbar/byline pass replaced right-drift toolbar islands with a two-row grid: title/status and view actions share the first row, while search and filter/sort/namespace/visibility tools share the second row. The visual audit was rerun after this pass and still passed on desktop and 390px captures.
- Product-language cleanup now covers the structured toolbar, `+ predicate` definition flow, table resize handles, enum/multi-select listboxes, active cell editor labels, and editable sheet `.meta` enum chips. The UI now uses Chinese sentence/action copy while preserving `class/predicate/subject/ns/term/URI/Shape/Ingest/card/chunk` as product terms. Focused component/model tests, production visual audit, and the real-pod editable `.meta` approval flow were rerun after this cleanup.
- `LINX_E2E_BASE_URL=http://localhost:5174 LINX_E2E_REUSE_SERVER=0 yarn workspace @linx/e2e test specs/files-real-pod-smoke.spec.ts -g "stages editable markdown detail .meta predicate edits through approval before mutating .meta" --workers=1` passed after the editable-sheet `.meta` chip labels changed.
- Final screenshot review against `DESIGN.md` completed on the current production captures: folder detail, editable sheet, structured table, `+ predicate`, enum cell menu, `.meta` drawer, Kanban, Whiteboard, and 390px compact layout all follow the resource-first, quiet border-led, progressive-disclosure direction. The structured subject column is still guarded by the visual audit DOM assertion (`调整 subject 列宽`) and row assertion (`#Workspace`) even when the screenshot crop emphasizes predicate columns.
- Screenshot artifacts:
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/01-folder-finder-detail-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/02-folder-meta-drawer-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/03-access-modal-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/04-editable-file-sheet-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/05-structured-table-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/06-predicate-menu-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/07-enum-cell-menu-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/08-structured-meta-drawer-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/09-kanban-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/10-whiteboard-1440x900.png`
  - `.omx/artifacts/files-production-visual-audit/2026-07-02/11-mobile-current-files-layout-390x844.png`
- Important finding: the previous 390px capture exposed the resource tree/list pushing content off-screen. That layout bug is now guarded by unit coverage and the production visual audit. The structured byline and Whiteboard now have internal scroll surfaces at 390px; remaining work is visual density refinement, not reachability.

## Future Polish

- Continue small Apple/WeChat minimalism and Heptabase/Tencent Docs/Feishu density refinements as ordinary visual polish, not as blockers for the Files refactor architecture gate.
- Keep watching compact head height, quiet column dividers, centered cells, collapsed right drawer, and no repeated breadcrumbs or duplicated meta surfaces on real screens when new Files controls are added.
- Fixture/test-only English remains out of scope for product UI polish. User-visible structured controls and source proposal summaries/diffs have been localized, but future copy changes should keep the same product-term policy rather than translating `class/predicate/subject/ns/term/URI/Shape/Ingest/card/chunk` ad hoc.
- Source-linked card/Ingest policy is now explicit in `docs/frontend-module-abstraction.md`: cards can be scattered, card/body resources stay in the selected user container, and source-owned Ingest/proposal artifacts live under Pod-root `.data` control paths. Remaining work is promotion to shared model/schema once `@undefineds.co/models` owns the SourceLinkedCard/Ingest vocabulary.

## Current Estimate

Overall Files refactor progress for this module-abstraction goal is complete.

- Code and architecture gates are closed for the current refactor scope.
- Product interaction implementation is closed for the current refactor scope: desktop flows are captured, compact outer layout is fixed, structured controls are reachable through internal scroll surfaces, table density is applied, Whiteboard uses the unframed canvas direction, toolbar/byline alignment is applied, and structured/source-linked/Ingest action copy is localized.
- Verification confidence is high for this scope because the current Files unit/integration suite, architecture suite, Web typecheck, Real Pod e2e, focused visual-density/byline/Whiteboard/product-language tests, and live production visual audit all pass.
- Documentation/gate clarity is closed for this scope: module abstraction requirements, screenshot evidence, source-linked card/Ingest path policy, product-language policy, and future polish boundaries are recorded.
