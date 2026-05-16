import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createLinxSymphonyRunPlan,
  formatLinxSymphonyDeliverySummary,
  formatLinxSymphonySessionSummary,
  formatLinxSymphonyTaskSummary,
  getLinxSymphonyArchiveRelativePaths,
  LINX_SYMPHONY_HOME_DIRNAME,
  type CreateLinxSymphonyRunPlanInput,
  type LinxSymphonyDeliveryRecord,
  type LinxSymphonyDeliveryStatus,
  type LinxSymphonyRunPlan,
  type LinxSymphonySessionRecord,
  type LinxSymphonySessionStatus,
  type LinxSymphonyTaskRecord,
  type LinxSymphonyTaskStatus,
} from '@linx/agent-runtime/symphony'
import { LINX_HOME_DIRNAME } from '@undefineds.co/models/client'

type SymphonyKind = 'task' | 'delivery' | 'session'

interface SymphonyRecordMap {
  task: LinxSymphonyTaskRecord
  delivery: LinxSymphonyDeliveryRecord
  session: LinxSymphonySessionRecord
}

export function getLinxSymphonyHome(): string {
  return join(homedir(), LINX_HOME_DIRNAME, LINX_SYMPHONY_HOME_DIRNAME)
}

export function createArchivedLinxSymphonyRunPlan(input: CreateLinxSymphonyRunPlanInput): LinxSymphonyRunPlan {
  const plan = createLinxSymphonyRunPlan(input)
  writeLinxSymphonyTask(plan.task)
  writeLinxSymphonyDelivery(plan.delivery)
  writeLinxSymphonySession(plan.session)
  return plan
}

export function writeLinxSymphonyTask(record: LinxSymphonyTaskRecord): void {
  writeLinxSymphonyRecord('task', record.id, record)
}

export function writeLinxSymphonyDelivery(record: LinxSymphonyDeliveryRecord): void {
  writeLinxSymphonyRecord('delivery', record.id, record)
}

export function writeLinxSymphonySession(record: LinxSymphonySessionRecord): void {
  writeLinxSymphonyRecord('session', record.id, record)
}

export function updateLinxSymphonyTaskStatus(
  record: LinxSymphonyTaskRecord,
  status: LinxSymphonyTaskStatus,
  updates: { error?: string; completedAt?: string } = {},
): LinxSymphonyTaskRecord {
  const now = new Date().toISOString()
  const next: LinxSymphonyTaskRecord = {
    ...record,
    status,
    updatedAt: now,
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
  writeLinxSymphonyTask(next)
  return next
}

export function updateLinxSymphonyDeliveryStatus(
  record: LinxSymphonyDeliveryRecord,
  status: LinxSymphonyDeliveryStatus,
  updates: { error?: string; autoModeSessionId?: string; completedAt?: string } = {},
): LinxSymphonyDeliveryRecord {
  const now = new Date().toISOString()
  const next: LinxSymphonyDeliveryRecord = {
    ...record,
    status,
    updatedAt: now,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
  writeLinxSymphonyDelivery(next)
  return next
}

export function updateLinxSymphonySessionStatus(
  record: LinxSymphonySessionRecord,
  status: LinxSymphonySessionStatus,
  updates: {
    error?: string
    autoModeSessionId?: string
    exitCode?: number | null
    dryRun?: boolean
    completedAt?: string
  } = {},
): LinxSymphonySessionRecord {
  const now = new Date().toISOString()
  const next: LinxSymphonySessionRecord = {
    ...record,
    status,
    updatedAt: now,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.exitCode !== undefined ? { exitCode: updates.exitCode } : {}),
    ...(updates.dryRun !== undefined ? { dryRun: updates.dryRun } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
  writeLinxSymphonySession(next)
  return next
}

export function listLinxSymphonyTasks(): LinxSymphonyTaskRecord[] {
  return listLinxSymphonyRecords('task')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listLinxSymphonyDeliveries(): LinxSymphonyDeliveryRecord[] {
  return listLinxSymphonyRecords('delivery')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listLinxSymphonySessions(): LinxSymphonySessionRecord[] {
  return listLinxSymphonyRecords('session')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function loadLinxSymphonyTask(id: string): LinxSymphonyTaskRecord | null {
  return loadLinxSymphonyRecord('task', id)
}

export function loadLinxSymphonyDelivery(id: string): LinxSymphonyDeliveryRecord | null {
  return loadLinxSymphonyRecord('delivery', id)
}

export function loadLinxSymphonySession(id: string): LinxSymphonySessionRecord | null {
  return loadLinxSymphonyRecord('session', id)
}

export function resolveLinxSymphonyRecord(id: string): {
  kind: SymphonyKind
  record: LinxSymphonyTaskRecord | LinxSymphonyDeliveryRecord | LinxSymphonySessionRecord
} | null {
  const task = loadLinxSymphonyTask(id)
  if (task) {
    return { kind: 'task', record: task }
  }

  const delivery = loadLinxSymphonyDelivery(id)
  if (delivery) {
    return { kind: 'delivery', record: delivery }
  }

  const session = loadLinxSymphonySession(id)
  if (session) {
    return { kind: 'session', record: session }
  }

  return null
}

export function formatLinxSymphonyRecordSummary(
  kind: SymphonyKind,
  record: LinxSymphonyTaskRecord | LinxSymphonyDeliveryRecord | LinxSymphonySessionRecord,
): string {
  if (kind === 'task') {
    return formatLinxSymphonyTaskSummary(record as LinxSymphonyTaskRecord)
  }
  if (kind === 'delivery') {
    return formatLinxSymphonyDeliverySummary(record as LinxSymphonyDeliveryRecord)
  }
  return formatLinxSymphonySessionSummary(record as LinxSymphonySessionRecord)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function kindRoot(kind: SymphonyKind): string {
  const paths = getLinxSymphonyArchiveRelativePaths('__placeholder__', kind)
  const dirName = paths.dir.split('/')[0]
  const dir = join(getLinxSymphonyHome(), dirName)
  ensureDir(dir)
  return dir
}

function recordDir(kind: SymphonyKind, id: string): string {
  const paths = getLinxSymphonyArchiveRelativePaths(id, kind)
  const dir = join(getLinxSymphonyHome(), paths.dir)
  ensureDir(dir)
  return dir
}

function recordFile(kind: SymphonyKind, id: string): string {
  const paths = getLinxSymphonyArchiveRelativePaths(id, kind)
  return join(getLinxSymphonyHome(), paths.file)
}

function writeLinxSymphonyRecord<K extends SymphonyKind>(kind: K, id: string, record: SymphonyRecordMap[K]): void {
  recordDir(kind, id)
  writeFileSync(recordFile(kind, id), `${JSON.stringify(record, null, 2)}\n`)
}

function readLinxSymphonyRecordFromDirectory<K extends SymphonyKind>(kind: K, id: string): SymphonyRecordMap[K] | null {
  try {
    const raw = readFileSync(recordFile(kind, id), 'utf-8')
    return JSON.parse(raw) as SymphonyRecordMap[K]
  } catch {
    return null
  }
}

function listLinxSymphonyRecords<K extends SymphonyKind>(kind: K): SymphonyRecordMap[K][] {
  return readdirSync(kindRoot(kind))
    .map((name) => readLinxSymphonyRecordFromDirectory(kind, name))
    .filter((item): item is SymphonyRecordMap[K] => item !== null)
}

function loadLinxSymphonyRecord<K extends SymphonyKind>(kind: K, id: string): SymphonyRecordMap[K] | null {
  const normalized = id.trim()
  if (!normalized) {
    return null
  }

  const direct = readLinxSymphonyRecordFromDirectory(kind, normalized)
  if (direct) {
    return direct
  }

  const exact = listLinxSymphonyRecords(kind).filter((record) => record.id === normalized)
  if (exact.length === 1) {
    return exact[0]
  }

  const prefix = listLinxSymphonyRecords(kind).filter((record) => record.id.startsWith(normalized))
  if (prefix.length === 1) {
    return prefix[0]
  }

  return null
}
