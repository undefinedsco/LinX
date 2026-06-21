# UI Style Guide

## Design philosophy

LinX uses a **macOS-native visual discipline** on top of a **desktop messaging interaction structure**.

The product should feel like a quiet, capable workspace: chat-first, low cognitive load, clear storage/runtime state, and restrained visual chrome. The interface borrows from familiar desktop chat products for structure, but the visual system should stay neutral, precise, and platform-native rather than decorative.

### Core principles

1. **Neutral foundation** — app chrome, panels, cards, and lists are built from neutral surfaces and text hierarchy.
2. **Sparse accent** — LinX purple is reserved for primary action, selection, focus, and key brand moments.
3. **Border-led structure** — use borders, dividers, spacing, and surface steps before shadows.
4. **Purposeful radius** — radius follows component role; dense rows stay compact, cards/dialogs get moderate rounding, pills are used only where the shape has semantic value.
5. **Native typography** — use system fonts and measured weight steps; avoid marketing-sized type inside workflow chrome.
6. **Functional motion** — motion explains state changes; it should not become decoration.

## Color roles

### Brand accent

- Primary accent: existing LinX purple token (`--primary`) for decisive actions, selected state, focus, and brand anchors.
- Accent usage must be sparse. If many things are purple, nothing is primary.
- Do not use colored glow or colored shadow as a default accent treatment.

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

- Font family: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Inter`, `Segoe UI`, `sans-serif`.
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
- Desktop shell should prioritize scan speed: stable columns, predictable row heights, consistent gutters.
- Chat/list layouts may be dense; onboarding, login, and destructive actions need more breathing room.
- Advanced settings belong behind explicit settings surfaces, not in the primary login path.

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

Use the lightest treatment that separates layers:

```css
/* Panel/card default */
border: 1px solid hsl(var(--border));
box-shadow: none;

/* Floating popover/dialog */
box-shadow: 0 12px 32px rgba(0, 0, 0, 0.10);

/* Press/hover response */
transform: none or translateY(-1px) only where it improves affordance;
```

Avoid:

- colored shadows;
- glow effects;
- broad decorative gradients;
- heavy stacked shadows for normal cards;
- default glass/blur effects in workflow chrome.

## Component patterns

### Surface panel

```css
.surface-panel {
  @apply bg-card text-card-foreground border border-border rounded-xl;
}
```

### Primary action

```css
.primary-action {
  @apply bg-primary text-primary-foreground rounded-lg h-9 px-4 font-medium;
  @apply transition-colors duration-150;
}
```

### Input field

```css
.input-field {
  @apply bg-background border border-input rounded-lg px-3 py-2;
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35;
}
```

### Status badge

```css
.status-badge {
  @apply inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium;
}
```

### Selection row

```css
.selection-row {
  @apply flex items-center gap-3 border-b border-border px-3 py-2;
  @apply hover:bg-muted/60;
}

.selection-row[data-selected="true"] {
  @apply bg-primary/10 text-foreground;
}
```

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
- Show provider/storage/runtime state explicitly.
- Keep chat-first workflows compact and scannable.
- Use screenshots for visual verification on desktop changes.

### Don't

- Do not make WeChat visual skin the design target.
- Do not copy Apple assets, names, or brand identity.
- Do not introduce broad secondary accent palettes.
- Do not use emoji as the primary status system.
- Do not expose advanced Local networking setup in the main login path.
