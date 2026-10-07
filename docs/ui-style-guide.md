# UI Style Guide

## Design philosophy

LinX uses **macOS-native visual discipline** for a personal AI workspace organized around **工作 / 知识 / 我的 AI**.

Status: R6 target design, 2026-09-28. See the [joint experience spec](../../homepage/docs/specs/personal-ai-product-experience-r6.md). This is a design contract, not verification of the current app. LS-07/08/13/14 apply.

The product should feel like a quiet, capable workspace: readable work and personal judgment, low cognitive load, clear storage/runtime/AI work state, and restrained visual chrome. The interface borrows from familiar desktop chat products for structure, but the visual system should stay neutral, precise, and platform-native rather than decorative.

### Core principles

1. **Neutral foundation** — app chrome, panels, cards, and lists are built from neutral surfaces and text hierarchy.
2. **Sparse accent** — the selected ink purple is reserved for primary action, selection, focus, source lineage, and rare brand moments.
3. **Border-led structure** — use borders, dividers, spacing, and surface steps before shadows.
4. **Purposeful radius** — radius follows component role; dense rows stay compact, cards/dialogs get moderate rounding, pills are used only where the shape has semantic value.
5. **Native typography** — use system fonts and measured weight steps; avoid marketing-sized type inside workflow chrome.
6. **Functional motion** — motion explains state changes; it should not become decoration.

## Color roles

### Brand accent

- Primary accent: ink purple `#563E84`, mapped through the existing shared semantic theme. Paper `#F7F4ED`, sunken `#F2EDE2`, raised `#FBFAF7`, text `#2B2621`, muted `#655D53` follow the [selected brand](../../homepage/DESIGN.md). This 2026-09-27 target supersedes the former `#735FC4`; it does not claim the implementation has migrated.
- Accent usage must be sparse. If many things are purple, nothing is primary.
- Do not use colored glow or colored shadow as a default accent treatment.
- Use the selected paper neutrals without decorative textures. Do not add amber/orange accents for brand warmth; status must remain legible through text and shape. Task layouts and states follow R6; selected logos remain unchanged. LinX owns its workflow density independently of the marketing site and Xpod.

### Neutral surfaces

Use existing semantic tokens first:

- `--background` — app background.
- `--foreground` — primary text.
- `--card` / `--card-foreground` — panel and card surfaces.
- `--muted` / `--muted-foreground` — secondary surfaces and supporting text.
- `--border` / `--input` — separators, input outlines, panel boundaries.

Recommended surface hierarchy:

| Level | Role | Treatment |
| --- | --- | --- |
| 0 | App canvas | Flat background |
| 1 | Sidebar/list pane | Slight surface shift or border separation |
| 2 | Content panel/card | Card surface + subtle border |
| 3 | Dialog/popover | Card surface + stronger border + shallow shadow |

### Semantic states

- Success, warning, destructive, and info colors are for state meaning only.
- Keep semantic fills low-saturation unless the state is blocking or destructive.
- Always pair color with text or icon shape; do not rely on color alone.

## Typography

- Font family: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Inter`, `Segoe UI`, `PingFang SC`, `Microsoft YaHei`, `sans-serif`.
- Heading weight: 600.
- Control weight: 500.
- Body weight: 400.
- Body line height: at least 1.45 for readable content; dense list metadata may be tighter if still legible.

Recommended desktop roles:

| Role | Size | Weight | Usage |
| --- | --- | --- | --- |
| Page title | 20-24px | 600 | Settings/detail page title |
| Section title | 15-17px | 600 | Group headers, cards |
| Body | 14-15px | 400 | Normal text |
| Control | 13-14px | 500 | Buttons, tabs, field labels |
| Metadata | 12-13px | 400/500 | Timestamps, secondary labels |

## Layout and spacing

- Base rhythm: 4px/8px increments.
- Choose columns by task: navigation plus content; add a real collection list only when useful, and open details on demand. Never reserve an empty third pane. Keep rows and gutters predictable within each page type.
- Chat/list layouts may be dense; onboarding, login, and destructive actions need more breathing room.
- Advanced settings belong behind explicit settings surfaces, not in the primary login path.
- Audit, credentials, provider/base-model configuration and diagnostics are low-frequency surfaces. Personal methods, candidates, evaluations and current personal models belong to My AI and contextual work entrances.
- Evidence, conditions, exceptions, versions and the current decision must remain readable; do not compress them into list metadata. Long comparisons use the main content surface.
- Validate 1440/1180/768/390 CSS px and 200% text. Collapse optional panes before squeezing the main decision; narrow comparisons become sequential with explicit return and preserved selection.

## Files interaction

Files is a compact Pod resource browser with structured-resource tools, not a decorative card wall.

- Folder/file rows use familiar desktop density, neutral selection, clear icons, and predictable secondary metadata.
- Breadcrumbs, tree selection, file list selection, preview/detail, and `.meta` sidecar use restrained chrome and border-led separation.
- Structured tables prioritize scan speed: compact headers, stable column widths, visible resize affordances, quiet focus, and semantic pending markers.
- Subject peek, access control, Ingest state, pending proposals, locked vocab, and read-only state appear near the relevant row/cell/detail surface.
- Card, Kanban, and Whiteboard projections may use larger surfaces only when the structured-resource workflow needs them.

## Shape and radius

Radius is tiered by function:

| Component | Radius guidance |
| --- | --- |
| Dense list rows | 0-8px depending on selection treatment |
| Buttons / inputs | 8-12px |
| Cards / panels | 12-16px |
| Dialogs / sheets | 16-20px |
| Chips / badges / compact status | Pill only when the compact capsule communicates grouping/status |

Do not use a single large radius everywhere as a brand marker.

## Elevation and shadows

Use border and surface contrast for normal panels; shallow shadow only for floating layers. Avoid colored shadows, glow, decorative gradients, heavy stacked shadows and default glass/blur.

## Component contracts

| Pattern | Visual and interaction contract |
|---|---|
| Panel | Quiet paper surface, readable boundary; not every property in a separate card |
| Primary action | One dominant action for the current decision; secondary save/test/delete do not share equal emphasis |
| Input | Persistent label, clear error association, visible solid focus outline; do not rely on a low-opacity purple glow |
| Selected row | Background plus a marker/text/shape and programmatic selected state; purple alone is insufficient |
| Status | Text with a meaningful shape; normal optional capability absence is not a warning |
| Main navigation | Text labels by default; compact mode retains accessible names and a visible current location |

LinX desktop pointer controls use a 36px minimum hit area as the normal design target; dense rows may be visually smaller only if actions remain reachable. Coarse-pointer and primary login targets use at least 44px. Body text remains 14–15px, with longer source and comparison reading allowed more room; do not reduce essential labels to metadata size to fit a fixed column.

## Accessibility acceptance

- Core desktop/web flows target WCAG 2.1 AA; conformance is not claimed until measured.
- All actions use appropriate interactive semantics and keyboard operation. Nested row actions must not accidentally activate the row.
- Focus is visible against both paper and dark surfaces, not clipped by overflow. Dialogs place/trap focus appropriately, close with Esc when safe, and restore focus to their trigger; unsaved decisions have save/discard/continue editing.
- State and selection do not rely on color alone. Labels, errors and helper text remain readable at 200% text.
- Announce meaningful run stages, waiting and errors; do not flood screen readers with every streamed token or tool log. Pending and disabled actions explain the blocking reason.
- Contrast, focus order, long Chinese/English labels, keyboard-only navigation and reduced motion require actual implementation evidence; a token palette alone does not prove accessibility.

## Motion

- Default transition: 120-180ms.
- Use `ease-out` for entry and hover response.
- Avoid slow decorative transitions in chat and login flows.
- Respect reduced motion; no essential meaning should depend on animation.

## Iconography and badges

- Use line icons with consistent stroke and size.
- Icon-only actions need accessible labels.
- Cloud, Local, and Standalone need distinct badges/marks, but the mark should not dominate the row.
- Prefer dot/check/cross plus text for reachability and runtime state.

## Copy guidelines

Use concise operational copy:

AI wait/retry/timeout/interrupt state must be visible as UI state, not as an assistant message that looks like model content.

| Avoid | Prefer |
| --- | --- |
| “出了点小问题” | “无法连接这个空间。” |
| “正在连接你的空间...” | “正在连接 Local 服务...” |
| “完成了！” | “已创建 Pod。” |
| “使用其他账号” when changing storage | “切换空间” / “返回选择空间” |
| Generic “准备中” | Specific step: “正在验证身份”, “正在创建 Pod”, “正在初始化 Secretary” |

Rules:

- Explain what is happening, where data goes, and what the next action is.
- Do not soften technical failures so much that the user cannot act.
- Keep advanced terms in settings/diagnostics unless the current flow requires them.
- For AI/runtime failures, name the visible category when known: auth, gateway/platform, model request validation, timeout, retry exhaustion, no-content response, or local interrupt.

## Migration guidance

Earlier UI code and comments may still contain an emotion-led style vocabulary. Treat those names and comments as legacy implementation details, not current design direction.

When touching UI code:

1. Keep behavior stable first.
2. Prefer neutral `surface` / `panel` / `action` / `status` naming for new work.
3. Replace decorative accent, heavy shadow, and broad rounding with the rules above.
4. Update comments that describe old brand language near the changed code.
5. Do not introduce a second component library to accomplish this migration.

## Do / Don't

### Do

- Use neutral surfaces and subtle borders for structure.
- Reserve purple for primary, selected, and focus semantics.
- Show provider/storage/runtime state where it changes the current decision; keep normal chrome quiet.
- Keep lists compact and decisions, sources and comparisons readable; use page type rather than a universal density.
- Use screenshots for visual verification on desktop changes.

### Don't

- Do not make WeChat visual skin the design target.
- Do not copy Apple assets, names, or brand identity.
- Do not introduce broad secondary accent palettes.
- Do not use emoji as the primary status system.
- Do not expose advanced Local networking setup in the main login path.
