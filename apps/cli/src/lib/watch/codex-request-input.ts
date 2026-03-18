// Directly adapted from codex-rs/tui/src/bottom_pane/request_user_input/*.
// This keeps question/progress/options rendering separate from approval overlays.

import { CodexComposer } from './codex-composer.js'

export interface CodexRequestInputOption {
  label: string
  value: string
  description?: string
  shortcuts?: string[]
}

export interface CodexRequestInputState {
  header: string
  question: string
  options: CodexRequestInputOption[]
  selectedIndex: number
  questionIndex: number
  questionCount: number
  unansweredCount: number
  answerValue?: string
  answerCursor?: number
  footerHint?: string
}

export interface CodexRequestInputRenderResult {
  lines: string[]
  cursorLineIndex?: number
  cursorCol?: number
}

interface CodexRequestInputOptionBlock {
  optionIndex: number
  lines: string[]
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

function progressLabel(state: CodexRequestInputState): string {
  const index = state.questionIndex + 1
  const base = `Question ${index}/${state.questionCount}`
  return state.unansweredCount > 0 ? `${base} (${state.unansweredCount} unanswered)` : base
}

function optionBlocks(state: CodexRequestInputState, width: number): CodexRequestInputOptionBlock[] {
  return state.options.map((option, index) => {
    const selected = index === state.selectedIndex
    const shortcutText = option.shortcuts && option.shortcuts.length > 0
      ? ` [${option.shortcuts.join('/')}]`
      : ''
    const prefix = `${selected ? '›' : ' '} ${index + 1}. `
    const lines: string[] = []
    const labelLines = wrapText(`${option.label}${shortcutText}`, Math.max(1, width - prefix.length))
    labelLines.forEach((line, lineIndex) => {
      const linePrefix = lineIndex === 0 ? prefix : ' '.repeat(prefix.length)
      lines.push(padLine(`${linePrefix}${line}`, width))
    })

    if (option.description) {
      const descriptionIndent = ' '.repeat(prefix.length)
      const descriptionLines = wrapText(option.description, Math.max(1, width - descriptionIndent.length))
      descriptionLines.forEach((line) => {
        lines.push(padLine(`${descriptionIndent}${line}`, width))
      })
    }

    return {
      optionIndex: index,
      lines,
    }
  })
}

function visibleOptionRows(
  blocks: CodexRequestInputOptionBlock[],
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

function answerComposerRender(state: CodexRequestInputState, width: number): {
  lines: string[]
  cursorLineIndex: number
  cursorCol: number
} {
  const composer = new CodexComposer()
  const answerValue = state.answerValue ?? ''
  composer.beginPrompt('answer> ')
  composer.setText(answerValue, state.answerCursor ?? answerValue.length)

  const rendered = composer.render(width)
  return {
    lines: rendered.lines.map((line) => padLine(`${line.prefix}${line.text}`, width)),
    cursorLineIndex: rendered.cursorRow,
    cursorCol: rendered.cursorCol,
  }
}

export function renderCodexRequestInputDetailed(
  state: CodexRequestInputState,
  width: number,
  maxHeight: number,
): CodexRequestInputRenderResult {
  const outerWidth = Math.max(28, Math.min(width, 88))
  const innerWidth = Math.max(0, outerWidth - 4)
  const questionLines = wrapText(state.question, innerWidth)
  const hasOptions = state.options.length > 0
  const optionBlocksData = hasOptions ? optionBlocks(state, innerWidth) : []
  const fixedLineCount = 1 + 1 + questionLines.length + 1 + 1 + 1 + 1
  const maxOptionRows = maxHeight > 0 ? Math.max(0, maxHeight - fixedLineCount) : Number.POSITIVE_INFINITY
  const visibleOptions = hasOptions
    ? visibleOptionRows(optionBlocksData, state.selectedIndex, maxOptionRows)
    : { rows: [], optionsHidden: false }
  const optionRows = hasOptions ? visibleOptions.rows : []
  const answerRows = hasOptions ? null : answerComposerRender(state, innerWidth)
  const hint = hasOptions
    ? [
      state.footerHint ?? '↑/↓ move | Enter confirm | 1-9 select',
      ...(visibleOptions.optionsHidden ? [`option ${Math.max(1, state.selectedIndex + 1)}/${state.options.length}`] : []),
    ].filter((part): part is string => Boolean(part)).join(' | ')
    : (state.footerHint ? `Type your answer | ${state.footerHint}` : 'Type your answer | Enter confirm')

  let lines = [
    boxLine('┌', ` ${state.header} `, '┐', outerWidth),
    boxLine('│', ` ${padLine(progressLabel(state), innerWidth)} `, '│', outerWidth),
    ...questionLines.map((line) => boxLine('│', ` ${padLine(line, innerWidth)} `, '│', outerWidth)),
    boxLine('│', ''.padEnd(innerWidth + 2, ' '), '│', outerWidth),
    ...(hasOptions
      ? optionRows.map((line) => boxLine('│', ` ${line} `, '│', outerWidth))
      : (answerRows?.lines ?? []).map((line) => boxLine('│', ` ${line} `, '│', outerWidth))),
    boxLine('│', ''.padEnd(innerWidth + 2, ' '), '│', outerWidth),
    boxLine('│', ` ${padLine(hint, innerWidth)} `, '│', outerWidth),
    boxLine('└', ''.padEnd(innerWidth + 2, '─'), '┘', outerWidth),
  ]
  let cursorLineIndex = hasOptions || !answerRows
    ? undefined
    : 2 + questionLines.length + 1 + answerRows.cursorLineIndex
  let cursorCol = hasOptions || !answerRows
    ? undefined
    : 2 + answerRows.cursorCol

  if (maxHeight > 0 && lines.length > maxHeight) {
    lines = lines.slice(0, Math.max(1, maxHeight - 1))
    lines.push(boxLine('└', ''.padEnd(innerWidth + 2, '─'), '┘', outerWidth))
    if (
      cursorLineIndex !== undefined
      && cursorLineIndex >= Math.max(1, maxHeight - 1)
    ) {
      cursorLineIndex = undefined
      cursorCol = undefined
    }
  }

  return {
    lines,
    cursorLineIndex,
    cursorCol,
  }
}

export function renderCodexRequestInput(state: CodexRequestInputState, width: number, maxHeight: number): string[] {
  return renderCodexRequestInputDetailed(state, width, maxHeight).lines
}
