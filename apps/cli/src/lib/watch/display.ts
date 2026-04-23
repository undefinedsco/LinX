import { emitKeypressEvents } from 'node:readline'
import { stdin, stdout } from 'node:process'
import type { WatchUserInputAnswers, WatchUserInputQuestion } from '@linx/models/watch'
import { CodexComposer, type CodexComposerRenderLine } from './codex-composer.js'
import { renderFooterLine } from './codex-footer.js'
import { CodexRequestForm } from './codex-request-form.js'
import { renderCodexOverlay, type CodexOverlayOption, type CodexOverlayState } from './codex-overlay.js'
import {
  renderCodexRequestInputDetailed,
  type CodexRequestInputOption,
  type CodexRequestInputState,
} from './codex-request-input.js'
import type {
  WatchEventLogEntry,
  WatchInputController,
  WatchNormalizedEvent,
  WatchPromptSubmission,
  WatchQueueState,
  WatchSessionRecord,
  WatchUiActivityTone,
  WatchUiEntry,
} from './types.js'

type PromptText = (prompt: string, signal?: AbortSignal) => Promise<string>

export type WatchDisplayPhase = 'starting' | 'ready' | 'running' | 'approval' | 'question'

interface WatchDisplayState {
  phase: WatchDisplayPhase
  detail?: string
  since: number
}

type WatchOverlayState =
  | { kind: 'selection'; value: CodexOverlayState }
  | { kind: 'request-input'; value: CodexRequestInputState }
  | { kind: 'request-form'; value: CodexRequestForm }

interface OverlayRenderResult {
  lines: string[]
  cursorRow?: number
  cursorCol?: number
}

export interface WatchDisplay {
  start(): void
  updateRecord(record: WatchSessionRecord): void
  updateQueue(state: WatchQueueState): void
  bindInputController(controller: WatchInputController | null): void
  setPhase(phase: WatchDisplayPhase, detail?: string): void
  showActivity(text: string, tone?: WatchUiActivityTone): void
  setDebugMode(enabled: boolean): void
  chooseOption(title: string, lines: string[], options: CodexOverlayOption[], signal?: AbortSignal): Promise<string>
  chooseQuestions(questions: WatchUserInputQuestion[]): Promise<WatchUserInputAnswers>
  chooseQuestion(state: {
    header: string
    question: string
    options: CodexRequestInputOption[]
    questionIndex: number
    questionCount: number
    unansweredCount: number
  }): Promise<string>
  showUserTurn(text: string): void
  showHelp(): void
  showQuestion(lines: string[]): void
  renderEvents(events: WatchNormalizedEvent[]): void
  renderRawLine(stream: WatchEventLogEntry['stream'], line: string): void
  promptInput(prompt: string): Promise<WatchPromptSubmission>
  finish(status: 'completed' | 'failed', record: WatchSessionRecord, error?: string): void
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
} as const

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function supportsWatchTui(): boolean {
  if (process.env.LINX_WATCH_PLAIN === '1') {
    return false
  }

  if (!stdout.isTTY || !stdin.isTTY) {
    return false
  }

  return process.env.TERM !== 'dumb'
}

function clipLine(text: string, width: number): string {
  if (width <= 0) {
    return ''
  }

  if (text.length <= width) {
    return text.padEnd(width, ' ')
  }

  if (width === 1) {
    return text.slice(0, 1)
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

function shortSessionId(id: string): string {
  if (id.length <= 24) {
    return id
  }

  return `${id.slice(0, 12)}...${id.slice(-8)}`
}

function applyAnsi(text: string, ...styles: string[]): string {
  if (!text) {
    return text
  }

  return `${styles.join('')}${text}${ANSI.reset}`
}

export function formatWatchElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
}

function statusGlyph(phase: WatchDisplayPhase, elapsedMs: number): string {
  if (phase === 'starting' || phase === 'running') {
    const frames = ['-', '\\', '|', '/']
    return frames[Math.floor(elapsedMs / 125) % frames.length] ?? '-'
  }

  if (phase === 'approval' || phase === 'question') {
    return '?'
  }

  return '>'
}

function statusLabel(phase: WatchDisplayPhase): string {
  switch (phase) {
    case 'starting':
      return 'Starting'
    case 'ready':
      return 'Ready'
    case 'running':
      return 'Working'
    case 'approval':
      return 'Approval required'
    case 'question':
      return 'Input required'
  }
}

function statusHint(phase: WatchDisplayPhase): string {
  switch (phase) {
    case 'starting':
      return 'Ctrl+C to exit'
    case 'ready':
      return 'Enter to send | /help | /exit'
    case 'running':
      return 'Ctrl+C to exit'
    case 'approval':
      return 'y/s/n/c'
    case 'question':
      return 'answer + Enter'
  }
}

function compactStatusDetail(detail?: string): string | undefined {
  if (!detail) {
    return undefined
  }

  const normalized = detail.trim()
  if (!normalized) {
    return undefined
  }

  if (normalized.length <= 24) {
    return normalized
  }

  return `${normalized.slice(0, 21)}...`
}

function shortPath(value: string, width = 28): string {
  if (value.length <= width) {
    return value
  }

  const parts = value.split('/').filter(Boolean)
  if (parts.length === 0) {
    return value.slice(-width)
  }

  const tail = parts.slice(-2).join('/')
  if (tail.length + 4 <= width) {
    return `.../${tail}`
  }

  return `...${value.slice(-(width - 3))}`
}

function footerHintForPhase(phase: WatchDisplayPhase): { emptyHint: string; draftHint: string } {
  switch (phase) {
    case 'starting':
      return {
        emptyHint: 'Starting',
        draftHint: 'Starting',
      }
    case 'ready':
      return {
        emptyHint: '/help · /exit · /model <id> · /debug on|off',
        draftHint: 'Enter send · Shift+Enter newline · Alt+Enter follow-up',
      }
    case 'running':
      return {
        emptyHint: '/help · /exit · /model <id> · /debug on|off',
        draftHint: 'Enter steer · Shift+Enter newline · Alt+Enter follow-up',
      }
    case 'approval':
      return {
        emptyHint: 'Approve: y · session: s · reject: n · cancel: c',
        draftHint: 'Approve: y · session: s · reject: n · cancel: c',
      }
    case 'question':
      return {
        emptyHint: 'Answer and press Enter',
        draftHint: 'Answer and press Enter',
      }
  }
}

function summarizeToolField(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => summarizeToolField(entry))
      .filter((entry): entry is string => Boolean(entry))

    return parts.length > 0 ? parts.join(' ') : undefined
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return undefined
}

export function summarizeWatchToolCall(name: string, args?: Record<string, unknown>): string {
  const detail = args
    ? summarizeToolField(
      args.command
      ?? args.cmd
      ?? args.pattern
      ?? args.query
      ?? args.path
      ?? args.filePath
      ?? args.file
      ?? args.url
      ?? args.cwd,
    )
    : undefined

  if (!detail) {
    return name
  }

  const summarizedDetail = /^(\/|~\/|\.\.?\/)/.test(detail) ? shortPath(detail, 40) : detail
  return `${name} · ${summarizedDetail}`
}

export function summarizeWatchDebugPayload(raw: unknown): { text: string; detail?: string } {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) {
      return { text: 'raw event' }
    }

    if (trimmed.length <= 96) {
      return { text: trimmed }
    }

    return {
      text: `${trimmed.slice(0, 93)}...`,
      detail: trimmed,
    }
  }

  const serialized = JSON.stringify(raw)
  if (!serialized) {
    return { text: 'raw event' }
  }

  try {
    const parsed = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : null
    const method = typeof parsed?.method === 'string' ? parsed.method : undefined
    const update = typeof parsed?.params === 'object' && parsed.params !== null
      ? (parsed.params as Record<string, unknown>).update as Record<string, unknown> | undefined
      : undefined
    const updateType = typeof update?.sessionUpdate === 'string'
      ? update.sessionUpdate
      : typeof update?.type === 'string'
        ? update.type
        : undefined
    const summary = method ?? updateType ?? 'raw event'

    if (serialized.length <= 120) {
      return { text: `${summary} · ${serialized}` }
    }

    return {
      text: summary,
      detail: serialized,
    }
  } catch {
    if (serialized.length <= 96) {
      return { text: serialized }
    }

    return {
      text: `${serialized.slice(0, 93)}...`,
      detail: serialized,
    }
  }
}

function editorBorderColor(phase: WatchDisplayPhase): string {
  switch (phase) {
    case 'starting':
      return ANSI.dim
    case 'ready':
      return ANSI.cyan
    case 'running':
      return ANSI.magenta
    case 'approval':
      return ANSI.cyan
    case 'question':
      return ANSI.green
  }
}

function renderBorderBox(lines: string[], width: number, title: string, color: string): string[] {
  const innerWidth = Math.max(1, width - 4)
  const label = title.trim() ? ` ${title.trim()} ` : ''
  const topPlain = `┌${label}${'─'.repeat(Math.max(0, width - label.length - 2))}┐`
  const bottomPlain = `└${'─'.repeat(Math.max(0, width - 2))}┘`

  return [
    applyAnsi(clipLine(topPlain, width), color),
    ...lines.map((line) => {
      const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
      const padded = clipLine(plain, innerWidth)
      return `${applyAnsi('│ ', color)}${line}${' '.repeat(Math.max(0, innerWidth - plain.length))}${applyAnsi(' │', color)}`
    }),
    applyAnsi(clipLine(bottomPlain, width), color),
  ]
}

export function formatWatchHeaderLine(record: WatchSessionRecord, width: number): string {
  const source = record.resolvedCredentialSource ?? record.credentialSource
  return clipLine(
    ` LinX watch | ${record.backend} | ${record.status} | mode=${record.mode} | runtime=${record.runtime} | source=${source} | ${shortSessionId(record.id)} `,
    width,
  )
}

export function formatWatchStatusLine(
  state: WatchDisplayState,
  width: number,
  now = Date.now(),
): string {
  const elapsedMs = Math.max(0, now - state.since)
  const parts = [
    `${statusGlyph(state.phase, elapsedMs)} ${statusLabel(state.phase)} (${formatWatchElapsed(elapsedMs)})`,
    compactStatusDetail(state.detail),
    statusHint(state.phase),
  ].filter((part): part is string => Boolean(part))

  return clipLine(` ${parts.join(' | ')} `, width)
}

export function formatWatchQueueLine(queueState: WatchQueueState, width: number): string {
  const parts: string[] = []
  if (queueState.steeringCount > 0) {
    parts.push(`steer ${queueState.steeringCount}`)
  }
  if (queueState.followUpCount > 0) {
    parts.push(`follow-up ${queueState.followUpCount}`)
  }

  if (parts.length === 0) {
    return clipLine(' Queue empty ', width)
  }

  return clipLine(` Queued | ${parts.join(' | ')} `, width)
}

export function formatWatchFooterContext(record: WatchSessionRecord): string {
  const source = record.resolvedCredentialSource ?? record.credentialSource
  return [
    shortPath(record.cwd),
    `session=${shortSessionId(record.id)}`,
    record.model ? `model=${shortSessionId(record.model)}` : null,
    `source=${source}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' | ')
}

export function formatWatchFooterLine(input: {
  width: number
  phase: WatchDisplayPhase
  record: WatchSessionRecord
  hasDraft: boolean
}): string {
  const hints = footerHintForPhase(input.phase)
  return renderFooterLine(
    {
      mode: input.hasDraft ? 'ComposerHasDraft' : 'ComposerEmpty',
      emptyHint: hints.emptyHint,
      draftHint: hints.draftHint,
      context: formatWatchFooterContext(input.record),
    },
    input.width,
  )
}

export function formatWatchActivityPanelLines(input: {
  width: number
  maxHeight: number
  entries: WatchUiEntry[]
  hideToolOutput?: boolean
  debugMode?: boolean
}): string[] {
  if (input.maxHeight <= 2) {
    return []
  }

  const visibleEntries = input.hideToolOutput
    ? input.entries.filter((entry) => entry.kind !== 'tool')
    : input.entries

  const innerWidth = Math.max(1, input.width - 4)
  const toolEntries = visibleEntries.filter((entry) => entry.kind === 'tool')
  const debugEntries = visibleEntries.filter((entry) => entry.kind === 'debug')
  const statusEntries = visibleEntries.filter((entry) => entry.kind !== 'tool' && entry.kind !== 'debug')

  const groups: string[][] = []
  const pushGroup = (label: string, lines: string[]) => {
    if (lines.length === 0) {
      return
    }

    const group: string[] = [
      applyAnsi(clipLine(label, innerWidth), ANSI.bold, ANSI.dim),
      ...lines,
    ]

    groups.push(group)
  }

  const renderToolLines = (entry: WatchUiEntry): string[] => {
    return [applyAnsi(clipLine(`[tool] ${entry.text}`, innerWidth), ANSI.green)]
  }

  const renderStatusLines = (entry: WatchUiEntry): string[] => {
    if (entry.kind === 'success') {
      return [applyAnsi(clipLine(`[session] ${entry.text}`, innerWidth), ANSI.green)]
    }

    if (entry.kind === 'error') {
      return wrapText(`[error] ${entry.text}`, innerWidth).map((line) => applyAnsi(clipLine(line, innerWidth), ANSI.red))
    }

    const label = /approval/i.test(entry.text)
      ? '[approval]'
      : /input/i.test(entry.text)
        ? '[input]'
        : '[note]'
    return wrapText(`${label} ${entry.text}`, innerWidth).map((line) => applyAnsi(clipLine(line, innerWidth), ANSI.dim))
  }

  const renderDebugLines = (entry: WatchUiEntry): string[] => {
    if (entry.kind !== 'debug') {
      return []
    }

    const debugLines = wrapText(`[debug] ${entry.text}`, innerWidth)
    if (entry.detail) {
      debugLines.push(...wrapText(`        ${entry.detail}`, innerWidth))
    }
    return debugLines.map((line) => applyAnsi(clipLine(line, innerWidth), ANSI.dim))
  }

  pushGroup('status', statusEntries.slice(-2).flatMap((entry) => renderStatusLines(entry)))
  pushGroup('tools', toolEntries.slice(-2).flatMap((entry) => renderToolLines(entry)))
  pushGroup('debug', debugEntries.slice(-1).flatMap((entry) => renderDebugLines(entry)))

  const maxContentLines = Math.max(0, input.maxHeight - 2)
  const selectedGroups: string[][] = []
  let remaining = maxContentLines

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index] ?? []
    const separatorCost = selectedGroups.length > 0 ? 1 : 0
    const required = group.length + separatorCost
    if (required > remaining) {
      continue
    }

    selectedGroups.push(group)
    remaining -= required
  }

  const contentLines = selectedGroups.flatMap((group, index) => {
    const result: string[] = []
    if (index > 0) {
      result.push(applyAnsi(clipLine('·'.repeat(Math.min(innerWidth, 12)), innerWidth), ANSI.dim))
    }
    result.push(...group)
    return result
  })

  if (contentLines.length === 0) {
    return []
  }

  const title = input.debugMode ? 'activity | debug' : 'activity'
  return renderBorderBox(contentLines, input.width, title, ANSI.dim)
}

export function selectWatchFooterSectionCounts(input: {
  totalHeight: number
  headerCount: number
  contextCount: number
  showStatus: boolean
  queueCount: number
  promptCount: number
}): {
  contextCount: number
  statusCount: number
  queueCount: number
} {
  let remaining = Math.max(0, input.totalHeight - input.headerCount - input.promptCount - 1)

  const statusCount = input.showStatus && remaining > 0 ? 1 : 0
  remaining -= statusCount

  const queueCount = Math.min(input.queueCount, remaining)
  remaining -= queueCount

  const contextCount = Math.min(input.contextCount, remaining)

  return {
    contextCount,
    statusCount,
    queueCount,
  }
}

export function formatWatchTranscriptLine(line: string, width: number): string[] {
  if (line.startsWith('you> ')) {
    return wrapPrefixedLine('you ', line.slice(5), width, ANSI.cyan)
  }

  if (line.startsWith('linx> ')) {
    return wrapPrefixedLine('linx ', line.slice(6), width, ANSI.magenta)
  }

  if (line.startsWith('assistant> ')) {
    return wrapPrefixedLine('linx ', line.slice(11), width, ANSI.magenta)
  }

  if (line.startsWith('[tool] ')) {
    return [applyAnsi(clipLine(line, width), ANSI.green)]
  }

  if (line.startsWith('[approval] ') || line.startsWith('[input] ')) {
    return [applyAnsi(clipLine(line, width), ANSI.cyan)]
  }

  if (line.startsWith('[note] ')) {
    return [applyAnsi(clipLine(line, width), ANSI.dim)]
  }

  if (line.startsWith('[session] completed')) {
    return [applyAnsi(clipLine(line, width), ANSI.green)]
  }

  if (line.startsWith('[session] failed') || line.startsWith('stderr> ') || line.startsWith('[error] ')) {
    return [applyAnsi(clipLine(line, width), ANSI.red)]
  }

  return wrapText(line, width).map((entry) => clipLine(entry, width))
}

function wrapPrefixedLine(prefix: string, content: string, width: number, color: string): string[] {
  const safeWidth = Math.max(width, prefix.length + 1)
  const firstWidth = Math.max(1, safeWidth - prefix.length)
  const continuationPrefix = ' '.repeat(prefix.length)
  const plainLines = wrapText(content || ' ', firstWidth)

  return plainLines.map((entry, index) => {
    const prefixText = index === 0 ? prefix : continuationPrefix
    const padded = clipLine(`${prefixText}${entry}`, safeWidth)
    const visiblePrefix = index === 0 ? applyAnsi(prefix, ANSI.bold, color) : continuationPrefix
    return `${visiblePrefix}${padded.slice(prefixText.length)}`
  })
}

function styleStatusLine(line: string): string {
  return applyAnsi(line, ANSI.cyan)
}

function styleContextLine(line: string, width: number): string {
  if (/^\s+\d+\./.test(line)) {
    return applyAnsi(clipLine(line, width), ANSI.dim)
  }

  return applyAnsi(clipLine(line, width), ANSI.cyan)
}

function styleComposerLine(line: CodexComposerRenderLine, width: number): string {
  const raw = clipLine(`${line.prefix}${line.text}`, width)
  const prefix = applyAnsi(line.prefix, ANSI.cyan, ANSI.bold)
  const value = raw.slice(line.prefix.length)
  if (line.isPlaceholder) {
    return `${prefix}${applyAnsi(value, ANSI.dim)}`
  }

  return `${prefix}${value}`
}

function centerLine(text: string, width: number): string {
  const visible = text.length
  if (visible >= width) {
    return clipLine(text, width)
  }

  const leftPadding = Math.max(0, Math.floor((width - visible) / 2))
  return `${' '.repeat(leftPadding)}${text}`.padEnd(width, ' ')
}

function styleOverlayLine(line: string): string {
  const leftPadding = line.match(/^\s*/u)?.[0] ?? ''
  const content = line.slice(leftPadding.length)

  if (content.startsWith('┌') || content.startsWith('└')) {
    return `${leftPadding}${applyAnsi(content, ANSI.dim)}`
  }

  if (content.includes('› ')) {
    return `${leftPadding}${content.replace('› ', applyAnsi('› ', ANSI.cyan, ANSI.bold))}`
  }

  if (content.includes('> ')) {
    return `${leftPadding}${content.replace('> ', applyAnsi('> ', ANSI.cyan, ANSI.bold))}`
  }

  return line
}

function withRequestInputComposer(
  state: CodexRequestInputState,
  edit: (composer: CodexComposer) => void,
): void {
  const composer = new CodexComposer()
  const answerValue = state.answerValue ?? ''
  composer.beginPrompt('answer> ')
  composer.setText(answerValue, state.answerCursor ?? answerValue.length)
  edit(composer)
  state.answerValue = composer.text()
  state.answerCursor = composer.cursorIndex()
}

class PlainWatchDisplay implements WatchDisplay {
  private readonly renderState = { hasAssistantOutput: false }
  private record: WatchSessionRecord
  private readonly prompt: PromptText
  private queueState: WatchQueueState = { steeringCount: 0, followUpCount: 0 }

  constructor(record: WatchSessionRecord, prompt: PromptText) {
    this.record = record
    this.prompt = prompt
  }

  start(): void {
    stdout.write(
      `LinX watch\nsession: ${this.record.id}\nbackend: ${this.record.backend}\nruntime: ${this.record.runtime}\nmode: ${this.record.mode}\ncmd: ${this.record.command} ${this.record.args.join(' ')}\n\n`,
    )
  }

  updateRecord(record: WatchSessionRecord): void {
    this.record = record
  }

  updateQueue(state: WatchQueueState): void {
    this.queueState = state
  }

  bindInputController(): void {}

  setPhase(): void {}

  showActivity(text: string, tone: WatchUiActivityTone = 'note'): void {
    const prefix = tone === 'success'
      ? '[ok]'
      : tone === 'error'
        ? '[error]'
        : tone === 'debug'
          ? '[debug]'
        : '[note]'
    stdout.write(`${prefix} ${text}\n`)
  }

  setDebugMode(enabled: boolean): void {
    this.showActivity(`Debug protocol view ${enabled ? 'enabled' : 'disabled'}`)
  }

  async chooseOption(title: string, lines: string[], options: CodexOverlayOption[], signal?: AbortSignal): Promise<string> {
    stdout.write(`${title}\n`)
    for (const line of lines) {
      stdout.write(`${line}\n`)
    }
    options.forEach((option, index) => {
      const suffix = option.description ? ` - ${option.description}` : ''
      stdout.write(`  ${index + 1}. ${option.label}${suffix}\n`)
    })
    const raw = (await this.prompt('select> ', signal)).trim()

    if (/^\d+$/u.test(raw)) {
      const option = options[Number(raw) - 1]
      if (option) {
        return option.value
      }
    }

    return raw
  }

  async chooseQuestion(state: {
    header: string
    question: string
    options: CodexRequestInputOption[]
    questionIndex: number
    questionCount: number
    unansweredCount: number
  }): Promise<string> {
    stdout.write(`${state.header}\n`)
    stdout.write(`Question ${state.questionIndex + 1}/${state.questionCount}\n`)
    stdout.write(`${state.question}\n`)
    state.options.forEach((option, index) => {
      const suffix = option.description ? ` - ${option.description}` : ''
      stdout.write(`  ${index + 1}. ${option.label}${suffix}\n`)
    })
    const raw = (await this.prompt(state.options.length > 0 ? 'select> ' : 'answer> ')).trim()

    if (/^\d+$/u.test(raw)) {
      const option = state.options[Number(raw) - 1]
      if (option) {
        return option.value
      }
    }

    return raw
  }

  async chooseQuestions(questions: WatchUserInputQuestion[]): Promise<WatchUserInputAnswers> {
    const answers: WatchUserInputAnswers = {}

    for (const [index, question] of questions.entries()) {
      const raw = await this.chooseQuestion({
        header: question.header,
        question: question.question,
        options: question.options.map((option, optionIndex) => ({
          label: option.label,
          value: option.label,
          description: option.description,
          shortcuts: [`${optionIndex + 1}`],
        })),
        questionIndex: index,
        questionCount: questions.length,
        unansweredCount: Math.max(1, questions.length - index),
      })
      answers[question.id] = {
        answers: raw.trim() ? [raw.trim()] : [],
      }
    }

    return answers
  }

  showUserTurn(text: string): void {
    stdout.write(`you> ${text}\n`)
  }

  showHelp(): void {
    stdout.write('/help 查看帮助\n/exit 退出当前 watch 会话\n\n')
  }

  showQuestion(lines: string[]): void {
    for (const line of lines) {
      stdout.write(`${line}\n`)
    }
  }

  private flushAssistantLine(): void {
    if (this.renderState.hasAssistantOutput) {
      stdout.write('\n')
      this.renderState.hasAssistantOutput = false
    }
  }

  renderEvents(events: WatchNormalizedEvent[]): void {
    for (const event of events) {
      if (event.type === 'assistant.delta') {
        stdout.write(event.text)
        this.renderState.hasAssistantOutput = true
        continue
      }

      if (event.type === 'assistant.done') {
        if (event.text && !this.renderState.hasAssistantOutput) {
          stdout.write(`${event.text}\n`)
        } else {
          this.flushAssistantLine()
        }
        continue
      }

      this.flushAssistantLine()

      if (event.type === 'tool.call') {
        stdout.write(`[tool] ${summarizeWatchToolCall(event.name, event.arguments)}\n`)
        continue
      }

      if (event.type === 'approval.required') {
        stdout.write(`[approval] ${event.message}\n`)
        continue
      }

      if (event.type === 'input.required') {
        stdout.write(`[input] ${event.message}\n`)
        continue
      }

      this.showActivity(event.message)
    }
  }

  renderRawLine(stream: WatchEventLogEntry['stream'], line: string): void {
    this.flushAssistantLine()
    if (!line.trim()) {
      return
    }

    const target = stream === 'stderr' ? process.stderr : stdout
    target.write(`${line}\n`)
  }

  async promptInput(prompt: string): Promise<WatchPromptSubmission> {
    return {
      text: await this.prompt(prompt),
      mode: 'send',
    }
  }

  finish(status: 'completed' | 'failed', record: WatchSessionRecord, error?: string): void {
    this.updateRecord(record)
    this.flushAssistantLine()

    if (status === 'completed') {
      stdout.write(`\n[session] completed ${record.id}\n`)
    } else {
      process.stderr.write(`\n[session] failed ${record.id}${error ? `: ${error}` : ''}\n`)
    }
  }
}

class TuiWatchDisplay implements WatchDisplay {
  private record: WatchSessionRecord
  private readonly promptFallback: PromptText
  private readonly transcript: WatchUiEntry[] = []
  private readonly activityEntries: WatchUiEntry[] = []
  private contextLines: string[] = []
  private assistantLine = ''
  private queueState: WatchQueueState = { steeringCount: 0, followUpCount: 0 }
  private active = false
  private originalRawMode = false
  private renderTicker: NodeJS.Timeout | null = null
  private readonly composer = new CodexComposer()
  private promptResolver: ((value: WatchPromptSubmission) => void) | null = null
  private requestFormResolver: ((answers: WatchUserInputAnswers) => void) | null = null
  private overlay: WatchOverlayState | null = null
  private overlayResolver: ((value: string) => void) | null = null
  private overlayRejecter: ((error: Error) => void) | null = null
  private inputController: WatchInputController | null = null
  private hideToolOutput = false
  private debugMode = false
  private lastCtrlCTime = 0
  private state: WatchDisplayState = {
    phase: 'starting',
    detail: 'Booting watch session',
    since: Date.now(),
  }

  constructor(record: WatchSessionRecord, promptFallback: PromptText) {
    this.record = record
    this.promptFallback = promptFallback
  }

  start(): void {
    if (this.active) {
      return
    }

    this.active = true
    this.pushActivityEntry({ kind: 'note', text: 'LinX watch ready' })
    this.pushActivityEntry({ kind: 'note', text: 'Use /help for commands. Type /exit to leave this session.' })

    emitKeypressEvents(stdin)
    if ('setRawMode' in stdin && typeof stdin.setRawMode === 'function') {
      this.originalRawMode = Boolean(stdin.isRaw)
      stdin.setRawMode(true)
    }

    stdin.resume()
    stdin.on('keypress', this.handleKeypress)
    stdout.on('resize', this.handleResize)
    this.renderTicker = setInterval(() => {
      this.render()
    }, 125)
    stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l')
    this.render()
  }

  updateRecord(record: WatchSessionRecord): void {
    this.record = record
    this.render()
  }

  updateQueue(state: WatchQueueState): void {
    this.queueState = state
    this.render()
  }

  bindInputController(controller: WatchInputController | null): void {
    this.inputController = controller
  }

  setPhase(phase: WatchDisplayPhase, detail?: string): void {
    if (this.state.phase === phase && this.state.detail === detail) {
      this.render()
      return
    }

    this.state = {
      phase,
      detail,
      since: Date.now(),
    }
    this.render()
  }

  showActivity(text: string, tone: WatchUiActivityTone = 'note'): void {
    this.pushActivityEntry({
      kind: tone,
      text,
    })
    this.render()
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.pushActivityEntry({
      kind: 'note',
      text: `Debug protocol view ${enabled ? 'enabled' : 'disabled'}`,
    })
    this.render()
  }

  chooseOption(title: string, lines: string[], options: CodexOverlayOption[], signal?: AbortSignal): Promise<string> {
    if (!this.active) {
      return this.promptFallback('select> ', signal)
    }

    this.flushAssistant()
    this.contextLines = []
    this.overlay = {
      kind: 'selection',
      value: {
        title,
        body: lines,
        options,
        selectedIndex: 0,
      },
    }
    this.render()

    return new Promise((resolve, reject) => {
      this.overlayResolver = resolve
      this.overlayRejecter = reject

      if (signal) {
        const onAbort = () => {
          if (this.overlayResolver !== resolve) {
            return
          }

          this.overlayResolver = null
          this.overlayRejecter = null
          this.overlay = null
          this.render()
          reject(createAbortError())
        }

        if (signal.aborted) {
          onAbort()
          return
        }

        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  chooseQuestion(state: {
    header: string
    question: string
    options: CodexRequestInputOption[]
    questionIndex: number
    questionCount: number
    unansweredCount: number
  }): Promise<string> {
    if (!this.active) {
      return this.promptFallback('select> ')
    }

    this.flushAssistant()
    this.contextLines = []
    this.overlay = {
      kind: 'request-input',
      value: {
        ...state,
        selectedIndex: 0,
        answerValue: '',
        answerCursor: 0,
      },
    }
    this.render()

    return new Promise((resolve) => {
      this.overlayResolver = resolve
      this.overlayRejecter = null
    })
  }

  chooseQuestions(questions: WatchUserInputQuestion[]): Promise<WatchUserInputAnswers> {
    if (!this.active) {
      const plain = new PlainWatchDisplay(this.record, this.promptFallback)
      return plain.chooseQuestions(questions)
    }

    this.flushAssistant()
    this.contextLines = []
    this.overlay = {
      kind: 'request-form',
      value: new CodexRequestForm(questions),
    }
    this.render()

    return new Promise((resolve) => {
      this.requestFormResolver = resolve
    })
  }

  showUserTurn(text: string): void {
    this.flushAssistant()
    this.composer.recordSubmission(text)
    this.pushTranscriptEntry({ kind: 'user', text })
    this.render()
  }

  showHelp(): void {
    this.showActivity('Commands: /help, /exit')
  }

  showQuestion(lines: string[]): void {
    this.flushAssistant()
    this.contextLines = lines.filter((line) => line.trim().length > 0)
    this.render()
  }

  renderEvents(events: WatchNormalizedEvent[]): void {
    for (const event of events) {
      if (event.type === 'assistant.delta') {
        this.assistantLine += event.text
        continue
      }

      if (event.type === 'assistant.done') {
        if (event.text && !this.assistantLine) {
          this.pushTranscriptEntry({ kind: 'assistant', text: event.text })
        } else {
          this.flushAssistant()
        }
        continue
      }

      this.flushAssistant()

      if (event.type === 'tool.call') {
        this.pushActivityEntry({
          kind: 'tool',
          text: summarizeWatchToolCall(event.name, event.arguments),
        })
        if (this.debugMode && event.raw) {
          const debugPayload = summarizeWatchDebugPayload(event.raw)
          this.pushActivityEntry({
            kind: 'debug',
            text: debugPayload.text,
            ...(debugPayload.detail ? { detail: debugPayload.detail } : {}),
          })
        }
        continue
      }

      if (event.type === 'approval.required') {
        continue
      }

      if (event.type === 'input.required') {
        continue
      }

      this.pushActivityEntry({
        kind: 'note',
        text: event.message,
      })
      if (this.debugMode && event.raw) {
        const debugPayload = summarizeWatchDebugPayload(event.raw)
        this.pushActivityEntry({
          kind: 'debug',
          text: debugPayload.text,
          ...(debugPayload.detail ? { detail: debugPayload.detail } : {}),
        })
      }
    }

    this.render()
  }

  renderRawLine(stream: WatchEventLogEntry['stream'], line: string): void {
    this.flushAssistant()

    const trimmed = line.trim()
    if (trimmed) {
      if (stream === 'stdout' && !this.debugMode) {
        this.render()
        return
      }

      const debugPayload = stream === 'stdout' && this.debugMode
        ? summarizeWatchDebugPayload(trimmed)
        : null

      this.pushActivityEntry({
        kind: stream === 'stderr' ? 'error' : this.debugMode ? 'debug' : 'note',
        text: stream === 'stderr'
          ? trimmed
          : debugPayload?.text ?? trimmed,
        ...(debugPayload?.detail ? { detail: debugPayload.detail } : {}),
      })
    }

    this.render()
  }

  promptInput(prompt: string): Promise<WatchPromptSubmission> {
    if (!this.active) {
      return this.promptFallback(prompt).then((text) => ({ text, mode: 'send' }))
    }

    this.composer.beginPrompt(prompt)
    this.overlay = null
    this.render()

    return new Promise((resolve) => {
      this.promptResolver = resolve
    })
  }

  finish(status: 'completed' | 'failed', record: WatchSessionRecord, error?: string): void {
    this.updateRecord(record)
    this.flushAssistant()
    if (status === 'completed') {
      this.pushActivityEntry({ kind: 'success', text: `Session completed | ${record.id}` })
    } else {
      this.pushActivityEntry({ kind: 'error', text: `Session failed | ${record.id}${error ? `: ${error}` : ''}` })
    }
    this.render()
    this.teardown()

    if (status === 'completed') {
      stdout.write(`[session] completed ${record.id}\n`)
    } else {
      process.stderr.write(`[session] failed ${record.id}${error ? `: ${error}` : ''}\n`)
    }
  }

  private readonly handleResize = () => {
    this.render()
  }

  private handleCtrlC(): void {
    const now = Date.now()
    const hasDraft = this.composer.text().length > 0

    if (hasDraft) {
      this.composer.setText('')
      this.contextLines = []
      this.lastCtrlCTime = now
      this.render()
      return
    }

    if (now - this.lastCtrlCTime <= 800) {
      this.teardown()
      process.exit(1)
      return
    }

    this.lastCtrlCTime = now
    this.pushActivityEntry({ kind: 'note', text: 'Press Ctrl+C again to quit' })
    this.render()
  }

  private restoreQueuedSubmission(): void {
    const restored = this.inputController?.restoreQueuedSubmission() ?? null
    if (!restored) {
      this.pushActivityEntry({ kind: 'note', text: 'Queue is empty' })
      this.render()
      return
    }

    this.composer.setText(restored.text)
    this.contextLines = [
      restored.mode === 'follow-up'
        ? 'Restored queued follow-up message'
        : 'Restored queued steering message',
    ]
    this.pushActivityEntry({
      kind: 'note',
      text: restored.mode === 'follow-up'
        ? 'Restored queued follow-up message'
        : 'Restored queued steering message',
    })
    this.render()
  }

  private toggleToolOutput(): void {
    this.hideToolOutput = !this.hideToolOutput
    this.pushActivityEntry({
      kind: 'note',
      text: this.hideToolOutput ? 'Tool output collapsed' : 'Tool output expanded',
    })
    this.render()
  }

  private readonly handleKeypress = (value: string, key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string }) => {
    if (this.requestFormResolver && this.overlay?.kind === 'request-form') {
      if (key.ctrl && key.name === 'c') {
        this.teardown()
        process.exit(1)
      }

      const result = this.overlay.value.applyKey(value, key)
      if (result.kind === 'submitted') {
        const resolve = this.requestFormResolver
        this.requestFormResolver = null
        this.overlay = null
        this.render()
        resolve(result.answers)
        return
      }

      this.render()
      return
    }

    if (this.overlayResolver && this.overlay) {
      if (key.ctrl && key.name === 'c') {
        this.teardown()
        process.exit(1)
      }

      if (this.overlay.kind === 'request-input' && this.overlay.value.options.length === 0) {
        if (key.name === 'return' || key.name === 'enter') {
          const resolve = this.overlayResolver
          const answer = this.overlay.value.answerValue ?? ''
          this.overlayResolver = null
          this.overlayRejecter = null
          this.overlay = null
          this.render()
          resolve(answer)
          return
        }

        if (key.name === 'backspace') {
          withRequestInputComposer(this.overlay.value, (composer) => composer.backspace())
          this.render()
          return
        }

        if (key.name === 'delete') {
          withRequestInputComposer(this.overlay.value, (composer) => composer.deleteForward())
          this.render()
          return
        }

        if (key.name === 'left' || (key.ctrl && key.name === 'b')) {
          withRequestInputComposer(this.overlay.value, (composer) => composer.moveLeft())
          this.render()
          return
        }

        if (key.name === 'right' || (key.ctrl && key.name === 'f')) {
          withRequestInputComposer(this.overlay.value, (composer) => composer.moveRight())
          this.render()
          return
        }

        if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
          withRequestInputComposer(this.overlay.value, (composer) => composer.moveToStart())
          this.render()
          return
        }

        if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
          withRequestInputComposer(this.overlay.value, (composer) => composer.moveToEnd())
          this.render()
          return
        }

        if (key.ctrl && key.name === 'u') {
          withRequestInputComposer(this.overlay.value, (composer) => composer.deleteToStart())
          this.render()
          return
        }

        if (key.ctrl && key.name === 'k') {
          withRequestInputComposer(this.overlay.value, (composer) => composer.deleteToEnd())
          this.render()
          return
        }

        if (key.name === 'escape' || key.name === 'tab' || key.name === 'up' || key.name === 'down') {
          return
        }

        if (typeof value === 'string' && value.length > 0 && !key.ctrl && !key.meta) {
          withRequestInputComposer(this.overlay.value, (composer) => composer.insert(value))
          this.render()
        }
        return
      }

      const currentOverlay = this.overlay
      if (currentOverlay.kind === 'request-form') {
        return
      }

      const shortcut = typeof value === 'string' ? value.toLowerCase() : ''
      const overlayOptions = currentOverlay.value.options
      const matchedIndex = shortcut
        ? overlayOptions.findIndex((option) => option.shortcuts?.includes(shortcut))
        : -1

      if (key.name === 'escape' && currentOverlay.kind === 'selection') {
        const cancelIndex = overlayOptions.findIndex((option) => (
          option.value === 'c'
          || option.shortcuts?.includes('c')
          || /cancel/i.test(option.label)
        ))
        if (cancelIndex !== -1) {
          const resolve = this.overlayResolver
          const matched = overlayOptions[cancelIndex]
          this.overlayResolver = null
          this.overlayRejecter = null
          this.overlay = null
          this.render()
          resolve(matched?.value ?? '')
          return
        }
      }

      if (matchedIndex !== -1) {
        const resolve = this.overlayResolver
        const matched = overlayOptions[matchedIndex]
        this.overlayResolver = null
        this.overlayRejecter = null
        this.overlay = null
        this.render()
        resolve(matched.value)
        return
      }

      if (key.name === 'up' || key.name === 'k') {
        currentOverlay.value.selectedIndex = Math.max(0, currentOverlay.value.selectedIndex - 1)
        this.render()
        return
      }

      if (key.name === 'down' || key.name === 'j' || key.name === 'tab') {
        currentOverlay.value.selectedIndex = Math.min(overlayOptions.length - 1, currentOverlay.value.selectedIndex + 1)
        this.render()
        return
      }

      if (key.name === 'return' || key.name === 'enter') {
        const resolve = this.overlayResolver
        const selected = overlayOptions[currentOverlay.value.selectedIndex]
        this.overlayResolver = null
        this.overlayRejecter = null
        this.overlay = null
        this.render()
        resolve(selected?.value ?? '')
        return
      }

      return
    }

    if (!this.promptResolver) {
      if (key.ctrl && key.name === 'c') {
        this.handleCtrlC()
      }
      return
    }

    if (key.ctrl && key.name === 'c') {
      this.handleCtrlC()
      return
    }

    if (key.ctrl && key.name === 'o') {
      this.toggleToolOutput()
      return
    }

    if (key.meta && key.name === 'up') {
      this.restoreQueuedSubmission()
      return
    }

    if ((key.name === 'return' || key.name === 'enter') && key.shift) {
      this.composer.insert('\n')
      this.render()
      return
    }

    if (key.name === 'return' || key.name === 'enter') {
      const resolve = this.promptResolver
      const text = this.composer.text()
      const mode = key.meta ? 'follow-up' : 'send'
      this.promptResolver = null
      this.composer.setText('')
      this.contextLines = []
      this.render()
      resolve({ text, mode })
      return
    }

    if (key.name === 'backspace') {
      this.composer.backspace()
      this.render()
      return
    }

    if (key.name === 'delete') {
      this.composer.deleteForward()
      this.render()
      return
    }

    if (key.name === 'left' || (key.ctrl && key.name === 'b')) {
      this.composer.moveLeft()
      this.render()
      return
    }

    if (key.name === 'right' || (key.ctrl && key.name === 'f')) {
      this.composer.moveRight()
      this.render()
      return
    }

    if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
      this.composer.moveToStart()
      this.render()
      return
    }

    if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
      this.composer.moveToEnd()
      this.render()
      return
    }

    if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
      if (this.composer.navigateHistory('up')) {
        this.render()
      }
      return
    }

    if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
      if (this.composer.navigateHistory('down')) {
        this.render()
      }
      return
    }

    if (key.ctrl && key.name === 'u') {
      this.composer.deleteToStart()
      this.render()
      return
    }

    if (key.ctrl && key.name === 'k') {
      this.composer.deleteToEnd()
      this.render()
      return
    }

    if (key.name === 'escape' || key.name === 'tab') {
      return
    }

    if (typeof value === 'string' && value.length > 0 && !key.ctrl && !key.meta) {
      this.composer.insert(value)
      this.render()
    }
  }

  private flushAssistant(): void {
    if (!this.assistantLine.trim()) {
      this.assistantLine = ''
      return
    }

    this.pushTranscriptEntry({ kind: 'assistant', text: this.assistantLine })
    this.assistantLine = ''
  }

  private pushTranscriptEntry(entry: WatchUiEntry): void {
    if (!entry.text.trim()) {
      return
    }

    const nextEntry = {
      ...entry,
      text: entry.text.trimEnd(),
    }
    this.transcript.push(nextEntry)
    if (this.transcript.length > 400) {
      this.transcript.splice(0, this.transcript.length - 400)
    }
  }

  private pushActivityEntry(entry: WatchUiEntry): void {
    if (!entry.text.trim()) {
      return
    }

    const nextEntry = {
      ...entry,
      text: entry.text.trimEnd(),
    }
    this.activityEntries.push(nextEntry)
    if (this.activityEntries.length > 120) {
      this.activityEntries.splice(0, this.activityEntries.length - 120)
    }
  }

  private buildMainLines(width: number): string[] {
    const lines = this.transcript.map((entry) => {
      if (entry.kind === 'user') {
        return `you> ${entry.text}`
      }

      return `assistant> ${entry.text}`
    })
    if (this.assistantLine) {
      lines.push(`linx> ${this.assistantLine}`)
    }

    return lines.flatMap((line) => formatWatchTranscriptLine(line, width))
  }

  private buildActivityLines(width: number, maxLines: number): string[] {
    if (maxLines <= 0) {
      return []
    }

    const sourceEntries = this.hideToolOutput
      ? this.activityEntries.filter((entry) => entry.kind !== 'tool')
      : this.activityEntries

    return sourceEntries
      .flatMap((entry) => {
        if (entry.kind === 'tool') {
          return [applyAnsi(clipLine(`[tool] ${entry.text}`, width), ANSI.green)]
        }

        if (entry.kind === 'success') {
          return [applyAnsi(clipLine(`[ok] ${entry.text}`, width), ANSI.green)]
        }

        if (entry.kind === 'error') {
          return wrapText(`[error] ${entry.text}`, width).map((line) => applyAnsi(clipLine(line, width), ANSI.red))
        }

        if (entry.kind === 'debug') {
          const debugLines = wrapText(`[debug] ${entry.text}`, width)
          if (entry.detail) {
            debugLines.push(...wrapText(`        ${entry.detail}`, width))
          }
          return debugLines.map((line) => applyAnsi(clipLine(line, width), ANSI.dim))
        }

        return wrapText(`[note] ${entry.text}`, width).map((line) => applyAnsi(clipLine(line, width), ANSI.dim))
      })
      .slice(-maxLines)
  }

  private buildActivityPanel(width: number, maxHeight: number): string[] {
    return formatWatchActivityPanelLines({
      width,
      maxHeight,
      entries: this.activityEntries,
      hideToolOutput: this.hideToolOutput,
      debugMode: this.debugMode,
    })
  }

  private buildContextLines(width: number, maxLines: number): string[] {
    return this.contextLines
      .flatMap((line) => wrapText(line, width))
      .slice(0, Math.max(0, maxLines))
  }

  private buildHeaderLines(width: number): string[] {
    return [
      styleStatusLine(formatWatchHeaderLine(this.record, width)),
      applyAnsi(clipLine(' Alt+Up restore | Ctrl+O tools | Ctrl+C clear / double Ctrl+C quit ', width), ANSI.dim),
    ]
  }

  private buildQueueLines(width: number): string[] {
    if (this.queueState.steeringCount === 0 && this.queueState.followUpCount === 0) {
      return []
    }

    return [applyAnsi(formatWatchQueueLine(this.queueState, width), ANSI.dim)]
  }

  private buildFooterLine(width: number): string {
    return applyAnsi(formatWatchFooterLine({
      width,
      phase: this.state.phase,
      record: this.record,
      hasDraft: this.composer.hasDraft(),
    }), ANSI.dim)
  }

  private buildPromptLines(width: number): { lines: string[]; cursorRow: number; cursorCol: number } {
    const innerWidth = Math.max(16, width - 4)
    const rendered = this.composer.render(innerWidth)
    const title = this.state.phase === 'running'
      ? `editor | running ${this.record.backend}`
      : `editor | ${this.record.backend}`
    const framedLines = renderBorderBox(
      rendered.lines.map((line) => styleComposerLine(line, innerWidth)),
      width,
      title,
      editorBorderColor(this.state.phase),
    )

    return {
      lines: framedLines,
      cursorRow: rendered.cursorRow + 1,
      cursorCol: rendered.cursorCol + 2,
    }
  }

  private buildOverlayLines(width: number, maxHeight: number): OverlayRenderResult {
    if (!this.overlay) {
      return { lines: [] }
    }

    if (this.overlay.kind === 'selection') {
      const lines = renderCodexOverlay(this.overlay.value, Math.max(24, Math.min(width - 6, 88)), maxHeight)
      return {
        lines: lines.map((line) => styleOverlayLine(centerLine(line, width))),
      }
    }

    if (this.overlay.kind === 'request-form') {
      if (this.overlay.value.confirmUnansweredActive()) {
        const confirmState = this.overlay.value.confirmationOverlayState()
        if (confirmState) {
          const lines = renderCodexOverlay(confirmState, Math.max(24, Math.min(width - 6, 88)), maxHeight)
          return {
            lines: lines.map((line) => styleOverlayLine(centerLine(line, width))),
          }
        }
      }

      const rendered = renderCodexRequestInputDetailed(
        this.overlay.value.currentState(),
        Math.max(28, Math.min(width - 6, 88)),
        maxHeight,
      )
      const rawCenteredLines = rendered.lines.map((line) => centerLine(line, width))
      const cursorLine = rendered.cursorLineIndex
      const cursorRawLine = cursorLine === undefined ? undefined : rawCenteredLines[cursorLine]
      const leftPadding = cursorRawLine?.match(/^\s*/u)?.[0]?.length ?? 0

      return {
        lines: rawCenteredLines.map((line) => styleOverlayLine(line)),
        cursorRow: cursorLine,
        cursorCol: cursorLine === undefined || rendered.cursorCol === undefined
          ? undefined
          : leftPadding + rendered.cursorCol,
      }
    }

    const rendered = renderCodexRequestInputDetailed(
      this.overlay.value,
      Math.max(28, Math.min(width - 6, 88)),
      maxHeight,
    )
    const rawCenteredLines = rendered.lines.map((line) => centerLine(line, width))
    const cursorLine = rendered.cursorLineIndex
    const cursorRawLine = cursorLine === undefined ? undefined : rawCenteredLines[cursorLine]
    const leftPadding = cursorRawLine?.match(/^\s*/u)?.[0]?.length ?? 0

    return {
      lines: rawCenteredLines.map((line) => styleOverlayLine(line)),
      cursorRow: cursorLine,
      cursorCol: cursorLine === undefined || rendered.cursorCol === undefined
        ? undefined
        : leftPadding + rendered.cursorCol,
    }
  }

  private render(): void {
    if (!this.active) {
      return
    }

    const totalWidth = Math.max(stdout.columns ?? 100, 60)
    const totalHeight = Math.max(stdout.rows ?? 24, 4)
    const headerLines = this.buildHeaderLines(totalWidth)
    const showStatusLine = this.state.phase !== 'ready'
    const maxContextLines = Math.min(5, Math.max(0, totalHeight - (showStatusLine ? 5 : 4)))
    const contextLines = this.buildContextLines(totalWidth, maxContextLines)
    const queueLines = this.buildQueueLines(totalWidth)
    const showPromptLine = Boolean(this.promptResolver)
    const promptRender = showPromptLine ? this.buildPromptLines(totalWidth) : null
    const footerSectionCounts = selectWatchFooterSectionCounts({
      totalHeight,
      headerCount: headerLines.length,
      contextCount: contextLines.length,
      showStatus: showStatusLine,
      queueCount: queueLines.length,
      promptCount: promptRender?.lines.length ?? 0,
    })
    const footerLines = [
      ...contextLines
        .slice(-footerSectionCounts.contextCount)
        .map((line) => styleContextLine(line, totalWidth)),
      ...(footerSectionCounts.statusCount > 0 ? [styleStatusLine(formatWatchStatusLine(this.state, totalWidth))] : []),
      ...queueLines.slice(0, footerSectionCounts.queueCount),
      ...(promptRender ? promptRender.lines : []),
      this.buildFooterLine(totalWidth),
    ]
    const overlayRender = this.buildOverlayLines(totalWidth, Math.max(0, totalHeight - headerLines.length - footerLines.length))
    const overlayLines = overlayRender.lines
    const contentHeight = Math.max(0, totalHeight - headerLines.length - footerLines.length - overlayLines.length)
    const activityBudget = Math.min(6, Math.max(0, Math.floor(contentHeight / 3)))
    const mainLines = this.buildMainLines(totalWidth)
    const activityPanelLines = this.buildActivityPanel(totalWidth, activityBudget)
    const mainBudget = Math.max(0, contentHeight - activityPanelLines.length)
    const visibleMain = mainLines.slice(-mainBudget)
    const rows: string[] = []

    rows.push(...headerLines)

    for (const line of visibleMain) {
      rows.push(line)
    }

    for (const line of activityPanelLines) {
      rows.push(line)
    }

    while (rows.length < headerLines.length + contentHeight) {
      rows.push(' '.repeat(totalWidth))
    }

    rows.push(...overlayLines)
    rows.push(...footerLines)

    const visibleRows = rows.slice(0, totalHeight)

    stdout.write('\x1b[H')
    stdout.write(visibleRows.join('\n'))
    stdout.write('\x1b[J')

    if (overlayRender.cursorRow !== undefined && overlayRender.cursorCol !== undefined) {
      const cursorRow = Math.min(totalHeight, headerLines.length + contentHeight + overlayRender.cursorRow + 1)
      const cursorCol = Math.min(totalWidth, overlayRender.cursorCol)
      stdout.write(`\x1b[?25h\x1b[${cursorRow};${cursorCol}H`)
    } else if (this.promptResolver) {
      const cursorRow = Math.min(totalHeight, headerLines.length
        + contentHeight
        + overlayLines.length
        + footerSectionCounts.contextCount
        + footerSectionCounts.statusCount
        + footerSectionCounts.queueCount
        + (promptRender?.cursorRow ?? 0)
        + 1)
      const cursorCol = Math.min(totalWidth, promptRender?.cursorCol ?? 1)
      stdout.write(`\x1b[?25h\x1b[${cursorRow};${cursorCol}H`)
    } else {
      stdout.write('\x1b[?25l')
    }
  }

  private teardown(): void {
    if (!this.active) {
      return
    }

    this.active = false
    stdin.off('keypress', this.handleKeypress)
    stdout.off('resize', this.handleResize)
    if (this.renderTicker) {
      clearInterval(this.renderTicker)
      this.renderTicker = null
    }

    if ('setRawMode' in stdin && typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(this.originalRawMode)
    }

    stdout.write('\x1b[?25h\x1b[?1049l')
  }
}

export function createWatchDisplay(record: WatchSessionRecord, prompt: PromptText): WatchDisplay {
  if (supportsWatchTui()) {
    return new TuiWatchDisplay(record, prompt)
  }

  return new PlainWatchDisplay(record, prompt)
}
