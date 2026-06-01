import {
  createLinxPodSyncScope,
  type LinxPodSyncScope,
  type LinxSyncDirection,
  type LinxSyncOperationKind,
  type LinxSyncPlane,
  type LinxSyncRunResult,
} from '@linx/agent-runtime/sync'

export type PodCollectionSyncAction =
  | 'fetch'
  | 'insert'
  | 'update'
  | 'delete'
  | 'subscription.create'
  | 'subscription.update'
  | 'subscription.delete'

export interface PodCollectionSyncRunOptions {
  action: PodCollectionSyncAction
  kind?: LinxSyncOperationKind
  source: string
  target: string
  direction: LinxSyncDirection
  plane?: LinxSyncPlane
  metadata?: Record<string, unknown>
}

export interface PodCollectionSyncTrackerOptions {
  queryKey: string[]
  source?: string
  target?: string
  now?: () => Date
  onResult?: (result: LinxSyncRunResult) => void
}

export class PodCollectionSyncTracker {
  private readonly results: LinxSyncRunResult[] = []
  private readonly sync: LinxPodSyncScope
  private sequence = 0

  constructor(private readonly options: PodCollectionSyncTrackerOptions) {
    this.sync = createLinxPodSyncScope({
      source: options.source ?? this.collectionTarget(),
      target: options.target ?? 'pod',
      plane: 'projection',
      authority: 'core',
      now: options.now,
      metadata: { queryKey: options.queryKey.join('/') },
      onResult: (result) => {
        this.results.push(result)
        this.options.onResult?.(result)
      },
    })
  }

  getResults(): LinxSyncRunResult[] {
    return [...this.results]
  }

  getLastResult(): LinxSyncRunResult | null {
    return this.results.length > 0 ? this.results[this.results.length - 1] : null
  }

  runCoreRead<T>(
    action: Extract<PodCollectionSyncAction, 'fetch' | `subscription.${string}`>,
    operation: () => T | Promise<T>,
    metadata: Record<string, unknown> = {},
  ): Promise<T> {
    return this.run({
      action,
      kind: action === 'fetch' ? 'upsert' : 'update',
      source: this.options.source ?? 'pod',
      target: this.options.target ?? this.collectionTarget(),
      direction: 'core-to-local',
      metadata,
    }, operation)
  }

  runCoreWrite<T>(
    action: Extract<PodCollectionSyncAction, 'insert' | 'update' | 'delete'>,
    operation: () => T | Promise<T>,
    metadata: Record<string, unknown> = {},
  ): Promise<T> {
    return this.run({
      action,
      kind: action,
      source: this.options.target ?? this.collectionTarget(),
      target: this.options.source ?? 'pod',
      direction: 'local-to-core',
      metadata,
    }, operation)
  }

  async run<T>(options: PodCollectionSyncRunOptions, operation: () => T | Promise<T>): Promise<T> {
    return await this.sync.run({
      action: options.action,
      operationId: this.nextOperationId(options.action),
      kind: options.kind ?? 'custom',
      source: options.source,
      target: options.target,
      direction: options.direction,
      plane: options.plane ?? 'projection',
      authority: 'core',
      subject: this.options.queryKey.join('/'),
      metadata: options.metadata,
      task: operation,
    })
  }

  private collectionTarget(): string {
    return `app-collection:${this.options.queryKey.join('/')}`
  }

  private nextOperationId(action: PodCollectionSyncAction): string {
    const timestamp = (this.options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
    return `${this.collectionTarget()}:${action}:${timestamp}:${++this.sequence}`
  }
}

export function createPodCollectionSyncTracker(options: PodCollectionSyncTrackerOptions): PodCollectionSyncTracker {
  return new PodCollectionSyncTracker(options)
}
