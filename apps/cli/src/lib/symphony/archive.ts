import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createRunPlan,
  formatSymphonyDeliverySummary,
  formatSymphonyIssueSummary,
  formatSymphonySessionSummary,
  getSymphonyArchiveKey,
  getSymphonyArchiveRelativePaths,
  SYMPHONY_HOME_DIRNAME,
  type CreateSymphonyRunPlanInput,
  type SymphonyDeliveryRecord,
  type SymphonyDeliveryStatus,
  type SymphonyIssueRecord,
  type SymphonyIssueStatus,
  type SymphonyRunPlan,
  type SymphonySessionRecord,
  type SymphonySessionStatus,
} from '@linx/agent-runtime/symphony'
import { LINX_HOME_DIRNAME } from '@undefineds.co/models/client'

type SymphonyKind = 'issue' | 'delivery' | 'session'

interface SymphonyRecordMap {
  issue: SymphonyIssueRecord
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
}

export function getSymphonyHome(): string {
  return join(homedir(), LINX_HOME_DIRNAME, SYMPHONY_HOME_DIRNAME)
}

export function createArchivedSymphonyRunPlan(input: CreateSymphonyRunPlanInput): SymphonyRunPlan {
  const plan = createRunPlan(input)
  writeSymphonyIssue(plan.issue)
  writeSymphonyDelivery(plan.delivery)
  writeSymphonySession(plan.session)
  return plan
}

export function writeSymphonyIssue(record: SymphonyIssueRecord): void {
  writeSymphonyRecord('issue', record.uri, record)
}

export function writeSymphonyDelivery(record: SymphonyDeliveryRecord): void {
  writeSymphonyRecord('delivery', record.uri, record)
}

export function writeSymphonySession(record: SymphonySessionRecord): void {
  writeSymphonyRecord('session', record.uri, record)
}

export function updateSymphonyIssueStatus(
  record: SymphonyIssueRecord,
  status: SymphonyIssueStatus,
  updates: { error?: string; closedAt?: string } = {},
): SymphonyIssueRecord {
  const now = new Date().toISOString()
  const next: SymphonyIssueRecord = {
    ...record,
    status,
    updatedAt: now,
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.closedAt || status === 'resolved' || status === 'closed') ? { closedAt: updates.closedAt ?? now } : {}),
  }
  writeSymphonyIssue(next)
  return next
}

export function updateSymphonyDeliveryStatus(
  record: SymphonyDeliveryRecord,
  status: SymphonyDeliveryStatus,
  updates: { error?: string; autoModeSessionId?: string; completedAt?: string } = {},
): SymphonyDeliveryRecord {
  const now = new Date().toISOString()
  const next: SymphonyDeliveryRecord = {
    ...record,
    status,
    updatedAt: now,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
  writeSymphonyDelivery(next)
  return next
}

export function updateSymphonySessionStatus(
  record: SymphonySessionRecord,
  status: SymphonySessionStatus,
  updates: {
    error?: string
    autoModeSessionId?: string
    exitCode?: number | null
    dryRun?: boolean
    completedAt?: string
  } = {},
): SymphonySessionRecord {
  const now = new Date().toISOString()
  const next: SymphonySessionRecord = {
    ...record,
    status,
    updatedAt: now,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.exitCode !== undefined ? { exitCode: updates.exitCode } : {}),
    ...(updates.dryRun !== undefined ? { dryRun: updates.dryRun } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
  writeSymphonySession(next)
  return next
}

export function listSymphonyIssues(): SymphonyIssueRecord[] {
  return listSymphonyRecords('issue')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listSymphonyDeliveries(): SymphonyDeliveryRecord[] {
  return listSymphonyRecords('delivery')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listSymphonySessions(): SymphonySessionRecord[] {
  return listSymphonyRecords('session')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function loadSymphonyIssue(uriOrKey: string): SymphonyIssueRecord | null {
  return loadSymphonyRecord('issue', uriOrKey)
}

export function loadSymphonyDelivery(uriOrKey: string): SymphonyDeliveryRecord | null {
  return loadSymphonyRecord('delivery', uriOrKey)
}

export function loadSymphonySession(uriOrKey: string): SymphonySessionRecord | null {
  return loadSymphonyRecord('session', uriOrKey)
}

export function resolveSymphonyRecord(uriOrKey: string): {
  kind: SymphonyKind
  record: SymphonyIssueRecord | SymphonyDeliveryRecord | SymphonySessionRecord
} | null {
  const issue = loadSymphonyIssue(uriOrKey)
  if (issue) {
    return { kind: 'issue', record: issue }
  }

  const delivery = loadSymphonyDelivery(uriOrKey)
  if (delivery) {
    return { kind: 'delivery', record: delivery }
  }

  const session = loadSymphonySession(uriOrKey)
  if (session) {
    return { kind: 'session', record: session }
  }

  return null
}

export function formatSymphonyRecordSummary(
  kind: SymphonyKind,
  record: SymphonyIssueRecord | SymphonyDeliveryRecord | SymphonySessionRecord,
): string {
  if (kind === 'issue') {
    return formatSymphonyIssueSummary(record as SymphonyIssueRecord)
  }
  if (kind === 'delivery') {
    return formatSymphonyDeliverySummary(record as SymphonyDeliveryRecord)
  }
  return formatSymphonySessionSummary(record as SymphonySessionRecord)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function kindRoot(kind: SymphonyKind): string {
  const paths = getSymphonyArchiveRelativePaths('urn:undefineds:linx:placeholder:placeholder', kind)
  const dirName = paths.dir.split('/')[0]
  const dir = join(getSymphonyHome(), dirName)
  ensureDir(dir)
  return dir
}

function recordDir(kind: SymphonyKind, uri: string): string {
  const paths = getSymphonyArchiveRelativePaths(uri, kind)
  const dir = join(getSymphonyHome(), paths.dir)
  ensureDir(dir)
  return dir
}

function recordFile(kind: SymphonyKind, uri: string): string {
  const paths = getSymphonyArchiveRelativePaths(uri, kind)
  return join(getSymphonyHome(), paths.file)
}

function writeSymphonyRecord<K extends SymphonyKind>(kind: K, uri: string, record: SymphonyRecordMap[K]): void {
  recordDir(kind, uri)
  writeFileSync(recordFile(kind, uri), `${JSON.stringify(record, null, 2)}\n`)
}

function readSymphonyRecordFromDirectory<K extends SymphonyKind>(kind: K, uriOrKey: string): SymphonyRecordMap[K] | null {
  try {
    const raw = readFileSync(recordFile(kind, uriOrKey), 'utf-8')
    return JSON.parse(raw) as SymphonyRecordMap[K]
  } catch {
    return null
  }
}

function listSymphonyRecords<K extends SymphonyKind>(kind: K): SymphonyRecordMap[K][] {
  return readdirSync(kindRoot(kind))
    .map((name) => readSymphonyRecordFromDirectory(kind, name))
    .filter((item): item is SymphonyRecordMap[K] => item !== null)
}

function loadSymphonyRecord<K extends SymphonyKind>(kind: K, uriOrKey: string): SymphonyRecordMap[K] | null {
  const normalized = uriOrKey.trim()
  if (!normalized) {
    return null
  }

  const direct = readSymphonyRecordFromDirectory(kind, normalized)
  if (direct) {
    return direct
  }

  const exact = listSymphonyRecords(kind).filter((record) => record.uri === normalized || getSymphonyArchiveKey(record.uri) === normalized)
  if (exact.length === 1) {
    return exact[0]
  }

  const prefix = listSymphonyRecords(kind).filter((record) => getSymphonyArchiveKey(record.uri).startsWith(normalized))
  if (prefix.length === 1) {
    return prefix[0]
  }

  return null
}
