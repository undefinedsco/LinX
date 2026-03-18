// Directly adapted from codex-rs/tui/src/bottom_pane/approval_overlay.rs and
// bottom_pane/list_selection_view.rs concepts. This is a minimal TS port of the
// centered selection overlay structure used by Codex.

export interface CodexOverlayOption {
  label: string
  value: string
  description?: string
  shortcuts?: string[]
}

export interface CodexOverlayState {
  title: string
  body: string[]
  options: CodexOverlayOption[]
  selectedIndex: number
  footerHint?: string
}

function clip(text: string, width: number): string {
  if (width <= 0) {
    return ''
  }

  if (text.length <= width) {
    return text
  }

  if (width <= 3) {
    return text.slice(0, width)
  }

  return `${text.slice(0, width - 3)}...`
}

function wrapText(text: string, width: number): string[] {
  if (width <= 1) {
    return [text.slice(0, Math.max(width, 0))]
  }

  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    let remaining = rawLine || ' '
    while (remaining.length > width) {
      lines.push(remaining.slice(0, width))
      remaining = remaining.slice(width)
    }
    lines.push(remaining)
  }
  return lines
}

function boxLine(left: string, text: string, right: string, width: number): string {
  const innerWidth = Math.max(0, width - 2)
  return `${left}${clip(text, innerWidth).padEnd(innerWidth, ' ')}${right}`
}

function padLine(text: string, width: number): string {
  return clip(text, width).padEnd(width, ' ')
}

export function overlayOptionLabel(option: CodexOverlayOption): string {
  const shortcutText = option.shortcuts && option.shortcuts.length > 0
    ? ` [${option.shortcuts.join('/')}]`
    : ''
  const descriptionText = option.description ? ` - ${option.description}` : ''
  return `${option.label}${shortcutText}${descriptionText}`
}

export function overlayHeight(state: CodexOverlayState): number {
  return 5 + state.body.length + state.options.length
}

function clippedBodyRows(rows: string[], maxRows: number): { rows: string[]; hidden: boolean } {
  if (rows.length <= maxRows) {
    return { rows, hidden: false }
  }

  if (maxRows <= 0) {
    return { rows: [], hidden: true }
  }

  if (maxRows === 1) {
    return { rows: ['...'], hidden: true }
  }

  return {
    rows: [...rows.slice(0, maxRows - 1), '...'],
    hidden: true,
  }
}

interface OverlayOptionBlock {
  optionIndex: number
  lines: string[]
}

function optionBlocks(state: CodexOverlayState, width: number): OverlayOptionBlock[] {
  return state.options.map((option, index) => {
    const marker = index === state.selectedIndex ? '> ' : '  '
    const wrapped = wrapText(overlayOptionLabel(option), Math.max(1, width - marker.length))
    return {
      optionIndex: index,
      lines: wrapped.map((line, lineIndex) => padLine(`${lineIndex === 0 ? marker : ' '.repeat(marker.length)}${line}`, width)),
    }
  })
}

function visibleOptionRows(
  blocks: OverlayOptionBlock[],
  selectedIndex: number,
  maxRows: number,
): {
  rows: string[]
  optionsHidden: boolean
} {
  if (blocks.length === 0) {
    return { rows: [], optionsHidden: false }
  }

  if (maxRows <= 0) {
    return { rows: [], optionsHidden: true }
  }

  const clampedSelected = Math.max(0, Math.min(selectedIndex, blocks.length - 1))
  const totalRows = blocks.reduce((sum, block) => sum + block.lines.length, 0)
  if (totalRows <= maxRows) {
    return {
      rows: blocks.flatMap((block) => block.lines),
      optionsHidden: false,
    }
  }

  let start = clampedSelected
  let end = clampedSelected
  let usedRows = blocks[clampedSelected]?.lines.length ?? 0

  while (true) {
    let expanded = false

    if (start > 0) {
      const previousRows = blocks[start - 1]?.lines.length ?? 0
      if (usedRows + previousRows <= maxRows) {
        start -= 1
        usedRows += previousRows
        expanded = true
      }
    }

    if (end < blocks.length - 1) {
      const nextRows = blocks[end + 1]?.lines.length ?? 0
      if (usedRows + nextRows <= maxRows) {
        end += 1
        usedRows += nextRows
        expanded = true
      }
    }

    if (!expanded) {
      break
    }
  }

  if (usedRows > maxRows) {
    return {
      rows: (blocks[clampedSelected]?.lines ?? []).slice(0, maxRows),
      optionsHidden: true,
    }
  }

  return {
    rows: blocks.slice(start, end + 1).flatMap((block) => block.lines),
    optionsHidden: start > 0 || end < blocks.length - 1,
  }
}

export function renderCodexOverlay(state: CodexOverlayState, width: number, maxHeight: number): string[] {
  const outerWidth = Math.max(24, Math.min(width, 88))
  const innerWidth = Math.max(0, outerWidth - 4)
  const bodyLines = state.body.flatMap((line) => wrapText(line, innerWidth)).map((line) => padLine(line, innerWidth))
  const blocks = optionBlocks(state, innerWidth)
  const selectedBlockRows = blocks[Math.max(0, Math.min(state.selectedIndex, Math.max(blocks.length - 1, 0)))]?.lines.length ?? 0
  const baseFixedRows = 5
  const boundedContentRows = maxHeight > 0 ? Math.max(0, maxHeight - baseFixedRows) : Number.POSITIVE_INFINITY
  const bodyBudget = Number.isFinite(boundedContentRows)
    ? Math.max(0, boundedContentRows - selectedBlockRows)
    : bodyLines.length
  const clippedBody = clippedBodyRows(bodyLines, bodyBudget)
  const optionViewportRows = Number.isFinite(boundedContentRows)
    ? Math.max(0, boundedContentRows - clippedBody.rows.length)
    : blocks.reduce((sum, block) => sum + block.lines.length, 0)
  const visibleOptions = visibleOptionRows(blocks, state.selectedIndex, optionViewportRows)
  const footerHint = [
    state.footerHint ?? '↑/↓ move | Enter confirm | Esc cancel',
    ...(visibleOptions.optionsHidden ? [`option ${Math.max(1, state.selectedIndex + 1)}/${state.options.length}`] : []),
  ].join(' | ')

  return [
    boxLine('┌', ` ${state.title} `, '┐', outerWidth),
    ...clippedBody.rows.map((line) => boxLine('│', ` ${line} `, '│', outerWidth)),
    boxLine('│', ''.padEnd(innerWidth + 2, ' '), '│', outerWidth),
    ...visibleOptions.rows.map((line) => boxLine('│', ` ${line} `, '│', outerWidth)),
    boxLine('│', ''.padEnd(innerWidth + 2, ' '), '│', outerWidth),
    boxLine('│', ` ${padLine(footerHint, innerWidth)} `, '│', outerWidth),
    boxLine('└', ''.padEnd(innerWidth + 2, '─'), '┘', outerWidth),
  ]
}
