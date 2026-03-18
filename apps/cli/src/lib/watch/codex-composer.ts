// Directly inspired by codex-rs/tui/src/bottom_pane/chat_composer.rs.
// This keeps watch input state in a dedicated module so the TUI can grow
// toward Codex behavior without burying editing logic inside display.ts.

const DEFAULT_PLACEHOLDER = 'Ask LinX to do anything'
const ANSWER_PLACEHOLDER = 'Type your answer'
const MAX_HISTORY_ENTRIES = 100
const DEFAULT_PROMPT_PREFIX = '› '

export interface CodexComposerRenderLine {
  prefix: string
  text: string
  isPlaceholder: boolean
}

export interface CodexComposerRenderResult {
  lines: CodexComposerRenderLine[]
  cursorRow: number
  cursorCol: number
}

function chunkText(text: string, firstWidth: number, continuationWidth: number): string[] {
  const safeFirstWidth = Math.max(1, firstWidth)
  const safeContinuationWidth = Math.max(1, continuationWidth)
  const logicalLines = text.split('\n')
  const chunks: string[] = []

  logicalLines.forEach((logicalLine, logicalIndex) => {
    const width = logicalIndex === 0 ? safeFirstWidth : safeContinuationWidth
    const fallback = logicalLine.length === 0 ? [''] : []

    if (logicalLine.length === 0) {
      chunks.push(...fallback)
      return
    }

    let remaining = logicalLine
    while (remaining.length > width) {
      chunks.push(remaining.slice(0, width))
      remaining = remaining.slice(width)
    }
    chunks.push(remaining)
  })

  return chunks.length > 0 ? chunks : ['']
}

function locateCursor(value: string, cursor: number, firstWidth: number, continuationWidth: number): {
  row: number
  columnInText: number
} {
  const safeCursor = Math.max(0, Math.min(cursor, value.length))
  const safeFirstWidth = Math.max(1, firstWidth)
  const safeContinuationWidth = Math.max(1, continuationWidth)
  const logicalLines = value.split('\n')
  let remaining = safeCursor
  let row = 0

  for (let lineIndex = 0; lineIndex < logicalLines.length; lineIndex += 1) {
    const logicalLine = logicalLines[lineIndex] ?? ''
    const width = lineIndex === 0 ? safeFirstWidth : safeContinuationWidth
    const segments = logicalLine.length === 0 ? [''] : chunkText(logicalLine, width, width)

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex] ?? ''
      if (remaining <= segment.length) {
        return { row, columnInText: remaining }
      }

      remaining -= segment.length
      row += 1
    }

    if (lineIndex < logicalLines.length - 1) {
      if (remaining === 0) {
        return { row, columnInText: 0 }
      }

      remaining -= 1
      if (remaining < 0) {
        return { row, columnInText: 0 }
      }
    }
  }

  const lastLine = chunkText(value, safeFirstWidth, safeContinuationWidth).at(-1) ?? ''
  return {
    row: Math.max(0, chunkText(value, safeFirstWidth, safeContinuationWidth).length - 1),
    columnInText: lastLine.length,
  }
}

export function placeholderForPrompt(prompt: string): string {
  const normalized = prompt.trim().toLowerCase()
  if (normalized.startsWith('answer')) {
    return ANSWER_PLACEHOLDER
  }

  return DEFAULT_PLACEHOLDER
}

export class CodexComposer {
  private value = ''
  private cursor = 0
  private history: string[] = []
  private historyIndex: number | null = null
  private draftBeforeHistory = ''
  private placeholder = DEFAULT_PLACEHOLDER
  private promptPrefix = DEFAULT_PROMPT_PREFIX

  beginPrompt(prompt: string): void {
    this.value = ''
    this.cursor = 0
    this.historyIndex = null
    this.draftBeforeHistory = ''
    this.placeholder = placeholderForPrompt(prompt)
    this.promptPrefix = DEFAULT_PROMPT_PREFIX
  }

  text(): string {
    return this.value
  }

  cursorIndex(): number {
    return this.cursor
  }

  hasDraft(): boolean {
    return this.value.trim().length > 0
  }

  isBrowsingHistory(): boolean {
    return this.historyIndex !== null
  }

  setText(value: string, cursor = value.length): void {
    this.value = value
    this.cursor = Math.max(0, Math.min(cursor, value.length))
  }

  recordSubmission(value: string): void {
    const safeValue = value.trim()
    if (!safeValue) {
      this.historyIndex = null
      this.draftBeforeHistory = ''
      return
    }

    if (this.history.at(-1) !== safeValue) {
      this.history.push(safeValue)
      if (this.history.length > MAX_HISTORY_ENTRIES) {
        this.history.splice(0, this.history.length - MAX_HISTORY_ENTRIES)
      }
    }

    this.historyIndex = null
    this.draftBeforeHistory = ''
  }

  insert(text: string): void {
    if (!text) {
      return
    }

    this.value = `${this.value.slice(0, this.cursor)}${text}${this.value.slice(this.cursor)}`
    this.cursor += text.length
    this.historyIndex = null
  }

  backspace(): void {
    if (this.cursor === 0) {
      return
    }

    this.value = `${this.value.slice(0, this.cursor - 1)}${this.value.slice(this.cursor)}`
    this.cursor -= 1
    this.historyIndex = null
  }

  deleteForward(): void {
    if (this.cursor >= this.value.length) {
      return
    }

    this.value = `${this.value.slice(0, this.cursor)}${this.value.slice(this.cursor + 1)}`
    this.historyIndex = null
  }

  moveLeft(): void {
    this.cursor = Math.max(0, this.cursor - 1)
  }

  moveRight(): void {
    this.cursor = Math.min(this.value.length, this.cursor + 1)
  }

  moveToStart(): void {
    this.cursor = 0
  }

  moveToEnd(): void {
    this.cursor = this.value.length
  }

  deleteToStart(): void {
    if (this.cursor === 0) {
      return
    }

    this.value = this.value.slice(this.cursor)
    this.cursor = 0
    this.historyIndex = null
  }

  deleteToEnd(): void {
    if (this.cursor >= this.value.length) {
      return
    }

    this.value = this.value.slice(0, this.cursor)
    this.historyIndex = null
  }

  navigateHistory(direction: 'up' | 'down'): boolean {
    if (this.history.length === 0) {
      return false
    }

    if (direction === 'up') {
      if (this.historyIndex === null) {
        this.draftBeforeHistory = this.value
        this.historyIndex = this.history.length - 1
      } else if (this.historyIndex > 0) {
        this.historyIndex -= 1
      }
    } else if (this.historyIndex === null) {
      return false
    } else if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1
    } else {
      this.historyIndex = null
      this.setText(this.draftBeforeHistory)
      return true
    }

    const nextValue = this.historyIndex === null
      ? this.draftBeforeHistory
      : (this.history[this.historyIndex] ?? '')
    this.setText(nextValue)
    return true
  }

  render(width: number): CodexComposerRenderResult {
    const safeWidth = Math.max(4, width)
    const contentWidth = Math.max(1, safeWidth - this.promptPrefix.length)
    const visibleText = this.value.length > 0 ? this.value : this.placeholder
    const chunks = chunkText(visibleText, contentWidth, contentWidth)
    const lines = chunks.map((chunk, index) => ({
      prefix: index === 0 ? this.promptPrefix : ' '.repeat(this.promptPrefix.length),
      text: chunk,
      isPlaceholder: this.value.length === 0,
    }))
    const cursor = this.value.length === 0
      ? { row: 0, columnInText: 0 }
      : locateCursor(this.value, this.cursor, contentWidth, contentWidth)

    return {
      lines,
      cursorRow: cursor.row,
      cursorCol: this.promptPrefix.length + cursor.columnInText + 1,
    }
  }
}
