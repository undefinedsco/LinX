import type { WakeJob, WakeJobPriority } from './reconciler.js'

type MaybePromise<T> = T | Promise<T>

export type WakeJobExecutionStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface WakeJobExecutionRecord {
  key: string
  job: WakeJob
  status: WakeJobExecutionStatus
  queuedAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  result?: unknown
}

export type WakeJobHandler = (
  job: WakeJob,
  record: WakeJobExecutionRecord,
) => MaybePromise<unknown>

export interface WakeJobSchedulerOptions {
  handler: WakeJobHandler
  concurrency?: number
  now?: () => Date
  dedupeKey?: (job: WakeJob) => string
  onQueued?: (record: WakeJobExecutionRecord) => void
  onStarted?: (record: WakeJobExecutionRecord) => void
  onCompleted?: (record: WakeJobExecutionRecord) => void
  onFailed?: (record: WakeJobExecutionRecord) => void
}

export interface WakeJobSchedulerSnapshot {
  queued: WakeJobExecutionRecord[]
  running: WakeJobExecutionRecord[]
  completed: WakeJobExecutionRecord[]
  failed: WakeJobExecutionRecord[]
  cancelled: WakeJobExecutionRecord[]
  skipped: WakeJobExecutionRecord[]
  all: WakeJobExecutionRecord[]
}

export interface WakeJobExecutionRecordSummary {
  key: string
  status: WakeJobExecutionStatus
  targetAgent: string
  targetRole: string
  trigger: string
  priority: WakeJobPriority
  queuedAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  result?: unknown
}

export interface WakeJobSchedulerSnapshotSummary {
  queued: WakeJobExecutionRecordSummary[]
  running: WakeJobExecutionRecordSummary[]
  completed: WakeJobExecutionRecordSummary[]
  failed: WakeJobExecutionRecordSummary[]
  cancelled: WakeJobExecutionRecordSummary[]
  skipped: WakeJobExecutionRecordSummary[]
}

export interface WakeJobScheduler {
  submit(job: WakeJob | WakeJob[]): WakeJobExecutionRecord[]
  start(): void
  stop(): void
  drain(): Promise<void>
  snapshot(): WakeJobSchedulerSnapshot
  get(key: string): WakeJobExecutionRecord | undefined
}

interface QueuedWakeJob {
  record: WakeJobExecutionRecord
  sequence: number
}

const PRIORITY_RANK: Record<WakeJobPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
}

export function createWakeJobScheduler(options: WakeJobSchedulerOptions): WakeJobScheduler {
  return new InMemoryWakeJobScheduler(options)
}

export function defaultWakeJobDedupeKey(job: WakeJob): string {
  const source = job.sourceEventId ?? job.id ?? job.sourceEventType
  return [
    job.thread,
    job.chat ?? '',
    job.targetAgent,
    job.targetRole,
    source,
    job.trigger,
  ].join('|')
}

export function summarizeWakeJobExecutionRecord(
  record: WakeJobExecutionRecord,
): WakeJobExecutionRecordSummary {
  return {
    key: record.key,
    status: record.status,
    targetAgent: record.job.targetAgent,
    targetRole: record.job.targetRole,
    trigger: record.job.trigger,
    priority: record.job.priority,
    queuedAt: record.queuedAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    error: record.error,
    result: record.result,
  }
}

export function summarizeWakeJobSchedulerSnapshot(
  snapshot: WakeJobSchedulerSnapshot,
): WakeJobSchedulerSnapshotSummary {
  return {
    queued: snapshot.queued.map(summarizeWakeJobExecutionRecord),
    running: snapshot.running.map(summarizeWakeJobExecutionRecord),
    completed: snapshot.completed.map(summarizeWakeJobExecutionRecord),
    failed: snapshot.failed.map(summarizeWakeJobExecutionRecord),
    cancelled: snapshot.cancelled.map(summarizeWakeJobExecutionRecord),
    skipped: snapshot.skipped.map(summarizeWakeJobExecutionRecord),
  }
}

class InMemoryWakeJobScheduler implements WakeJobScheduler {
  private readonly handler: WakeJobHandler
  private readonly concurrency: number
  private readonly now: () => Date
  private readonly dedupeKey: (job: WakeJob) => string
  private readonly records = new Map<string, WakeJobExecutionRecord>()
  private readonly queue: QueuedWakeJob[] = []
  private readonly running = new Set<string>()
  private readonly drainResolvers: Array<() => void> = []
  private started = false
  private sequence = 0

  constructor(private readonly options: WakeJobSchedulerOptions) {
    this.handler = options.handler
    this.concurrency = normalizeConcurrency(options.concurrency)
    this.now = options.now ?? (() => new Date())
    this.dedupeKey = options.dedupeKey ?? defaultWakeJobDedupeKey
  }

  submit(input: WakeJob | WakeJob[]): WakeJobExecutionRecord[] {
    const jobs = Array.isArray(input) ? input : [input]
    const records = jobs.map((job) => this.enqueue(job))
    this.pump()
    return records.map(cloneRecord)
  }

  start(): void {
    this.started = true
    this.pump()
  }

  stop(): void {
    this.started = false
  }

  drain(): Promise<void> {
    if (this.isDrained()) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.drainResolvers.push(resolve)
      this.pump()
    })
  }

  snapshot(): WakeJobSchedulerSnapshot {
    const all = [...this.records.values()].map(cloneRecord)
    return {
      queued: all.filter((record) => record.status === 'queued'),
      running: all.filter((record) => record.status === 'running'),
      completed: all.filter((record) => record.status === 'completed'),
      failed: all.filter((record) => record.status === 'failed'),
      cancelled: all.filter((record) => record.status === 'cancelled'),
      skipped: all.filter((record) => record.status === 'skipped'),
      all,
    }
  }

  get(key: string): WakeJobExecutionRecord | undefined {
    const record = this.records.get(key)
    return record ? cloneRecord(record) : undefined
  }

  private enqueue(job: WakeJob): WakeJobExecutionRecord {
    const key = this.dedupeKey(job)
    const existing = this.records.get(key)
    if (existing) {
      return existing
    }

    const record: WakeJobExecutionRecord = {
      key,
      job,
      status: 'queued',
      queuedAt: this.now().toISOString(),
    }
    this.records.set(key, record)
    this.sequence += 1
    this.queue.push({
      record,
      sequence: this.sequence,
    })
    this.options.onQueued?.(cloneRecord(record))
    return record
  }

  private pump(): void {
    while (this.started && this.running.size < this.concurrency && this.queue.length > 0) {
      const queued = this.takeNextQueued()
      this.startRecord(queued.record)
    }
    this.resolveDrainIfIdle()
  }

  private takeNextQueued(): QueuedWakeJob {
    let bestIndex = 0
    for (let index = 1; index < this.queue.length; index += 1) {
      if (compareQueuedJobs(this.queue[index], this.queue[bestIndex]) < 0) {
        bestIndex = index
      }
    }
    const [queued] = this.queue.splice(bestIndex, 1)
    return queued
  }

  private startRecord(record: WakeJobExecutionRecord): void {
    record.status = 'running'
    record.startedAt = this.now().toISOString()
    this.running.add(record.key)
    this.options.onStarted?.(cloneRecord(record))

    void Promise.resolve()
      .then(() => this.handler(record.job, cloneRecord(record)))
      .then((result) => {
        record.status = 'completed'
        record.completedAt = this.now().toISOString()
        record.result = result
        this.options.onCompleted?.(cloneRecord(record))
      })
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause.message : String(cause)
        record.status = 'failed'
        record.completedAt = this.now().toISOString()
        record.error = error
        this.options.onFailed?.(cloneRecord(record))
      })
      .finally(() => {
        this.running.delete(record.key)
        this.pump()
      })
  }

  private isDrained(): boolean {
    return this.queue.length === 0 && this.running.size === 0
  }

  private resolveDrainIfIdle(): void {
    if (!this.isDrained()) {
      return
    }
    while (this.drainResolvers.length > 0) {
      this.drainResolvers.shift()?.()
    }
  }
}

function compareQueuedJobs(left: QueuedWakeJob, right: QueuedWakeJob): number {
  const priority = PRIORITY_RANK[right.record.job.priority] - PRIORITY_RANK[left.record.job.priority]
  return priority === 0 ? left.sequence - right.sequence : priority
}

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1
  }
  return Math.max(1, Math.floor(value))
}

function cloneRecord(record: WakeJobExecutionRecord): WakeJobExecutionRecord {
  return {
    ...record,
    job: {
      ...record.job,
    },
  }
}
