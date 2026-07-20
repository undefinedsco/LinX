# Files Explorer Sidebar Design

## Goal

Replace the Files list pane's page-navigation model with a compact VS Code-style explorer tree. Folder expansion becomes the primary navigation mechanism, so users do not depend on a fragile back action.

## Interaction

- The sidebar defaults to about 240px and remains resizable between 200px and 320px.
- Rows are 28px high and contain only disclosure, semantic icon, name, and exceptional status.
- Clicking a disclosure expands or collapses a folder without changing the current detail.
- Clicking a folder name selects it; double-clicking may focus that folder but is not required to browse descendants.
- Clicking a file selects it and opens the existing detail or editable sheet workflow.
- `ArrowRight` expands, `ArrowLeft` collapses, arrows move selection, Enter opens, and Space selects.
- Search filters the visible tree while preserving ancestors of matches.
- Child containers load only after expansion and reuse the existing Files query cache.

## Boundaries

- Pure tree projection and flattening live in the Files list domain layer.
- Expansion and selection orchestration live in the list feature layer.
- Pod access continues through existing Files data queries; UI components do not fetch directly.
- The main detail pane remains the only detailed resource surface.

## Error And Loading States

- An expanded folder displays one compact inline loading row.
- A failed child read remains expandable and shows an inline retry/error row without blanking the tree.
- Collapsing a folder preserves cached children and does not cancel unrelated detail reads.

## Verification

- Domain tests cover flattening, ancestor retention, depth, and stable ordering.
- Feature tests cover lazy expansion, no folder-history dependency, keyboard behavior, file opening, and inline errors.
- Workspace tests cover the compact width contract and two-pane detail behavior.

