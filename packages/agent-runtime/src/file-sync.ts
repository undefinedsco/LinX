import {
  runLinxSyncTask,
  type LinxSyncAuthority,
  type LinxSyncCheckpointStore,
  type LinxSyncContext,
  type LinxSyncDirection,
  type LinxSyncOperationKind,
  type LinxSyncPlane,
  type LinxSyncRunResult,
} from './sync.js'

type MaybePromise<T> = T | Promise<T>

export type FileSyncShape = 'file-to-file' | 'file-to-json-list'
export type FileSyncWriteMode = 'overwrite' | 'append'
export type FileSyncContent = string | Uint8Array
export type FileSyncJsonRecord = Record<string, unknown>

export interface FileSyncArtifactRef {
  uri?: string
  local?: string
  contentType?: string
  etag?: string
  checksum?: string
  offset?: number
  size?: number
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface FileSyncReadResult {
  uri?: string
  local?: string
  content: FileSyncContent
  contentType?: string
  etag?: string
  checksum?: string
  offset?: number
  size?: number
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface FileSyncWriteCondition {
  etag?: string
  offset?: number
}

export interface FileSyncWriteInput {
  source: FileSyncArtifactRef
  target: FileSyncArtifactRef
  content: FileSyncContent
  contentType?: string
  mode: FileSyncWriteMode
  expectedTarget?: FileSyncWriteCondition
  metadata?: Record<string, unknown>
}

export interface FileSyncWriteResult {
  uri?: string
  local?: string
  contentType?: string
  etag?: string
  checksum?: string
  offset?: number
  size?: number
  updatedAt?: string
  bytesWritten?: number
  metadata?: Record<string, unknown>
}

export interface FileSyncTaskContext {
  signal?: AbortSignal
  now: () => Date
  metadata?: Record<string, unknown>
  sync: LinxSyncContext
}

export type FileSyncRead = (
  ref: FileSyncArtifactRef,
  context: FileSyncTaskContext,
) => MaybePromise<FileSyncReadResult>

export type FileSyncWrite = (
  input: FileSyncWriteInput,
  context: FileSyncTaskContext,
) => MaybePromise<FileSyncWriteResult | void>

export interface FileSyncArtifactMaterializedEvent {
  kind: 'artifact.materialized'
  shape: 'file-to-file'
  source: FileSyncArtifactRef
  target: FileSyncArtifactRef
  writeMode: FileSyncWriteMode
  contentType?: string
  bytesRead?: number
  bytesWritten?: number
  emittedAt: string
  metadata?: Record<string, unknown>
}

export interface FileSyncRecordsMaterializedEvent {
  kind: 'records.materialized'
  shape: 'file-to-json-list'
  source: FileSyncArtifactRef
  records: FileSyncJsonRecord[]
  recordCount: number
  contentType?: string
  bytesRead?: number
  emittedAt: string
  metadata?: Record<string, unknown>
}

export type FileSyncMaterializedEvent =
  | FileSyncArtifactMaterializedEvent
  | FileSyncRecordsMaterializedEvent

export interface FileSyncScopeOptions {
  source: string
  target: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  signal?: AbortSignal
  now?: () => Date
  metadata?: Record<string, unknown>
  checkpoint?: LinxSyncCheckpointStore
  checkpointId?: string | ((result: LinxSyncRunResult) => string)
  onEvent?: (event: FileSyncMaterializedEvent, result: LinxSyncRunResult) => MaybePromise<void>
  onResult?: (result: LinxSyncRunResult) => MaybePromise<void>
}

export interface FileSyncTaskOptionsBase<TEvent extends FileSyncMaterializedEvent> {
  action?: string
  operationId?: string
  checkpointId?: string | ((result: LinxSyncRunResult) => string)
  subject?: string | null
  kind?: LinxSyncOperationKind
  source?: string
  target?: string
  direction?: LinxSyncDirection
  plane?: LinxSyncPlane
  authority?: LinxSyncAuthority
  metadata?: Record<string, unknown>
  onEvent?: (event: TEvent, result: LinxSyncRunResult) => MaybePromise<void>
  onResult?: (result: LinxSyncRunResult) => MaybePromise<void>
}

export interface FileToFileSyncTaskOptions extends FileSyncTaskOptionsBase<FileSyncArtifactMaterializedEvent> {
  sourceFile: FileSyncArtifactRef
  targetFile: FileSyncArtifactRef
  read: FileSyncRead
  write: FileSyncWrite
  writeMode?: FileSyncWriteMode
  expectedTarget?: FileSyncWriteCondition
  requireAppendCondition?: boolean
}

export interface FileToJsonListSyncTaskOptions extends FileSyncTaskOptionsBase<FileSyncRecordsMaterializedEvent> {
  sourceFile: FileSyncArtifactRef
  read: FileSyncRead
  parse?: FileSyncJsonListParser
  parseOptions?: FileSyncJsonListParseOptions
}

export interface FileSyncJsonListParseOptions {
  format?: 'auto' | 'json' | 'jsonl'
  allowSingleRecord?: boolean
}

export type FileSyncJsonListParser = (
  content: FileSyncContent,
  options?: FileSyncJsonListParseOptions,
) => FileSyncJsonRecord[]

export class FileSyncScope {
  private readonly results: LinxSyncRunResult[] = []
  private sequence = 0

  constructor(private readonly options: FileSyncScopeOptions) {}

  getResults(): LinxSyncRunResult[] {
    return [...this.results]
  }

  getLastResult(): LinxSyncRunResult | null {
    return this.results.length > 0 ? this.results[this.results.length - 1] : null
  }

  async fileToFile(options: FileToFileSyncTaskOptions): Promise<FileSyncArtifactMaterializedEvent> {
    const action = options.action ?? defaultFileToFileAction(options.writeMode)
    const writeMode = options.writeMode ?? 'overwrite'
    const initialMetadata = createFileSyncMetadata({
      action,
      shape: 'file-to-file',
      source: options.sourceFile,
      target: options.targetFile,
      writeMode,
      metadata: {
        ...this.options.metadata,
        ...options.metadata,
      },
    })

    const operationId = options.operationId ?? this.nextOperationId(action, options.subject ?? options.targetFile.local ?? options.targetFile.uri)
    const run = await runLinxSyncTask<FileSyncArtifactMaterializedEvent>({
      operationId,
      kind: options.kind ?? (writeMode === 'append' ? 'update' : 'upsert'),
      description: action,
      source: options.source ?? this.options.source,
      target: options.target ?? this.options.target,
      direction: options.direction ?? this.options.direction ?? 'local-to-core',
      plane: options.plane ?? this.options.plane ?? 'projection',
      authority: options.authority ?? this.options.authority ?? 'core',
      signal: this.options.signal,
      now: this.options.now,
      checkpoint: this.options.checkpoint,
      checkpointId: options.checkpointId ?? this.options.checkpointId ?? operationId,
      initialMetadata,
      metadata: (event) => ({
        ...initialMetadata,
        bytesRead: event.bytesRead,
        bytesWritten: event.bytesWritten,
        contentType: event.contentType,
      }),
      onResult: async (result) => {
        this.results.push(result)
        await this.options.onResult?.(result)
        await options.onResult?.(result)
      },
      task: async (syncContext) => {
        if (writeMode === 'append' && options.requireAppendCondition && !hasWriteCondition(options.expectedTarget)) {
          throw new Error('Append file sync requires an expected target etag or offset.')
        }

        const context = createFileSyncTaskContext(syncContext)
        const readResult = await options.read(options.sourceFile, context)
        const contentType = readResult.contentType ?? options.sourceFile.contentType ?? options.targetFile.contentType
        const bytesRead = contentByteLength(readResult.content)
        const rawWriteResult = await options.write({
          source: mergeArtifactRef(options.sourceFile, readResult),
          target: options.targetFile,
          content: readResult.content,
          contentType,
          mode: writeMode,
          expectedTarget: options.expectedTarget,
          metadata: {
            ...readResult.metadata,
            ...options.metadata,
          },
        }, context)
        const writeResult = normalizeFileSyncWriteResult(rawWriteResult)
        const target = mergeArtifactRef(options.targetFile, writeResult)
        const event: FileSyncArtifactMaterializedEvent = {
          kind: 'artifact.materialized',
          shape: 'file-to-file',
          source: mergeArtifactRef(options.sourceFile, readResult),
          target,
          writeMode,
          contentType: writeResult?.contentType ?? contentType,
          bytesRead,
          bytesWritten: writeResult?.bytesWritten ?? bytesRead,
          emittedAt: context.now().toISOString(),
          metadata: compactMetadata({
            ...this.options.metadata,
            ...options.metadata,
            ...readResult.metadata,
            ...writeResult?.metadata,
          }),
        }
        return event
      },
    })

    await this.options.onEvent?.(run.value, run.result)
    await options.onEvent?.(run.value, run.result)
    return run.value
  }

  async fileToJsonList(options: FileToJsonListSyncTaskOptions): Promise<FileSyncRecordsMaterializedEvent> {
    const action = options.action ?? 'file.records.materialize'
    const initialMetadata = createFileSyncMetadata({
      action,
      shape: 'file-to-json-list',
      source: options.sourceFile,
      metadata: {
        ...this.options.metadata,
        ...options.metadata,
      },
    })

    const operationId = options.operationId ?? this.nextOperationId(action, options.subject ?? options.sourceFile.local ?? options.sourceFile.uri)
    const run = await runLinxSyncTask<FileSyncRecordsMaterializedEvent>({
      operationId,
      kind: options.kind ?? 'upsert',
      description: action,
      source: options.source ?? this.options.source,
      target: options.target ?? this.options.target,
      direction: options.direction ?? this.options.direction ?? 'core-to-local',
      plane: options.plane ?? this.options.plane ?? 'projection',
      authority: options.authority ?? this.options.authority ?? 'core',
      signal: this.options.signal,
      now: this.options.now,
      checkpoint: this.options.checkpoint,
      checkpointId: options.checkpointId ?? this.options.checkpointId ?? operationId,
      initialMetadata,
      metadata: (event) => ({
        ...initialMetadata,
        bytesRead: event.bytesRead,
        contentType: event.contentType,
        recordCount: event.recordCount,
      }),
      onResult: async (result) => {
        this.results.push(result)
        await this.options.onResult?.(result)
        await options.onResult?.(result)
      },
      task: async (syncContext) => {
        const context = createFileSyncTaskContext(syncContext)
        const readResult = await options.read(options.sourceFile, context)
        const parser = options.parse ?? parseFileSyncJsonList
        const records = parser(readResult.content, options.parseOptions)
        const event: FileSyncRecordsMaterializedEvent = {
          kind: 'records.materialized',
          shape: 'file-to-json-list',
          source: mergeArtifactRef(options.sourceFile, readResult),
          records,
          recordCount: records.length,
          contentType: readResult.contentType ?? options.sourceFile.contentType,
          bytesRead: contentByteLength(readResult.content),
          emittedAt: context.now().toISOString(),
          metadata: compactMetadata({
            ...this.options.metadata,
            ...options.metadata,
            ...readResult.metadata,
          }),
        }
        return event
      },
    })

    await this.options.onEvent?.(run.value, run.result)
    await options.onEvent?.(run.value, run.result)
    return run.value
  }

  private nextOperationId(action: string, subject?: string | null): string {
    const timestamp = (this.options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
    return `${this.options.source}:${action}:${normalizeOperationSegment(subject ?? 'file')}:${timestamp}:${++this.sequence}`
  }
}

export function createFileSyncScope(options: FileSyncScopeOptions): FileSyncScope {
  return new FileSyncScope(options)
}

export function parseFileSyncJsonList(
  content: FileSyncContent,
  options: FileSyncJsonListParseOptions = {},
): FileSyncJsonRecord[] {
  const format = options.format ?? 'auto'
  const text = contentToText(content).trim()
  if (!text) {
    return []
  }

  if (format === 'jsonl') {
    return parseJsonLines(text)
  }

  if (format === 'json') {
    return normalizeJsonList(JSON.parse(text), options)
  }

  try {
    return normalizeJsonList(JSON.parse(text), options)
  } catch (error) {
    if (!looksLikeJsonLines(text)) {
      throw error
    }
    return parseJsonLines(text)
  }
}

export function createFileSyncMetadata(input: {
  action: string
  shape: FileSyncShape
  source?: FileSyncArtifactRef | null
  target?: FileSyncArtifactRef | null
  writeMode?: FileSyncWriteMode
  metadata?: Record<string, unknown> | null
}): Record<string, unknown> {
  return compactMetadata({
    action: input.action,
    shape: input.shape,
    artifacts: compactMetadata({
      source: compactArtifactMetadataRef(input.source),
      target: compactArtifactMetadataRef(input.target),
    }),
    contentType: input.source?.contentType ?? input.target?.contentType,
    writeMode: input.writeMode,
    ...input.metadata,
  })
}

function compactArtifactMetadataRef(ref: FileSyncArtifactRef | null | undefined): FileSyncArtifactRef | undefined {
  if (!ref) {
    return undefined
  }

  const compacted = compactMetadata({
    uri: ref.uri,
    local: ref.local,
    contentType: ref.contentType,
    etag: ref.etag,
    checksum: ref.checksum,
    offset: ref.offset,
    size: ref.size,
    updatedAt: ref.updatedAt,
    metadata: ref.metadata,
  }) as FileSyncArtifactRef

  return Object.keys(compacted).length > 0 ? compacted : undefined
}

function createFileSyncTaskContext(sync: LinxSyncContext): FileSyncTaskContext {
  return {
    signal: sync.signal,
    now: sync.now,
    metadata: sync.metadata,
    sync,
  }
}

function mergeArtifactRef(
  base: FileSyncArtifactRef,
  patch: Partial<FileSyncArtifactRef> | FileSyncReadResult | FileSyncWriteResult | void,
): FileSyncArtifactRef {
  if (!patch) {
    return { ...base }
  }

  return compactArtifactRef({
    ...base,
    uri: patch.uri ?? base.uri,
    local: patch.local ?? base.local,
    contentType: patch.contentType ?? base.contentType,
    etag: patch.etag ?? base.etag,
    checksum: patch.checksum ?? base.checksum,
    offset: patch.offset ?? base.offset,
    size: patch.size ?? base.size,
    updatedAt: patch.updatedAt ?? base.updatedAt,
    metadata: compactMetadata({
      ...base.metadata,
      ...patch.metadata,
    }),
  })
}

function compactArtifactRef(ref: FileSyncArtifactRef): FileSyncArtifactRef {
  return compactMetadata(ref as Record<string, unknown>) as FileSyncArtifactRef
}

function compactMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      output[key] = value
    }
  }
  return output
}

function contentByteLength(content: FileSyncContent): number {
  return typeof content === 'string'
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength
}

function contentToText(content: FileSyncContent): string {
  return typeof content === 'string'
    ? content
    : new TextDecoder().decode(content)
}

function parseJsonLines(text: string): FileSyncJsonRecord[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizeJsonRecord(JSON.parse(line)))
}

function normalizeJsonList(value: unknown, options: FileSyncJsonListParseOptions): FileSyncJsonRecord[] {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonRecord)
  }

  if (options.allowSingleRecord !== false) {
    return [normalizeJsonRecord(value)]
  }

  throw new Error('Expected a JSON array of records.')
}

function normalizeJsonRecord(value: unknown): FileSyncJsonRecord {
  if (!isJsonRecord(value)) {
    throw new Error('Expected JSON records to be objects.')
  }
  return value
}

function isJsonRecord(value: unknown): value is FileSyncJsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function looksLikeJsonLines(text: string): boolean {
  return /\r?\n/.test(text)
}

function hasWriteCondition(value: FileSyncWriteCondition | undefined): boolean {
  return Boolean(value?.etag) || typeof value?.offset === 'number'
}

function normalizeFileSyncWriteResult(value: FileSyncWriteResult | void): FileSyncWriteResult | undefined {
  return typeof value === 'object' && value !== null ? value : undefined
}

function defaultFileToFileAction(writeMode: FileSyncWriteMode | undefined): string {
  return writeMode === 'append' ? 'file.append' : 'file.copy'
}

function normalizeOperationSegment(value: string): string {
  return value.replace(/[:\s]+/g, '-')
}
