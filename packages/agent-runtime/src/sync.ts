export type LinxSyncAuthority = 'local-runtime' | 'core'
export type LinxSyncDirection = 'local-to-core' | 'core-to-local' | 'bidirectional'
export type LinxSyncPlane = 'runtime-log' | 'projection' | 'control-plane' | 'recovery'
type MaybePromise<T> = T | Promise<T>

export type LinxSyncOperationKind =
  | 'prepare'
  | 'insert'
  | 'upsert'
  | 'update'
  | 'delete'
  | 'checkpoint'
  | 'custom'

export interface LinxSyncContext {
  source: string
  target: string
  direction: LinxSyncDirection
  plane: LinxSyncPlane
  authority: LinxSyncAuthority
  signal?: AbortSignal
  now: () => Date
  metadata?: Record<string, unknown>
}

export interface LinxSyncOperation {
  id: string
  kind?: LinxSyncOperationKind
  description?: string
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  idempotencyKey?: string
  shouldRun?: (context: LinxSyncContext) => boolean | Promise<boolean>
  apply: (context: LinxSyncContext) => void | Promise<void>
}

export interface LinxSyncOperationFailure {
  operationId: string
  message: string
  failedAt?: string
  cause?: unknown
}

export interface LinxSyncRunResult {
  source: string
  target: string
  direction: LinxSyncDirection
  plane: LinxSyncPlane
  authority: LinxSyncAuthority
  attempted: number
  applied: number
  skipped: number
  failed: number
  failures: LinxSyncOperationFailure[]
  startedAt: string
  completedAt: string
  status: 'completed' | 'partial' | 'failed'
  metadata?: Record<string, unknown>
}

export interface LinxSyncRunOptions {
  source: string
  target: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  signal?: AbortSignal
  now?: () => Date
  metadata?: Record<string, unknown>
  continueOnError?: boolean
  checkpoint?: LinxSyncCheckpointStore
  checkpointId?: string | ((result: LinxSyncRunResult) => string)
  onOperationStart?: (operation: LinxSyncOperation, context: LinxSyncContext) => void | Promise<void>
  onOperationSuccess?: (operation: LinxSyncOperation, context: LinxSyncContext) => void | Promise<void>
  onOperationSkipped?: (operation: LinxSyncOperation, context: LinxSyncContext) => void | Promise<void>
  onOperationError?: (
    operation: LinxSyncOperation,
    error: LinxSyncOperationError,
    context: LinxSyncContext,
  ) => void | Promise<void>
}

export interface LinxSyncTaskOptions<T> extends Omit<LinxSyncRunOptions, 'continueOnError' | 'metadata'> {
  operationId: string
  kind?: LinxSyncOperationKind
  description?: string
  initialMetadata?: Record<string, unknown>
  metadata?: Record<string, unknown> | ((value: T) => Record<string, unknown>)
  onResult?: (result: LinxSyncRunResult) => void | Promise<void>
  task: (context: LinxSyncContext) => T | Promise<T>
}

export interface LinxSyncTaskRun<T> {
  value: T
  result: LinxSyncRunResult
}

export interface LinxSyncCheckpoint {
  id: string
  source: string
  target: string
  direction: LinxSyncDirection
  plane: LinxSyncPlane
  authority: LinxSyncAuthority
  status: LinxSyncRunResult['status']
  attempted: number
  applied: number
  skipped: number
  failed: number
  failures: LinxSyncOperationFailure[]
  startedAt: string
  completedAt: string
  metadata?: Record<string, unknown>
}

export interface LinxSyncCheckpointQuery {
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  status?: LinxSyncRunResult['status'] | LinxSyncRunResult['status'][]
  metadata?: Record<string, unknown>
}

export interface LinxSyncCheckpointStore {
  writeCheckpoint: (checkpoint: LinxSyncCheckpoint) => void | Promise<void>
  readCheckpoint?: (id: string) => LinxSyncCheckpoint | null | Promise<LinxSyncCheckpoint | null>
  listCheckpoints?: (query?: LinxSyncCheckpointQuery) => LinxSyncCheckpoint[] | Promise<LinxSyncCheckpoint[]>
  deleteCheckpoint?: (id: string) => void | Promise<void>
}

export class LinxSyncOperationError extends Error {
  readonly operationId: string
  readonly operationKind?: LinxSyncOperationKind

  constructor(operation: Pick<LinxSyncOperation, 'id' | 'kind'>, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause)
    super(`Sync operation failed (${operation.id}): ${message}`)
    this.name = 'LinxSyncOperationError'
    this.operationId = operation.id
    this.operationKind = operation.kind
    ;(this as { cause?: unknown }).cause = cause
  }
}

export async function runLinxSyncOperations(
  operations: Iterable<LinxSyncOperation>,
  options: LinxSyncRunOptions,
): Promise<LinxSyncRunResult> {
  const baseContext: LinxSyncContext = {
    source: options.source,
    target: options.target,
    direction: options.direction ?? 'local-to-core',
    plane: options.plane ?? 'projection',
    authority: options.authority ?? 'core',
    signal: options.signal,
    now: options.now ?? (() => new Date()),
    metadata: options.metadata,
  }
  const startedAt = baseContext.now().toISOString()

  const result: LinxSyncRunResult = {
    source: baseContext.source,
    target: baseContext.target,
    direction: baseContext.direction,
    plane: baseContext.plane,
    authority: baseContext.authority,
    attempted: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    startedAt,
    completedAt: startedAt,
    status: 'completed',
    metadata: baseContext.metadata,
  }

  for (const operation of operations) {
    throwIfSyncAborted(baseContext.signal)
    const context = resolveOperationContext(baseContext, operation)
    result.attempted += 1

    const shouldRun = operation.shouldRun ? await operation.shouldRun(context) : true
    if (!shouldRun) {
      result.skipped += 1
      await options.onOperationSkipped?.(operation, context)
      continue
    }

    await options.onOperationStart?.(operation, context)

    try {
      throwIfSyncAborted(context.signal)
      await operation.apply(context)
      throwIfSyncAborted(context.signal)
      result.applied += 1
      await options.onOperationSuccess?.(operation, context)
    } catch (cause) {
      const error = cause instanceof LinxSyncOperationError
        ? cause
        : new LinxSyncOperationError(operation, cause)
      result.failed += 1
      result.failures.push({
        operationId: operation.id,
        message: error.message,
        failedAt: context.now().toISOString(),
        cause: (error as { cause?: unknown }).cause,
      })
      await options.onOperationError?.(operation, error, context)
      if (!options.continueOnError) {
        finalizeSyncResult(result, context.now().toISOString())
        await writeSyncCheckpoint(options, result)
        throw error
      }
    }
  }

  finalizeSyncResult(result, baseContext.now().toISOString())
  await writeSyncCheckpoint(options, result)
  return result
}

export async function runLinxSyncTask<T>(options: LinxSyncTaskOptions<T>): Promise<LinxSyncTaskRun<T>> {
  let failed = false
  let failure: unknown
  let value: T
  const { initialMetadata: taskInitialMetadata, ...runOptions } = options
  const initialMetadata = typeof options.metadata === 'function' ? taskInitialMetadata : options.metadata
  const result = await runLinxSyncOperations([
    {
      id: options.operationId,
      kind: options.kind,
      description: options.description,
      apply: async (context) => {
        try {
          value = await options.task(context)
        } catch (error) {
          failed = true
          failure = error
          throw error
        }
      },
    },
  ], {
    ...runOptions,
    metadata: initialMetadata,
    continueOnError: true,
  })

  if (!failed && typeof options.metadata === 'function') {
    result.metadata = options.metadata(value!)
  }
  await options.onResult?.(result)
  if (failed) {
    throw failure
  }
  return { value: value!, result }
}

/**
 * Per-run sync ledger binding between a local/runtime key and a Pod resource.
 *
 * These bindings live on sync run/checkpoint metadata and are scoped by the
 * top-level sync `source`; they are not durable RDF predicates on business
 * resources. Multiple apps can bind the same Pod URI in separate checkpoints
 * without writing app-specific state onto the shared resource.
 */
export interface LinxPodSyncResourceBinding {
  uri?: string | null
  local?: string | null
}

export type LinxPodSyncResourceBindings = Record<string, LinxPodSyncResourceBinding | null | undefined>

/** @deprecated Use LinxPodSyncResourceBinding. */
export type LinxPodSyncResourceRef = LinxPodSyncResourceBinding

/** @deprecated Use LinxPodSyncResourceBindings. */
export type LinxPodSyncResourceRefs = LinxPodSyncResourceBindings

export interface LinxPodSyncMetadataInput {
  action: string
  resourceBindings?: LinxPodSyncResourceBindings | null
  /** @deprecated Use resourceBindings. */
  refs?: LinxPodSyncResourceBindings | null
  metadata?: Record<string, unknown> | null
}

export type LinxPodSyncValueFactory<T, TValue> = TValue | ((value: T) => TValue)

export interface LinxPodSyncScopeOptions extends Omit<LinxSyncRunOptions, 'continueOnError' | 'metadata' | 'target'> {
  target?: string
  metadata?: Record<string, unknown>
  onResult?: (result: LinxSyncRunResult) => void | Promise<void>
}

export interface LinxPodSyncTaskOptions<T> {
  action: string
  kind?: LinxSyncOperationKind
  description?: string
  operationId?: string
  subject?: string | null
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  resourceBindings?: LinxPodSyncValueFactory<T, LinxPodSyncResourceBindings | null | undefined>
  /** @deprecated Use resourceBindings. */
  refs?: LinxPodSyncValueFactory<T, LinxPodSyncResourceBindings | null | undefined>
  metadata?: LinxPodSyncValueFactory<T, Record<string, unknown> | null | undefined>
  onResult?: (result: LinxSyncRunResult) => void | Promise<void>
  task: (context: LinxSyncContext) => T | Promise<T>
}

export interface LinxPodSyncOperationsOptions {
  action: string
  operations: Iterable<LinxSyncOperation>
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  resourceBindings?: LinxPodSyncResourceBindings | null
  /** @deprecated Use resourceBindings. */
  refs?: LinxPodSyncResourceBindings | null
  metadata?: Record<string, unknown> | null
  continueOnError?: boolean
  checkpointId?: string | ((result: LinxSyncRunResult) => string)
  onResult?: (result: LinxSyncRunResult) => void | Promise<void>
}

export interface LinxPodSyncQueueTask {
  id?: string
  action: string
  kind?: LinxSyncOperationKind
  description?: string
  subject?: string | null
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  checkpointId?: string
  resourceBindings?: LinxPodSyncResourceBindings | null
  resolveResourceBindings?: (context: LinxSyncContext) => MaybePromise<LinxPodSyncResourceBindings | null | undefined>
  /** @deprecated Use resourceBindings. */
  refs?: LinxPodSyncResourceBindings | null
  /** @deprecated Use resolveResourceBindings. */
  resolveRefs?: (context: LinxSyncContext) => MaybePromise<LinxPodSyncResourceBindings | null | undefined>
  metadata?: Record<string, unknown> | null
  resolveMetadata?: (context: LinxSyncContext) => MaybePromise<Record<string, unknown> | null | undefined>
  run: (context: LinxSyncContext) => void | Promise<void>
}

export interface LinxPodSyncQueueOptions extends Omit<LinxSyncQueueOptions, 'metadata' | 'onResult'> {
  metadata?: Record<string, unknown>
  onResult?: (result: LinxSyncRunResult, task: LinxPodSyncQueueTask) => void | Promise<void>
}

export class LinxPodSyncScope {
  private readonly results: LinxSyncRunResult[] = []
  private sequence = 0

  constructor(private readonly options: LinxPodSyncScopeOptions) {}

  getResults(): LinxSyncRunResult[] {
    return [...this.results]
  }

  getLastResult(): LinxSyncRunResult | null {
    return this.results.length > 0 ? this.results[this.results.length - 1] : null
  }

  clearResults(): void {
    this.results.length = 0
    this.sequence = 0
  }

  async run<T>(options: LinxPodSyncTaskOptions<T>): Promise<T> {
    const initialMetadata = createLinxPodSyncMetadata({
      action: options.action,
      resourceBindings: resolveInitialResourceBindings(options.resourceBindings, options.refs),
      metadata: {
        ...this.options.metadata,
        ...(typeof options.metadata === 'function' ? undefined : options.metadata),
      },
    })

    const { value } = await runLinxSyncTask({
      operationId: options.operationId ?? this.nextOperationId(options.action, options.subject),
      kind: options.kind ?? 'custom',
      description: options.description ?? `${options.action}`,
      source: options.source ?? this.options.source,
      target: options.target ?? this.options.target ?? 'pod',
      direction: options.direction ?? this.options.direction ?? 'local-to-core',
      plane: options.plane ?? this.options.plane ?? 'projection',
      authority: options.authority ?? this.options.authority ?? 'core',
      signal: this.options.signal,
      now: this.options.now,
      checkpoint: this.options.checkpoint,
      checkpointId: this.options.checkpointId,
      initialMetadata,
      metadata: (value) => createLinxPodSyncMetadata({
        action: options.action,
        resourceBindings: mergeLinxPodSyncResourceBindings(
          resolveLinxPodSyncValue(options.refs, value),
          resolveLinxPodSyncValue(options.resourceBindings, value),
        ),
        metadata: {
          ...this.options.metadata,
          ...resolveLinxPodSyncValue(options.metadata, value),
        },
      }),
      onOperationStart: this.options.onOperationStart,
      onOperationSuccess: this.options.onOperationSuccess,
      onOperationSkipped: this.options.onOperationSkipped,
      onOperationError: this.options.onOperationError,
      onResult: async (result) => {
        this.results.push(result)
        await this.options.onResult?.(result)
        await options.onResult?.(result)
      },
      task: options.task,
    })

    return value
  }

  async runOperations(options: LinxPodSyncOperationsOptions): Promise<LinxSyncRunResult> {
    const result = await runLinxSyncOperations(options.operations, {
      source: options.source ?? this.options.source,
      target: options.target ?? this.options.target ?? 'pod',
      direction: options.direction ?? this.options.direction ?? 'local-to-core',
      plane: options.plane ?? this.options.plane ?? 'projection',
      authority: options.authority ?? this.options.authority ?? 'core',
      signal: this.options.signal,
      now: this.options.now,
      checkpoint: this.options.checkpoint,
      checkpointId: options.checkpointId ?? this.options.checkpointId,
      continueOnError: options.continueOnError,
      metadata: createLinxPodSyncMetadata({
        action: options.action,
        resourceBindings: mergeLinxPodSyncResourceBindings(options.refs, options.resourceBindings),
        metadata: {
          ...this.options.metadata,
          ...options.metadata,
        },
      }),
      onOperationStart: this.options.onOperationStart,
      onOperationSuccess: this.options.onOperationSuccess,
      onOperationSkipped: this.options.onOperationSkipped,
      onOperationError: this.options.onOperationError,
    })

    this.results.push(result)
    await this.options.onResult?.(result)
    await options.onResult?.(result)
    return result
  }

  private nextOperationId(action: string, subject?: string | null): string {
    const timestamp = (this.options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
    return `${this.options.source}:${action}:${normalizeLinxSyncOperationSegment(subject ?? 'sync')}:${timestamp}:${++this.sequence}`
  }
}

export function createLinxPodSyncScope(options: LinxPodSyncScopeOptions): LinxPodSyncScope {
  return new LinxPodSyncScope(options)
}

export function createLinxPodSyncMetadata(input: LinxPodSyncMetadataInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    action: input.action,
  }

  const resourceBindings = normalizeLinxPodSyncResourceBindings(
    mergeLinxPodSyncResourceBindings(input.refs, input.resourceBindings),
  )
  if (resourceBindings) {
    metadata.resourceBindings = resourceBindings
  }

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    setDefinedMetadataValue(metadata, key, value)
  }

  return metadata
}

export class LinxPodSyncQueue {
  private readonly queue: LinxSyncQueue
  private readonly tasks = new Map<string, LinxPodSyncQueueTask>()
  private sequence = 0

  constructor(private readonly options: LinxPodSyncQueueOptions) {
    const { onResult, metadata: _metadata, ...queueOptions } = options
    this.queue = createLinxSyncQueue({
      ...queueOptions,
      onResult: async (result, task) => {
        const podTask = this.tasks.get(task.id)
        if (podTask) {
          await onResult?.(result, podTask)
        }
      },
    })
  }

  enqueue(task: LinxPodSyncQueueTask): Promise<LinxSyncRunResult | null> {
    const id = task.id ?? this.nextOperationId(task.action, task.subject)
    this.tasks.set(id, task)
    const result = this.queue.enqueue({
      id,
      kind: task.kind ?? 'custom',
      description: task.description ?? task.action,
      source: task.source,
      target: task.target,
      direction: task.direction,
      plane: task.plane,
      authority: task.authority,
      checkpointId: task.checkpointId,
      metadata: createLinxPodSyncMetadata({
        action: task.action,
        resourceBindings: mergeLinxPodSyncResourceBindings(task.refs, task.resourceBindings),
        metadata: {
          ...this.options.metadata,
          ...task.metadata,
        },
      }),
      run: async (context) => {
        const resolvedRefs = await task.resolveRefs?.(context)
        const resolvedResourceBindings = await task.resolveResourceBindings?.(context)
        const resolvedMetadata = await task.resolveMetadata?.(context)
        if (resolvedRefs || resolvedResourceBindings || resolvedMetadata) {
          Object.assign(context.metadata ?? {}, createLinxPodSyncMetadata({
            action: task.action,
            resourceBindings: mergeLinxPodSyncResourceBindings(
              mergeLinxPodSyncResourceBindings(task.refs, task.resourceBindings),
              mergeLinxPodSyncResourceBindings(resolvedRefs, resolvedResourceBindings),
            ),
            metadata: {
              ...this.options.metadata,
              ...task.metadata,
              ...resolvedMetadata,
            },
          }))
        }
        await task.run(context)
      },
    })
    void result.finally(() => {
      this.tasks.delete(id)
    })
    return result
  }

  async flush(): Promise<void> {
    await this.queue.flush()
  }

  getResults(): LinxSyncRunResult[] {
    return this.queue.getResults()
  }

  private nextOperationId(action: string, subject?: string | null): string {
    const timestamp = (this.options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
    return `${this.options.source}:${action}:${normalizeLinxSyncOperationSegment(subject ?? 'sync')}:${timestamp}:${++this.sequence}`
  }
}

export function createLinxPodSyncQueue(options: LinxPodSyncQueueOptions): LinxPodSyncQueue {
  return new LinxPodSyncQueue(options)
}

export interface LinxSyncQueueTask {
  id: string
  kind?: LinxSyncOperationKind
  description?: string
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  checkpointId?: string
  metadata?: Record<string, unknown>
  run: (context: LinxSyncContext) => void | Promise<void>
}

export interface LinxSyncQueueOptions extends Omit<LinxSyncRunOptions, 'continueOnError'> {
  onError?: (error: unknown) => void
  onResult?: (result: LinxSyncRunResult, task: LinxSyncQueueTask) => void | Promise<void>
}

export class LinxSyncQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private readonly results: LinxSyncRunResult[] = []

  constructor(private readonly options: LinxSyncQueueOptions) {}

  enqueue(task: LinxSyncQueueTask): Promise<LinxSyncRunResult | null> {
    const operation: LinxSyncOperation = {
      id: task.id,
      kind: task.kind ?? 'custom',
      description: task.description,
      source: task.source,
      target: task.target,
      direction: task.direction,
      plane: task.plane,
      authority: task.authority,
      apply: task.run,
    }

    const next = this.tail
      .then(
        () => this.runTask(task, operation),
        () => this.runTask(task, operation),
      )
      .catch((error) => {
        this.options.onError?.(error)
        return null
      })

    this.tail = next
    return next
  }

  async flush(): Promise<void> {
    await this.tail
  }

  getResults(): LinxSyncRunResult[] {
    return [...this.results]
  }

  private async runTask(task: LinxSyncQueueTask, operation: LinxSyncOperation): Promise<LinxSyncRunResult> {
    const result = await runLinxSyncOperations([operation], {
      ...this.options,
      source: task.source ?? this.options.source,
      target: task.target ?? this.options.target,
      direction: task.direction ?? this.options.direction,
      plane: task.plane ?? this.options.plane,
      authority: task.authority ?? this.options.authority,
      checkpointId: task.checkpointId ?? task.id,
      metadata: {
        ...this.options.metadata,
        ...task.metadata,
        syncTask: task.id,
        ...(task.description ? { syncTaskDescription: task.description } : {}),
      },
    })
    this.results.push(result)
    await this.options.onResult?.(result, task)
    return result
  }
}

export function createLinxSyncQueue(options: LinxSyncQueueOptions): LinxSyncQueue {
  return new LinxSyncQueue(options)
}

export function createInMemoryLinxSyncCheckpointStore(
  initial: Iterable<LinxSyncCheckpoint> = [],
): Required<LinxSyncCheckpointStore> {
  const checkpoints = new Map<string, LinxSyncCheckpoint>()
  for (const checkpoint of initial) {
    checkpoints.set(checkpoint.id, checkpoint)
  }

  return {
    writeCheckpoint(checkpoint) {
      checkpoints.set(checkpoint.id, checkpoint)
    },
    readCheckpoint(id) {
      return checkpoints.get(id) ?? null
    },
    listCheckpoints(query) {
      return [...checkpoints.values()].filter((checkpoint) => matchesLinxSyncCheckpointQuery(checkpoint, query))
    },
    deleteCheckpoint(id) {
      checkpoints.delete(id)
    },
  }
}

export function createLinxSyncCheckpoint(
  id: string,
  result: LinxSyncRunResult,
  metadata?: Record<string, unknown>,
): LinxSyncCheckpoint {
  return {
    id,
    source: result.source,
    target: result.target,
    direction: result.direction,
    plane: result.plane,
    authority: result.authority,
    status: result.status,
    attempted: result.attempted,
    applied: result.applied,
    skipped: result.skipped,
    failed: result.failed,
    failures: result.failures,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    metadata,
  }
}

export async function readLinxSyncCheckpoint(
  store: LinxSyncCheckpointStore,
  id: string,
): Promise<LinxSyncCheckpoint | null> {
  return store.readCheckpoint ? await store.readCheckpoint(id) : null
}

export async function listLinxSyncCheckpoints(
  store: LinxSyncCheckpointStore,
  query?: LinxSyncCheckpointQuery,
): Promise<LinxSyncCheckpoint[]> {
  if (store.listCheckpoints) {
    return store.listCheckpoints(query)
  }
  return []
}

export async function deleteLinxSyncCheckpoint(
  store: LinxSyncCheckpointStore,
  id: string,
): Promise<void> {
  await store.deleteCheckpoint?.(id)
}

export function matchesLinxSyncCheckpointQuery(
  checkpoint: LinxSyncCheckpoint,
  query: LinxSyncCheckpointQuery = {},
): boolean {
  if (query.source !== undefined && checkpoint.source !== query.source) return false
  if (query.target !== undefined && checkpoint.target !== query.target) return false
  if (query.direction !== undefined && checkpoint.direction !== query.direction) return false
  if (query.plane !== undefined && checkpoint.plane !== query.plane) return false
  if (query.authority !== undefined && checkpoint.authority !== query.authority) return false
  if (query.status !== undefined) {
    const statuses = Array.isArray(query.status) ? query.status : [query.status]
    if (!statuses.includes(checkpoint.status)) return false
  }
  if (query.metadata) {
    for (const [key, value] of Object.entries(query.metadata)) {
      if (!matchesLinxSyncMetadataValue(readLinxSyncMetadataValue(checkpoint.metadata, key), value)) return false
    }
  }
  return true
}

function readLinxSyncMetadataValue(metadata: Record<string, unknown> | undefined, key: string): unknown {
  if (key === 'resourceBindings') {
    return metadata?.resourceBindings ?? metadata?.refs
  }
  if (key === 'refs') {
    return metadata?.refs ?? metadata?.resourceBindings
  }
  return metadata?.[key]
}

function matchesLinxSyncMetadataValue(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
      return false
    }

    const actualRecord = actual as Record<string, unknown>
    return Object.entries(expected as Record<string, unknown>)
      .every(([key, value]) => matchesLinxSyncMetadataValue(actualRecord[key], value))
  }

  return actual === expected
}

export function isPendingLinxSyncCheckpoint(checkpoint: LinxSyncCheckpoint): boolean {
  return checkpoint.status === 'failed' || checkpoint.status === 'partial'
}

function finalizeSyncResult(result: LinxSyncRunResult, completedAt: string): void {
  result.completedAt = completedAt
  result.status = result.failed === 0
    ? 'completed'
    : result.applied > 0 || result.skipped > 0
      ? 'partial'
      : 'failed'
}

async function writeSyncCheckpoint(options: LinxSyncRunOptions, result: LinxSyncRunResult): Promise<void> {
  if (!options.checkpoint) {
    return
  }
  const checkpointId = typeof options.checkpointId === 'function'
    ? options.checkpointId(result)
    : options.checkpointId ?? `${result.source}:${result.target}:${result.plane}`

  await options.checkpoint.writeCheckpoint(createLinxSyncCheckpoint(
    checkpointId,
    result,
    options.metadata,
  ))
}

function resolveOperationContext(base: LinxSyncContext, operation: LinxSyncOperation): LinxSyncContext {
  return {
    ...base,
    source: operation.source ?? base.source,
    target: operation.target ?? base.target,
    direction: operation.direction ?? base.direction,
    plane: operation.plane ?? base.plane,
    authority: operation.authority ?? base.authority,
  }
}

function resolveLinxPodSyncValue<T, TValue>(
  value: LinxPodSyncValueFactory<T, TValue> | undefined,
  input: T,
): TValue | undefined {
  return typeof value === 'function'
    ? (value as (input: T) => TValue)(input)
    : value
}

function resolveInitialResourceBindings<T>(
  resourceBindings: LinxPodSyncValueFactory<T, LinxPodSyncResourceBindings | null | undefined> | undefined,
  refs: LinxPodSyncValueFactory<T, LinxPodSyncResourceBindings | null | undefined> | undefined,
): LinxPodSyncResourceBindings | undefined {
  return mergeLinxPodSyncResourceBindings(
    typeof refs === 'function' ? undefined : refs,
    typeof resourceBindings === 'function' ? undefined : resourceBindings,
  )
}

function mergeLinxPodSyncResourceBindings(
  base: LinxPodSyncResourceBindings | null | undefined,
  override: LinxPodSyncResourceBindings | null | undefined,
): LinxPodSyncResourceBindings | undefined {
  if (!base && !override) {
    return undefined
  }

  const merged: LinxPodSyncResourceBindings = { ...(base ?? {}) }
  for (const [name, ref] of Object.entries(override ?? {})) {
    if (!ref) {
      merged[name] = ref
      continue
    }
    merged[name] = {
      ...(merged[name] ?? {}),
      ...ref,
    }
  }
  return merged
}

function normalizeLinxPodSyncResourceBindings(
  resourceBindings: LinxPodSyncResourceBindings | null | undefined,
): Record<string, LinxPodSyncResourceBinding> | undefined {
  const normalized: Record<string, LinxPodSyncResourceBinding> = {}
  for (const [name, ref] of Object.entries(resourceBindings ?? {})) {
    if (!ref) continue
    const next: LinxPodSyncResourceBinding = {}
    if (ref.uri !== undefined && ref.uri !== null) {
      next.uri = ref.uri
    }
    if (ref.local !== undefined && ref.local !== null) {
      next.local = ref.local
    }
    if (Object.keys(next).length > 0) {
      normalized[name] = next
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function setDefinedMetadataValue(metadata: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    metadata[key] = value
  }
}

function normalizeLinxSyncOperationSegment(value: string): string {
  return value.replace(/[:\s]+/g, '-')
}

function throwIfSyncAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return
  }

  if (signal.reason instanceof Error) {
    throw signal.reason
  }

  const error = new Error('The sync operation was aborted.')
  error.name = 'AbortError'
  throw error
}
