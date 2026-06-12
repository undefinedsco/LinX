import {
  reconcileThreadEvent,
  summarizeReconcileDecision,
  type ReconcileDecision,
  type ReconcileDecisionSummary,
  type ReconcileThreadEventInput,
  type ReconcilerNotificationEvent,
  type ThreadControlEvent,
  type ThreadPolicy,
  type ThreadPolicyKind,
  type WakeJob,
} from './reconciler.js'
import {
  createWakeJobScheduler,
  defaultWakeJobDedupeKey,
  summarizeWakeJobExecutionRecord,
  summarizeWakeJobSchedulerSnapshot,
  type WakeJobExecutionRecord,
  type WakeJobExecutionRecordSummary,
  type WakeJobScheduler,
  type WakeJobSchedulerSnapshot,
  type WakeJobSchedulerSnapshotSummary,
} from './wake-scheduler.js'

type MaybePromise<T> = T | Promise<T>

export interface ThreadWakeJobContext {
  job: WakeJob
  record: WakeJobExecutionRecord
  decision: ReconcileDecision
  decisionSummary: ReconcileDecisionSummary
}

export type ThreadWakeJobHandler = (context: ThreadWakeJobContext) => MaybePromise<unknown>

export interface ThreadReconcilerControllerOptions {
  policy: ThreadPolicyKind | ThreadPolicy
  handleWakeJob: ThreadWakeJobHandler
  concurrency?: number
  autoStart?: boolean
  now?: () => Date
  onDecision?: (decision: ReconcileDecisionSummary) => void
  onWakeJobQueued?: (record: WakeJobExecutionRecord, decision: ReconcileDecisionSummary) => void
  onWakeJobStarted?: (record: WakeJobExecutionRecord, decision: ReconcileDecisionSummary) => void
  onWakeJobCompleted?: (record: WakeJobExecutionRecord, decision: ReconcileDecisionSummary) => void
  onWakeJobFailed?: (record: WakeJobExecutionRecord, decision: ReconcileDecisionSummary) => void
  onNotificationEvent?: (event: ReconcilerNotificationEvent, decision: ReconcileDecisionSummary) => void
}

export interface ThreadReconcilerDispatchOptions extends Omit<ReconcileThreadEventInput, 'policy' | 'event'> {}

export interface ThreadReconcilerDispatchResult {
  decision: ReconcileDecision
  summary: ReconcileDecisionSummary
  wakeRecords: WakeJobExecutionRecord[]
  wakeRecordSummaries: WakeJobExecutionRecordSummary[]
}

export interface ThreadReconcilerDrainResult {
  scheduler: WakeJobSchedulerSnapshot
  schedulerSummary: WakeJobSchedulerSnapshotSummary
}

export interface ThreadReconcilerDispatchAndDrainResult extends ThreadReconcilerDispatchResult, ThreadReconcilerDrainResult {}

export interface ThreadReconcilerDecisionResult {
  decision: ReconcileDecision
  summary: ReconcileDecisionSummary
}

export interface RunThreadReconcilerCycleOptions extends Omit<ThreadReconcilerControllerOptions, 'autoStart'> {
  event: ThreadControlEvent
  dispatchOptions?: ThreadReconcilerDispatchOptions
  onDispatched?: (result: ThreadReconcilerDispatchResult) => MaybePromise<void>
}

export interface ThreadReconcilerController {
  dispatch(event: ThreadControlEvent, options?: ThreadReconcilerDispatchOptions): ThreadReconcilerDispatchResult
  dispatchAndDrain(
    event: ThreadControlEvent,
    options?: ThreadReconcilerDispatchOptions,
  ): Promise<ThreadReconcilerDispatchAndDrainResult>
  startAndDrain(): Promise<ThreadReconcilerDrainResult>
  start(): void
  stop(): void
  drain(): Promise<void>
  snapshot(): WakeJobSchedulerSnapshot
}

export function createThreadReconcilerController(
  options: ThreadReconcilerControllerOptions,
): ThreadReconcilerController {
  return new ConfiguredThreadReconcilerController(options)
}

export function decideThreadControlEvent(input: ReconcileThreadEventInput): ThreadReconcilerDecisionResult {
  const decision = reconcileThreadEvent(input)
  return {
    decision,
    summary: summarizeReconcileDecision(decision),
  }
}

export async function runThreadReconcilerCycle(
  options: RunThreadReconcilerCycleOptions,
): Promise<ThreadReconcilerDispatchAndDrainResult> {
  const {
    event,
    dispatchOptions,
    onDispatched,
    ...controllerOptions
  } = options
  const controller = createThreadReconcilerController({
    ...controllerOptions,
    autoStart: false,
  })
  const dispatch = controller.dispatch(event, dispatchOptions)
  await onDispatched?.(dispatch)
  const drain = await controller.startAndDrain()
  return {
    ...dispatch,
    ...drain,
  }
}

class ConfiguredThreadReconcilerController implements ThreadReconcilerController {
  private readonly scheduler: WakeJobScheduler
  private readonly contexts = new Map<string, {
    decision: ReconcileDecision
    summary: ReconcileDecisionSummary
  }>()

  constructor(private readonly options: ThreadReconcilerControllerOptions) {
    this.scheduler = createWakeJobScheduler({
      concurrency: options.concurrency,
      now: options.now,
      dedupeKey: defaultWakeJobDedupeKey,
      handler: async (job, record) => {
        const context = this.contexts.get(record.key)
        if (!context) {
          throw new Error(`No reconciler decision found for wake job ${record.key}`)
        }
        return options.handleWakeJob({
          job,
          record,
          decision: context.decision,
          decisionSummary: context.summary,
        })
      },
      onQueued: (record) => this.emitWakeHook('queued', record),
      onStarted: (record) => this.emitWakeHook('started', record),
      onCompleted: (record) => this.emitWakeHook('completed', record),
      onFailed: (record) => this.emitWakeHook('failed', record),
    })

    if (options.autoStart !== false) {
      this.scheduler.start()
    }
  }

  dispatch(event: ThreadControlEvent, options: ThreadReconcilerDispatchOptions = {}): ThreadReconcilerDispatchResult {
    const { decision, summary } = decideThreadControlEvent({
      ...options,
      now: options.now ?? this.options.now?.(),
      policy: this.options.policy,
      event,
    })
    this.options.onDecision?.(summary)
    for (const notificationEvent of decision.notificationEvents ?? []) {
      this.options.onNotificationEvent?.(notificationEvent, summary)
    }
    for (const job of decision.wakeJobs) {
      const key = defaultWakeJobDedupeKey(job)
      if (!this.contexts.has(key)) {
        this.contexts.set(key, {
          decision,
          summary,
        })
      }
    }
    const wakeRecords = this.scheduler.submit(decision.wakeJobs)
    for (const record of wakeRecords) {
      if (!this.contexts.has(record.key)) {
        this.contexts.set(record.key, {
          decision,
          summary,
        })
      }
    }
    return {
      decision,
      summary,
      wakeRecords,
      wakeRecordSummaries: wakeRecords.map(summarizeWakeJobExecutionRecord),
    }
  }

  async dispatchAndDrain(
    event: ThreadControlEvent,
    options: ThreadReconcilerDispatchOptions = {},
  ): Promise<ThreadReconcilerDispatchAndDrainResult> {
    const dispatch = this.dispatch(event, options)
    const drain = await this.startAndDrain()
    return {
      ...dispatch,
      ...drain,
    }
  }

  async startAndDrain(): Promise<ThreadReconcilerDrainResult> {
    this.start()
    await this.drain()
    const scheduler = this.snapshot()
    return {
      scheduler,
      schedulerSummary: summarizeWakeJobSchedulerSnapshot(scheduler),
    }
  }

  start(): void {
    this.scheduler.start()
  }

  stop(): void {
    this.scheduler.stop()
  }

  drain(): Promise<void> {
    return this.scheduler.drain()
  }

  snapshot(): WakeJobSchedulerSnapshot {
    return this.scheduler.snapshot()
  }

  private emitWakeHook(
    status: 'queued' | 'started' | 'completed' | 'failed',
    record: WakeJobExecutionRecord,
  ): void {
    const context = this.contexts.get(record.key)
    if (!context) {
      return
    }
    if (status === 'queued') {
      this.options.onWakeJobQueued?.(record, context.summary)
    } else if (status === 'started') {
      this.options.onWakeJobStarted?.(record, context.summary)
    } else if (status === 'completed') {
      this.options.onWakeJobCompleted?.(record, context.summary)
    } else {
      this.options.onWakeJobFailed?.(record, context.summary)
    }
  }
}
