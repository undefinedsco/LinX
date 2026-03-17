import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createWatchSessionId,
  WATCH_EVENTS_FILE_NAME,
  WATCH_HOME_DIRNAME,
  WATCH_SESSIONS_DIRNAME,
  WATCH_SESSION_FILE_NAME,
} from '@linx/models/watch'
import type { WatchEventLogEntry, WatchRunOptions, WatchSessionRecord, WatchSessionStatus, WatchSpawnPlan } from './types.js'

function getWatchHome(): string {
  const watchOverride = process.env.LINX_WATCH_HOME?.trim()
  if (watchOverride) {
    return watchOverride
  }

  return join(homedir(), '.linx', WATCH_HOME_DIRNAME)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function sessionsDir(): string {
  const dir = join(getWatchHome(), WATCH_SESSIONS_DIRNAME)
  ensureDir(dir)
  return dir
}

function sessionPath(id: string): string {
  return join(sessionsDir(), id)
}

function sessionJsonPath(id: string): string {
  return join(sessionPath(id), WATCH_SESSION_FILE_NAME)
}

function readSessionJson(id: string): WatchSessionRecord | null {
  try {
    const raw = readFileSync(sessionJsonPath(id), 'utf-8')
    return JSON.parse(raw) as WatchSessionRecord
  } catch {
    return null
  }
}

export function createWatchSession(
  options: WatchRunOptions,
  plan: WatchSpawnPlan,
): WatchSessionRecord {
  const id = createWatchSessionId()
  const archiveDir = sessionPath(id)
  const eventsFile = join(archiveDir, WATCH_EVENTS_FILE_NAME)

  ensureDir(archiveDir)

  const record: WatchSessionRecord = {
    id,
    backend: options.backend,
    runtime: options.runtime ?? 'local',
    mode: options.mode,
    cwd: options.cwd,
    model: options.model,
    prompt: options.prompt,
    passthroughArgs: [...options.passthroughArgs],
    credentialSource: options.credentialSource ?? 'auto',
    resolvedCredentialSource: options.resolvedCredentialSource,
    command: plan.command,
    args: [...plan.args],
    status: 'running',
    startedAt: new Date().toISOString(),
    archiveDir,
    eventsFile,
  }

  writeWatchSession(record)
  return record
}

export function writeWatchSession(record: WatchSessionRecord): void {
  ensureDir(record.archiveDir)
  writeFileSync(join(record.archiveDir, WATCH_SESSION_FILE_NAME), `${JSON.stringify(record, null, 2)}\n`)
}

export function appendWatchEvent(record: WatchSessionRecord, entry: WatchEventLogEntry): void {
  appendFileSync(record.eventsFile, `${JSON.stringify(entry)}\n`)
}

export function finishWatchSession(
  record: WatchSessionRecord,
  updates: {
    status: WatchSessionStatus
    exitCode?: number | null
    signal?: string | null
    error?: string
  },
): WatchSessionRecord {
  const next: WatchSessionRecord = {
    ...record,
    status: updates.status,
    exitCode: updates.exitCode ?? record.exitCode ?? null,
    signal: updates.signal ?? record.signal ?? null,
    error: updates.error,
    endedAt: new Date().toISOString(),
  }

  writeWatchSession(next)
  return next
}

export function listWatchSessions(): WatchSessionRecord[] {
  const dir = sessionsDir()
  return readdirSync(dir)
    .map((name) => readSessionJson(name))
    .filter((item): item is WatchSessionRecord => item !== null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

export function loadWatchSession(id: string): WatchSessionRecord | null {
  return readSessionJson(id)
}
