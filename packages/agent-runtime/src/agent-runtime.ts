import type { AgentParticipantRole, AgentTurnTrigger } from './turn-controller.js'

type MaybePromise<T> = T | Promise<T>

export type AgentRuntimeTurnStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type AgentRuntimeMessageRole = 'system' | 'user' | 'assistant' | 'tool'
export type AgentRuntimeMessageSource = 'user' | 'primary-agent' | 'secretary' | 'tool' | 'system'

export interface AgentRuntimeMessage {
  role: AgentRuntimeMessageRole
  content: string
  source?: AgentRuntimeMessageSource
  createdAt?: string
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeBackendConfig {
  backend?: string
  model?: string
  credentialSource?: string
  runtime?: string
  transport?: string
  endpoint?: string
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeSkillSnapshot {
  id: string
  name?: string
  version?: string
  source?: string
  checksum?: string
  loadPolicy?: string
  enabled?: boolean
}

export interface AgentRuntimeConfig {
  agent: string
  role: AgentParticipantRole
  model: string
  label?: string
  runtime?: AgentRuntimeBackendConfig
  skills?: AgentRuntimeSkillSnapshot[]
  authorityPolicy?: Record<string, unknown>
  toolPolicy?: Record<string, unknown>
  systemPrompt?: string
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeConfigOverrides {
  model?: string
  runtime?: Partial<AgentRuntimeBackendConfig>
  skills?: AgentRuntimeSkillSnapshot[]
  authorityPolicy?: Record<string, unknown>
  toolPolicy?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeConfigSnapshot {
  agent: string
  role: AgentParticipantRole
  model: string
  label?: string
  runtime?: AgentRuntimeBackendConfig
  credentialSource?: string
  skills?: AgentRuntimeSkillSnapshot[]
  authorityPolicy?: Record<string, unknown>
  toolPolicy?: Record<string, unknown>
  metadata?: Record<string, unknown>
  source?: string
  createdAt: string
}

export interface AgentRuntimeCompletionRequest {
  agent: AgentRuntimeConfig
  model: string
  messages: AgentRuntimeMessage[]
  signal?: AbortSignal
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeCompletionResult {
  content: string
  reasoningContent?: string
  finishReason?: string | null
  usage?: Record<string, unknown>
  raw?: unknown
}

export type AgentRuntimeComplete = (request: AgentRuntimeCompletionRequest) => MaybePromise<AgentRuntimeCompletionResult>

export interface AgentRuntimeRunRecord {
  id: string
  agent: string
  role: AgentParticipantRole
  model: string
  runtime?: AgentRuntimeBackendConfig
  trigger?: AgentTurnTrigger | string
  input?: string
  status: AgentRuntimeTurnStatus
  output?: string
  error?: string
  startedAt: string
  completedAt?: string
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeRunStepRecord {
  id: string
  run: string
  stepType: string
  message?: string
  data?: Record<string, unknown>
  createdAt: string
}

export interface AgentRuntimeTurnInput {
  trigger?: AgentTurnTrigger | string
  input?: string
  messages: AgentRuntimeMessage[]
  signal?: AbortSignal
  metadata?: Record<string, unknown>
  now?: () => Date
  randomId?: string
}

export interface AgentRuntimeTurnResult {
  run: AgentRuntimeRunRecord
  steps: AgentRuntimeRunStepRecord[]
  content: string
  reasoningContent?: string
  finishReason?: string | null
  usage?: Record<string, unknown>
  raw?: unknown
}

export interface AgentRuntime {
  readonly config: AgentRuntimeConfig
  runTurn(input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurnResult>
}

export class AgentRuntimeTurnError extends Error {
  constructor(
    message: string,
    readonly run: AgentRuntimeRunRecord,
    readonly steps: AgentRuntimeRunStepRecord[],
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AgentRuntimeTurnError'
  }
}

export function createAgentRuntime(config: AgentRuntimeConfig, complete: AgentRuntimeComplete): AgentRuntime {
  return new ConfiguredAgentRuntime(config, complete)
}

export function resolveAgentRuntimeConfig(
  defaults: AgentRuntimeConfig,
  overrides: AgentRuntimeConfigOverrides = {},
): AgentRuntimeConfig {
  const runtime = resolveAgentRuntimeBackendConfig(defaults.runtime, overrides.runtime, overrides.model)
  const model = normalizeRuntimeConfigString(overrides.model)
    ?? normalizeRuntimeConfigString(overrides.runtime?.model)
    ?? normalizeRuntimeConfigString(runtime?.model)
    ?? defaults.model
  return {
    ...defaults,
    model,
    ...(runtime ? { runtime: { ...runtime, model } } : {}),
    ...(overrides.skills ? { skills: cloneSkillSnapshots(overrides.skills) } : {}),
    ...(overrides.authorityPolicy ? { authorityPolicy: { ...overrides.authorityPolicy } } : {}),
    ...(overrides.toolPolicy ? { toolPolicy: { ...overrides.toolPolicy } } : {}),
    metadata: mergeRuntimeMetadata(defaults.metadata, overrides.metadata),
  }
}

export function createAgentRuntimeConfigSnapshot(
  config: AgentRuntimeConfig,
  input: { createdAt?: string | Date; source?: string } = {},
): AgentRuntimeConfigSnapshot {
  const createdAt = input.createdAt instanceof Date
    ? input.createdAt.toISOString()
    : typeof input.createdAt === 'string' && input.createdAt.trim().length > 0
      ? input.createdAt
      : new Date().toISOString()

  return omitUndefined({
    agent: config.agent,
    role: config.role,
    model: config.model,
    label: config.label,
    runtime: config.runtime ? { ...config.runtime } : undefined,
    credentialSource: config.runtime?.credentialSource,
    skills: config.skills ? cloneSkillSnapshots(config.skills) : undefined,
    authorityPolicy: config.authorityPolicy ? { ...config.authorityPolicy } : undefined,
    toolPolicy: config.toolPolicy ? { ...config.toolPolicy } : undefined,
    metadata: config.metadata ? { ...config.metadata } : undefined,
    source: input.source,
    createdAt,
  }) as AgentRuntimeConfigSnapshot
}

class ConfiguredAgentRuntime implements AgentRuntime {
  constructor(
    readonly config: AgentRuntimeConfig,
    private readonly complete: AgentRuntimeComplete,
  ) {}

  async runTurn(input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurnResult> {
    const now = input.now ?? (() => new Date())
    const run = createRunRecord(this.config, input, now)
    const steps: AgentRuntimeRunStepRecord[] = []
    const nextStep = createStepFactory(run.id, now)
    steps.push(nextStep('run.created', 'Runtime turn created', {
      agent: this.config.agent,
      role: this.config.role,
      model: this.config.model,
      runtime: this.config.runtime,
      runtimeSnapshot: run.metadata?.runtimeSnapshot,
      trigger: input.trigger,
    }))

    const messages = buildRuntimeMessages(this.config, input.messages)
    steps.push(nextStep('runtime.input.prepared', 'Runtime input prepared', {
      messageCount: messages.length,
      input: input.input,
    }))

    try {
      const result = await this.complete({
        agent: this.config,
        model: this.config.model,
        messages,
        signal: input.signal,
        metadata: {
          ...(this.config.runtime ? { runtime: this.config.runtime } : {}),
          ...this.config.metadata,
          ...input.metadata,
        },
      })
      const completedAt = now().toISOString()
      const content = result.content ?? ''
      run.status = 'completed'
      run.output = content
      run.completedAt = completedAt
      steps.push(nextStep('runtime.output.completed', 'Runtime output completed', {
        finishReason: result.finishReason,
        outputLength: content.length,
        usage: result.usage,
      }))

      return {
        run,
        steps,
        content,
        reasoningContent: result.reasoningContent,
        finishReason: result.finishReason,
        usage: result.usage,
        raw: result.raw,
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const completedAt = now().toISOString()
      run.status = 'failed'
      run.error = message
      run.completedAt = completedAt
      steps.push(nextStep('runtime.error', message, {
        error: message,
      }))
      throw new AgentRuntimeTurnError(message, run, steps, cause)
    }
  }
}

function buildRuntimeMessages(config: AgentRuntimeConfig, messages: AgentRuntimeMessage[]): AgentRuntimeMessage[] {
  const systemPrompt = config.systemPrompt?.trim()
  if (!systemPrompt) {
    return messages
  }

  return [
    {
      role: 'system',
      source: 'system',
      content: systemPrompt,
    },
    ...messages,
  ]
}

function createRunRecord(
  config: AgentRuntimeConfig,
  input: AgentRuntimeTurnInput,
  now: () => Date,
): AgentRuntimeRunRecord {
  const startedAt = now().toISOString()
  const runtimeSnapshot = createAgentRuntimeConfigSnapshot(config, {
    createdAt: startedAt,
    source: 'agent-runtime.run',
  })
  return {
    id: createRuntimeRecordId('run', input.randomId),
    agent: config.agent,
    role: config.role,
    model: config.model,
    ...(config.runtime ? { runtime: config.runtime } : {}),
    trigger: input.trigger,
    input: input.input,
    status: 'running',
    startedAt,
    metadata: {
      ...(config.runtime ? { runtime: config.runtime } : {}),
      ...config.metadata,
      ...input.metadata,
      ...(config.label ? { label: config.label } : {}),
      runtimeSnapshot,
    },
  }
}

function resolveAgentRuntimeBackendConfig(
  defaults?: AgentRuntimeBackendConfig,
  overrides?: Partial<AgentRuntimeBackendConfig>,
  modelOverride?: string,
): AgentRuntimeBackendConfig | undefined {
  if (!defaults && !overrides && !modelOverride) {
    return undefined
  }

  const metadata = mergeRuntimeMetadata(defaults?.metadata, overrides?.metadata)
  return {
    ...defaults,
    ...overrides,
    ...(normalizeRuntimeConfigString(modelOverride) ? { model: normalizeRuntimeConfigString(modelOverride) } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function mergeRuntimeMetadata(
  defaults?: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!defaults && !overrides) {
    return undefined
  }
  return {
    ...defaults,
    ...overrides,
  }
}

function cloneSkillSnapshots(skills: AgentRuntimeSkillSnapshot[]): AgentRuntimeSkillSnapshot[] {
  return skills.map((skill) => ({ ...skill }))
}

function omitUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>
}

function normalizeRuntimeConfigString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function createStepFactory(run: string, now: () => Date): (
  stepType: string,
  message?: string,
  data?: Record<string, unknown>,
) => AgentRuntimeRunStepRecord {
  let sequence = 0
  return (stepType, message, data) => {
    sequence += 1
    return {
      id: `${run}-step-${String(sequence).padStart(4, '0')}`,
      run,
      stepType,
      ...(message ? { message } : {}),
      ...(data ? { data } : {}),
      createdAt: now().toISOString(),
    }
  }
}

function createRuntimeRecordId(prefix: string, randomId?: string): string {
  const suffix = randomId?.trim()
    || globalThis.crypto?.randomUUID?.()
    || Math.random().toString(36).slice(2, 10).padEnd(8, '0')
  return `${prefix}_${suffix}`
}
