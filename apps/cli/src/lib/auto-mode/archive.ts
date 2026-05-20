import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createAutoModeSessionId,
  AUTO_MODE_EVENTS_FILE_NAME,
  AUTO_MODE_HOME_DIRNAME,
  AUTO_MODE_SESSIONS_DIRNAME,
  AUTO_MODE_SESSION_FILE_NAME,
} from '@linx/agent-runtime/auto-mode'
import type { AutoRunOptions, AutoModeEventLogEntry, AutoModeSessionRecord, AutoModeSessionStatus, AutoModeSpawnPlan } from './types.js'

function getAutoModeHome(): string {
  const autoModeOverride = process.env.LINX_AUTO_MODE_HOME?.trim()
  if (autoModeOverride) {
    return autoModeOverride
  }

  return join(process.env.HOME || '.', '.linx', AUTO_MODE_HOME_DIRNAME)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function sessionsDir(): string {
  const dir = join(getAutoModeHome(), AUTO_MODE_SESSIONS_DIRNAME)
  ensureDir(dir)
  return dir
}

function readableSessionsDirs(): string[] {
  return [sessionsDir()]
}

function sessionPath(id: string): string {
  return join(sessionsDir(), id)
}

function sessionJsonPath(dir: string, id: string): string {
  return join(dir, id, AUTO_MODE_SESSION_FILE_NAME)
}

function autoModeSessionIdAliases(id: string): string[] {
  const aliases = new Set([id])
  const suffix = id.startsWith('auto_') ? id.slice('auto_'.length) : null

  if (suffix) {
    aliases.add(`auto_${suffix}`)
  }

  return [...aliases]
}

function readSessionJson(id: string): AutoModeSessionRecord | null {
  const candidateIds = autoModeSessionIdAliases(id)
  for (const candidateId of candidateIds) {
    for (const dir of readableSessionsDirs()) {
      try {
        const raw = readFileSync(sessionJsonPath(dir, candidateId), 'utf-8')
        return JSON.parse(raw) as AutoModeSessionRecord
      } catch {
        // Keep scanning legacy archive roots.
      }
    }
  }

  return null
}

function normalizeSessionLookupId(input: string): string {
  return input.trim()
}

function matchesSessionLookup(record: AutoModeSessionRecord, input: string): boolean {
  const normalized = normalizeSessionLookupId(input)
  if (!normalized) {
    return false
  }

  const ids = [
    record.id,
    record.backendSessionId,
    ...autoModeSessionIdAliases(record.id),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return ids.some((id) => id === normalized)
}

function matchesSessionLookupPrefix(record: AutoModeSessionRecord, input: string): boolean {
  const normalized = normalizeSessionLookupId(input)
  if (!normalized) {
    return false
  }

  const ids = [
    record.id,
    record.backendSessionId,
    ...autoModeSessionIdAliases(record.id),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return ids.some((id) => id.startsWith(normalized))
}

function readSessionJsonFromDirectory(dir: string, id: string): AutoModeSessionRecord | null {
  try {
    const raw = readFileSync(sessionJsonPath(dir, id), 'utf-8')
    return JSON.parse(raw) as AutoModeSessionRecord
  } catch {
    return null
  }
}

export function createAutoModeSession(
  options: AutoRunOptions,
  plan: AutoModeSpawnPlan,
): AutoModeSessionRecord {
  const id = createAutoModeSessionId()
  const archiveDir = sessionPath(id)
  const eventsFile = join(archiveDir, AUTO_MODE_EVENTS_FILE_NAME)

  ensureDir(archiveDir)

  const record: AutoModeSessionRecord = {
    id,
    backend: options.backend,
    runtime: options.runtime ?? 'local',
    transport: options.transport ?? 'acp',
    mode: options.mode,
    goalMode: options.goalMode || undefined,
    cwd: options.cwd,
    model: options.model,
    prompt: options.prompt,
    passthroughArgs: [...options.passthroughArgs],
    credentialSource: 'cloud',
    resolvedCredentialSource: options.resolvedCredentialSource,
    approvalSource: 'hybrid',
    command: plan.command,
    args: [...plan.args],
    status: 'running',
    startedAt: new Date().toISOString(),
    archiveDir,
    eventsFile,
  }

  writeAutoModeSession(record)
  return record
}

export function writeAutoModeSession(record: AutoModeSessionRecord): void {
  ensureDir(record.archiveDir)
  writeFileSync(join(record.archiveDir, AUTO_MODE_SESSION_FILE_NAME), `${JSON.stringify(record, null, 2)}\n`)
}

export function adoptAutoModeSessionId(record: AutoModeSessionRecord, sessionId: string): AutoModeSessionRecord {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId || record.id === normalizedSessionId) {
    return record
  }

  const previousId = record.id
  const previousArchiveDir = record.archiveDir
  const nextArchiveDir = sessionPath(normalizedSessionId)
  const nextEventsFile = join(nextArchiveDir, AUTO_MODE_EVENTS_FILE_NAME)
  const existing = readSessionJson(normalizedSessionId)
  if (existing && existing.archiveDir !== previousArchiveDir) {
    const now = new Date().toISOString()
    const merged: AutoModeSessionRecord = {
      ...existing,
      ...record,
      id: normalizedSessionId,
      backendSessionId: normalizedSessionId,
      archiveDir: existing.archiveDir,
      eventsFile: existing.eventsFile,
      passthroughArgs: [...record.passthroughArgs],
      args: [...record.args],
      startedAt: existing.startedAt < record.startedAt ? existing.startedAt : record.startedAt,
      endedAt: undefined,
      status: record.status,
    }
    appendFileSync(existing.eventsFile, readFileSync(record.eventsFile, 'utf-8'))
    writeAutoModeSession(merged)
    rmSync(previousArchiveDir, { recursive: true, force: true })
    Object.assign(record, merged)
    appendAutoModeEvent(record, {
      timestamp: now,
      stream: 'system',
      line: JSON.stringify({ type: 'session.note', message: `LinX run ${previousId} attached to session ${normalizedSessionId}` }),
      events: [{ type: 'session.note', message: `LinX run ${previousId} attached to session ${normalizedSessionId}` }],
    })
    return record
  }

  ensureDir(sessionsDir())
  if (!existsSync(nextArchiveDir)) {
    renameSync(previousArchiveDir, nextArchiveDir)
  }

  Object.assign(record, {
    id: normalizedSessionId,
    backendSessionId: normalizedSessionId,
    archiveDir: nextArchiveDir,
    eventsFile: nextEventsFile,
  })
  writeAutoModeSession(record)
  return record
}

export function appendAutoModeEvent(record: AutoModeSessionRecord, entry: AutoModeEventLogEntry): void {
  appendFileSync(record.eventsFile, `${JSON.stringify(entry)}\n`)
}

export function finishAutoModeSession(
  record: AutoModeSessionRecord,
  updates: {
    status: AutoModeSessionStatus
    exitCode?: number | null
    signal?: string | null
    error?: string
  },
): AutoModeSessionRecord {
  const next: AutoModeSessionRecord = {
    ...record,
    status: updates.status,
    exitCode: updates.exitCode ?? record.exitCode ?? null,
    signal: updates.signal ?? record.signal ?? null,
    error: updates.error,
    endedAt: new Date().toISOString(),
  }

  writeAutoModeSession(next)
  return next
}

export function listAutoModeSessions(): AutoModeSessionRecord[] {
  const seen = new Set<string>()
  return readableSessionsDirs()
    .flatMap((dir) => readdirSync(dir)
      .map((name) => readSessionJsonFromDirectory(dir, name)))
    .filter((item): item is AutoModeSessionRecord => item !== null)
    .filter((item) => {
      if (seen.has(item.id)) {
        return false
      }

      seen.add(item.id)
      return true
    })
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

export function loadAutoModeSession(id: string): AutoModeSessionRecord | null {
  const direct = readSessionJson(id)
  if (direct) {
    return direct
  }

  const exact = listAutoModeSessions().filter((record) => matchesSessionLookup(record, id))
  if (exact.length === 1) {
    return exact[0]
  }

  const prefix = listAutoModeSessions().filter((record) => matchesSessionLookupPrefix(record, id))
  if (prefix.length === 1) {
    return prefix[0]
  }

  return null
}

export function loadAutoModeEvents(id: string): AutoModeEventLogEntry[] {
  const record = loadAutoModeSession(id)
  if (!record) {
    return []
  }

  try {
    return readFileSync(record.eventsFile, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AutoModeEventLogEntry)
  } catch {
    return []
  }
}

export function resolveAutoModeSession(id: string): AutoModeSessionRecord | null {
  return loadAutoModeSession(id)
}
