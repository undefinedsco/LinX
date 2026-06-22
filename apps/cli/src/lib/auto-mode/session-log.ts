import { appendAutoModeEvent } from './archive.js'
import type { AutoModeDisplay } from './display.js'
import type {
  AutoModeEventLogEntry,
  AutoModeNormalizedEvent,
  AutoModeSessionRecord,
} from './types.js'

export function appendAutoModeSessionEvent(
  record: AutoModeSessionRecord,
  stream: AutoModeEventLogEntry['stream'],
  line: string,
  events: AutoModeNormalizedEvent[],
): void {
  const entry: AutoModeEventLogEntry = {
    timestamp: new Date().toISOString(),
    stream,
    line,
    events,
  }
  appendAutoModeEvent(record, entry)
}

export function appendSessionNote(record: AutoModeSessionRecord, message: string, raw?: unknown): void {
  appendAutoModeSessionEvent(record, 'system', JSON.stringify({
    type: 'session.note',
    message,
  }), [{
    type: 'session.note',
    message,
    raw,
  }])
}

export function appendAndDisplaySessionNote(
  record: AutoModeSessionRecord,
  display: AutoModeDisplay,
  message: string,
  tone: 'note' | 'success' | 'error' = 'note',
  raw?: unknown,
): void {
  appendSessionNote(record, message, raw)
  display.showActivity(message, tone)
}
