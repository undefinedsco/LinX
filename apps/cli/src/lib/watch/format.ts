import type { WatchEventLogEntry, WatchNormalizedEvent, WatchSessionRecord } from './types.js'

interface TranscriptState {
  assistantLine: string
}

function createTranscriptState(): TranscriptState {
  return { assistantLine: '' }
}

function pushLine(lines: string[], text?: string): void {
  if (!text) {
    return
  }

  const normalized = text.replace(/\r/g, '').trimEnd()
  if (!normalized) {
    return
  }

  lines.push(normalized)
}

function flushAssistantLine(lines: string[], state: TranscriptState): void {
  if (!state.assistantLine.trim()) {
    state.assistantLine = ''
    return
  }

  pushLine(lines, `assistant> ${state.assistantLine}`)
  state.assistantLine = ''
}

function appendNormalizedEvent(
  lines: string[],
  state: TranscriptState,
  event: WatchNormalizedEvent,
): void {
  if (event.type === 'assistant.delta') {
    state.assistantLine += event.text
    return
  }

  if (event.type === 'assistant.done') {
    if (event.text && !state.assistantLine) {
      pushLine(lines, `assistant> ${event.text}`)
      return
    }

    flushAssistantLine(lines, state)
    return
  }

  flushAssistantLine(lines, state)

  if (event.type === 'tool.call') {
    pushLine(
      lines,
      `[tool] ${event.name}${event.arguments ? ` ${JSON.stringify(event.arguments)}` : ''}`,
    )
    return
  }

  if (event.type === 'approval.required') {
    pushLine(lines, `[approval] ${event.message}`)
    return
  }

  if (event.type === 'input.required') {
    pushLine(lines, `[input] ${event.message}`)
    return
  }

  pushLine(lines, `[note] ${event.message}`)
}

function formatRawArchiveLine(entry: WatchEventLogEntry): string | null {
  const trimmed = entry.line.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const type = typeof parsed.type === 'string' ? parsed.type : ''

    if (type === 'user.turn' && typeof parsed.text === 'string') {
      return `you> ${parsed.text}`
    }

    if (type === 'turn.start') {
      const command = typeof parsed.command === 'string' ? parsed.command : 'unknown'
      const args = Array.isArray(parsed.args) ? parsed.args.filter((value): value is string => typeof value === 'string') : []
      return `[turn] ${[command, ...args].join(' ').trim()}`
    }

    if (type === 'credentials.resolve') {
      const requested = typeof parsed.requestedCredentialSource === 'string' ? parsed.requestedCredentialSource : 'auto'
      const resolved = typeof parsed.resolvedCredentialSource === 'string' ? parsed.resolvedCredentialSource : requested
      return `[credentials] ${requested} -> ${resolved}`
    }

    if (type === 'process.error' && typeof parsed.message === 'string') {
      return `[error] ${parsed.message}`
    }
  } catch {
    // Keep original line when it is not structured JSON.
  }

  if (entry.stream === 'stderr') {
    return `stderr> ${trimmed}`
  }

  return trimmed
}

function shorten(text: string, width: number): string {
  if (text.length <= width) {
    return text
  }

  if (width <= 3) {
    return text.slice(0, width)
  }

  return `${text.slice(0, Math.max(0, width - 3))}...`
}

function formatClock(value?: string): string {
  if (!value) {
    return '--:--:--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toISOString().slice(11, 19)
}

export function formatWatchSessionSummary(record: WatchSessionRecord): string {
  const prompt = record.prompt?.replace(/\s+/g, ' ').trim()
  const source = record.resolvedCredentialSource ?? record.credentialSource

  return [
    record.id,
    record.backend,
    record.status,
    `runtime=${record.runtime}`,
    `transport=${record.transport ?? 'native'}`,
    `mode=${record.mode}`,
    `source=${source}`,
    prompt ? `prompt=${shorten(prompt, 48)}` : null,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ')
}

export function renderWatchTranscript(entries: WatchEventLogEntry[]): string[] {
  const lines: string[] = []
  const state = createTranscriptState()

  for (const entry of entries) {
    if (entry.events.length > 0) {
      for (const event of entry.events) {
        appendNormalizedEvent(lines, state, event)
      }
      continue
    }

    flushAssistantLine(lines, state)
    pushLine(lines, formatRawArchiveLine(entry) ?? undefined)
  }

  flushAssistantLine(lines, state)
  return lines
}

export function formatArchivedWatchSession(record: WatchSessionRecord, entries: WatchEventLogEntry[]): string {
  const source = record.resolvedCredentialSource ?? record.credentialSource
  const header = [
    'LinX watch history',
    `session: ${record.id}`,
    `backend: ${record.backend}`,
    `status: ${record.status}`,
    `runtime: ${record.runtime}`,
    `transport: ${record.transport ?? 'native'}`,
    `mode: ${record.mode}`,
    `source: ${source}`,
    `started: ${record.startedAt}`,
    record.endedAt ? `ended: ${record.endedAt}` : null,
    record.model ? `model: ${record.model}` : null,
    `cwd: ${record.cwd}`,
    `cmd: ${record.command}${record.args.length > 0 ? ` ${record.args.join(' ')}` : ''}`,
  ].filter((line): line is string => Boolean(line))

  const transcript = renderWatchTranscript(entries)
  if (transcript.length === 0) {
    transcript.push('[note] no archived output')
  }

  return `${header.join('\n')}\n\n${transcript.join('\n')}\n`
}

export function formatWatchSidebarSession(record: WatchSessionRecord): string {
  const shortId = record.id.startsWith('watch_') ? record.id.slice(6) : record.id
  return shorten(
    `${formatClock(record.startedAt)} ${record.backend} ${record.status} ${shortId}`,
    30,
  )
}
