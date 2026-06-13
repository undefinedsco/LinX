import {
  createFallbackAutoModeSecretaryRecommendation,
  parseAutoModeGrantCoverageDecision,
  parseAutoModeSecretaryRecommendation,
  type AutoModeApprovalRequest,
  type AutoModeGrantCoverageDecision,
  type AutoModeInteractionRequest,
  type LegacyAutoModeMode,
  type AutoModeSecretaryRecommendation,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import {
  createAgentRuntime,
  resolveAgentRuntimeConfig,
  type AgentRuntimeBackendConfig,
  type AgentRuntimeConfig,
} from '@linx/agent-runtime'
import { createRemoteCompletionResult } from '../chat-api.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import { resolveRuntimeTarget } from '../runtime-target.js'

export interface AutoModeSecretaryRecommendationInput {
  mode: LegacyAutoModeMode
  record: AutoModeSessionRecord
  request: AutoModeInteractionRequest
}

export interface AutoModeGrantCoverageInput {
  record?: Partial<AutoModeSessionRecord>
  request: AutoModeApprovalRequest | Record<string, unknown>
  requestContext?: Record<string, unknown>
  grant: Record<string, unknown>
}

const DEFAULT_SECRETARY_RUNTIME_BACKEND: AgentRuntimeBackendConfig = {
  backend: 'linx',
  model: DEFAULT_LINX_CLOUD_MODEL_ID,
  credentialSource: 'cloud',
}
const SECRETARY_TIMEOUT_MS = 15_000

export async function resolveAutoModeSecretaryRecommendation(
  input: AutoModeSecretaryRecommendationInput,
): Promise<AutoModeSecretaryRecommendation | null> {
  if (input.record.autoEnabled !== true) {
    return null
  }

  try {
    const session = await getDefaultPodDataSession()
    if (!session) {
      return createFallbackAutoModeSecretaryRecommendation({
        mode: input.mode,
        autoEnabled: input.record.autoEnabled,
        request: input.request,
      })
    }

    const target = resolveRuntimeTarget({ issuerUrl: session.credentials.url })
    const payload = JSON.stringify(buildSecretaryPayload(input))
    const agentConfig = createSecretaryAgentRuntimeConfig({
      systemPrompt: buildSecretaryRecommendationSystemPrompt(),
      metadata: {
        mode: input.mode,
        backend: input.record.backend,
        cwd: input.record.cwd,
      },
      overrides: resolveSecretaryRuntimeOverrides(input.record),
    })
    const runtime = createAgentRuntime(agentConfig, async ({ agent, messages, signal }) => {
      const result = await completeWithSecretaryRuntime(session, target.runtimeUrl, agent, messages, signal)
      return {
        content: result.content,
        reasoningContent: result.reasoningContent,
        finishReason: result.finishReason,
        usage: result.usage ? { ...result.usage } : undefined,
        raw: result,
      }
    })
    const result = await runtime.runTurn({
      input: payload,
      messages: [
        {
          role: 'user',
          source: 'user',
          content: payload,
          metadata: {
            mode: input.mode,
            backend: input.record.backend,
            cwd: input.record.cwd,
          },
        },
      ],
      signal: AbortSignal.timeout(SECRETARY_TIMEOUT_MS),
      metadata: {
        requestKind: input.request.kind,
      },
    })

    return parseAutoModeSecretaryRecommendation(result.content, {
      mode: input.mode,
      autoEnabled: input.record.autoEnabled,
      request: input.request,
    }) ?? createFallbackAutoModeSecretaryRecommendation({
      mode: input.mode,
      autoEnabled: input.record.autoEnabled,
      request: input.request,
    })
  } catch {
    return createFallbackAutoModeSecretaryRecommendation({
      mode: input.mode,
      autoEnabled: input.record.autoEnabled,
      request: input.request,
    })
  }
}

export async function resolveAutoModeGrantCoverage(
  input: AutoModeGrantCoverageInput,
): Promise<AutoModeGrantCoverageDecision> {
  if (!hasSemanticGrantPage(input.grant)) {
    return {
      covers: false,
      reason: 'Grant has no semantic wiki page.',
      source: 'fallback',
    }
  }

  try {
    const session = await getDefaultPodDataSession()
    if (!session) {
      return {
        covers: false,
        reason: 'AI secretary is unavailable for semantic grant evaluation.',
        source: 'fallback',
      }
    }

    const target = resolveRuntimeTarget({ issuerUrl: session.credentials.url })
    const payload = JSON.stringify(buildGrantCoveragePayload(input))
    const agentConfig = createSecretaryAgentRuntimeConfig({
      systemPrompt: buildGrantCoverageSystemPrompt(),
      metadata: {
        backend: input.record?.backend,
        cwd: input.record?.cwd,
      },
      overrides: resolveSecretaryRuntimeOverrides(input.record),
    })
    const runtime = createAgentRuntime(agentConfig, async ({ agent, messages, signal }) => {
      const result = await completeWithSecretaryRuntime(session, target.runtimeUrl, agent, messages, signal)
      return {
        content: result.content,
        reasoningContent: result.reasoningContent,
        finishReason: result.finishReason,
        usage: result.usage ? { ...result.usage } : undefined,
        raw: result,
      }
    })
    const result = await runtime.runTurn({
      input: payload,
      messages: [
        {
          role: 'user',
          source: 'user',
          content: payload,
          metadata: {
            backend: input.record?.backend,
            cwd: input.record?.cwd,
          },
        },
      ],
      signal: AbortSignal.timeout(SECRETARY_TIMEOUT_MS),
      metadata: {
        requestKind: 'grant.coverage.check',
      },
    })

    return parseAutoModeGrantCoverageDecision(result.content) ?? {
      covers: false,
      reason: 'AI secretary returned an invalid grant coverage decision.',
      source: 'fallback',
    }
  } catch {
    return {
      covers: false,
      reason: 'AI secretary failed during semantic grant evaluation.',
      source: 'fallback',
    }
  }
}

function createSecretaryAgentRuntimeConfig(input: {
  systemPrompt: string
  metadata?: Record<string, unknown>
  overrides?: { model?: string; runtime?: Partial<AgentRuntimeBackendConfig> }
}): AgentRuntimeConfig {
  return resolveAgentRuntimeConfig(
    {
      agent: '__secretary__',
      role: 'secretary',
      model: DEFAULT_LINX_CLOUD_MODEL_ID,
      label: 'AI Secretary',
      runtime: DEFAULT_SECRETARY_RUNTIME_BACKEND,
      systemPrompt: input.systemPrompt,
      metadata: input.metadata,
    },
    input.overrides,
  )
}

async function completeWithSecretaryRuntime(
  session: Awaited<ReturnType<typeof getDefaultPodDataSession>>,
  runtimeUrl: string,
  agent: AgentRuntimeConfig,
  messages: Parameters<typeof createRemoteCompletionResult>[0]['messages'],
  signal?: AbortSignal,
) {
  if (!session) {
    throw new Error('AI secretary is unavailable without a Pod data session.')
  }
  const backend = normalizeString(agent.runtime?.backend) ?? 'linx'
  if (backend !== 'linx') {
    throw new Error(`AI secretary runtime backend ${backend} is not supported yet.`)
  }
  return createRemoteCompletionResult({
    runtimeUrl,
    authFetch: session.runtimeFetch,
    model: normalizeString(agent.runtime?.model) ?? agent.model,
    messages,
    signal,
  })
}

function resolveSecretaryRuntimeOverrides(record?: Partial<AutoModeSessionRecord>): {
  model?: string
  runtime?: Partial<AgentRuntimeBackendConfig>
} | undefined {
  const metadata = record?.metadata
  const candidates = [
    isRecord(metadata?.agentRuntime) ? metadata.agentRuntime : undefined,
    isRecord(metadata?.symphony) && isRecord(metadata.symphony.agentRuntime)
      ? metadata.symphony.agentRuntime
      : undefined,
  ]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    const runtime = normalizeAgentRuntimeBackendConfig(candidate)
    if (runtime) {
      return {
        ...(runtime.model ? { model: runtime.model } : {}),
        runtime,
      }
    }
  }
  return undefined
}

function normalizeAgentRuntimeBackendConfig(value: Record<string, unknown>): Partial<AgentRuntimeBackendConfig> | undefined {
  const backend = normalizeString(value.backend)
  const model = normalizeString(value.model)
  const credentialSource = normalizeString(value.credentialSource)
  const runtime = normalizeString(value.runtime)
  const transport = normalizeString(value.transport)
  const endpoint = normalizeString(value.endpoint)
  const metadata = isRecord(value.metadata) ? { ...value.metadata } : undefined
  const resolved: Partial<AgentRuntimeBackendConfig> = {
    ...(backend ? { backend } : {}),
    ...(model ? { model } : {}),
    ...(credentialSource ? { credentialSource } : {}),
    ...(runtime ? { runtime } : {}),
    ...(transport ? { transport } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(metadata ? { metadata } : {}),
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

function buildSecretaryPayload(input: AutoModeSecretaryRecommendationInput): Record<string, unknown> {
  return {
    mode: input.mode,
    session: {
      id: input.record.id,
      backend: input.record.backend,
      cwd: input.record.cwd,
      model: input.record.model,
      credentialSource: input.record.resolvedCredentialSource ?? input.record.credentialSource,
      approvalSource: input.record.approvalSource,
    },
    request: summarizeRequest(input.request),
  }
}

function buildSecretaryRecommendationSystemPrompt(): string {
  return [
    'You are the LinX AI secretary for tool approvals and structured user-input requests.',
    'Return strict JSON only.',
    'For approvals, choose canAutoDecide=true only when the request is clearly safe, reversible, and sufficiently contextualized.',
    'For approvals, decision must be one of "accept", "decline", or "cancel". Never recommend grant, allow_always, accept_for_session, session approval, or long-term authorization.',
    'LinX derives the reaction window from confidence and caps it at 60 seconds; do not rely on a model-provided reactionWindowMs.',
    'Use canAutoDecide=false when the command is destructive, writes outside the workspace, exposes secrets, changes credentials, installs packages, makes network side effects, or lacks context.',
    'For user-input requests, answer only when the answer can be inferred from the provided context. Do not invent secrets, tokens, paths, or user preferences.',
    'Schema for approval: {"canAutoDecide":boolean,"decision":"accept|decline|cancel","confidence":0..1,"reason":"short"}.',
    'Schema for user-input: {"canAutoDecide":boolean,"answers":{"question_id":{"answers":["value"]}},"confidence":0..1,"reason":"short"}.',
  ].join(' ')
}

function buildGrantCoverageSystemPrompt(): string {
  return [
    'You are the LinX AI secretary evaluating whether an existing delegation grant covers a new approval request.',
    'Return strict JSON only.',
    'A grant is an LLM Wiki page, not a string pattern. Use covers=true only after reading the page body, summary, tags, provenance, and context, and only when the current request clearly fits the documented semantics.',
    'Use covers=false when the request changes from read-only to write/destructive behavior, touches credentials/secrets, installs packages, makes new network side effects, changes workspace boundaries, or the wiki page is ambiguous.',
    'Schema: {"covers":boolean,"confidence":0..1,"reason":"short"}.',
  ].join(' ')
}

function hasSemanticGrantPage(grant: Record<string, unknown>): boolean {
  return typeof grant.description === 'string' && grant.description.trim().length > 0
    || typeof grant.policy === 'string' && grant.policy.trim().length > 0
}

function buildGrantCoveragePayload(input: AutoModeGrantCoverageInput): Record<string, unknown> {
  return {
    session: input.record ? {
      id: input.record.id,
      backend: input.record.backend,
      cwd: input.record.cwd,
      model: input.record.model,
      credentialSource: input.record.resolvedCredentialSource ?? input.record.credentialSource,
      approvalSource: input.record.approvalSource,
    } : undefined,
    grant: summarizeGrant(input.grant),
    currentRequest: summarizeCoverageRequest(input.request),
    requestContext: input.requestContext,
  }
}

function summarizeGrant(grant: Record<string, unknown>): Record<string, unknown> {
  return {
    target: grant.target,
    action: grant.action,
    title: grant.title,
    summary: grant.summary,
    description: grant.description,
    schema: grant.schema,
    pageKind: grant.pageKind,
    wikiStatus: grant.wikiStatus,
    tags: parseJsonString(grant.tags) ?? grant.tags,
    source: grant.source,
    sourceHash: grant.sourceHash,
    compiledAt: grant.compiledAt,
    compiledFrom: grant.compiledFrom,
    related: grant.related,
    effect: grant.effect,
    riskCeiling: grant.riskCeiling,
    policy: grant.policy,
    context: parseJsonString(grant.context) ?? grant.context,
    decisionRole: grant.decisionRole,
    createdAt: grant.createdAt,
  }
}

function summarizeCoverageRequest(request: AutoModeApprovalRequest | Record<string, unknown>): Record<string, unknown> {
  if ('kind' in request && request.kind === 'command-approval') {
    return {
      kind: request.kind,
      message: request.message,
      command: request.command,
      cwd: request.cwd,
      approvalOptions: request.approvalOptions,
      expiresAt: request.expiresAt,
    }
  }

  if ('kind' in request && request.kind === 'permissions-approval') {
    return {
      kind: request.kind,
      message: request.message,
      permissions: request.permissions,
      approvalOptions: request.approvalOptions,
      expiresAt: request.expiresAt,
    }
  }

  return { ...request }
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function summarizeRequest(request: AutoModeInteractionRequest): Record<string, unknown> {
  if (request.kind === 'user-input') {
    return {
      kind: request.kind,
      message: request.message,
      questions: request.questions.map((question) => ({
        id: question.id,
        header: question.header,
        question: question.question,
        options: question.options,
      })),
    }
  }

  if (request.kind === 'command-approval') {
    return {
      kind: request.kind,
      message: request.message,
      command: request.command,
      cwd: request.cwd,
      approvalOptions: request.approvalOptions,
      expiresAt: request.expiresAt,
    }
  }

  if (request.kind === 'permissions-approval') {
    return {
      kind: request.kind,
      message: request.message,
      permissions: request.permissions,
      approvalOptions: request.approvalOptions,
      expiresAt: request.expiresAt,
    }
  }

  return {
    kind: request.kind,
    message: request.message,
    approvalOptions: request.approvalOptions,
    expiresAt: request.expiresAt,
  }
}

export const __autoModeSecretaryInternal = {
  createSecretaryAgentRuntimeConfig,
  resolveSecretaryRuntimeOverrides,
  normalizeAgentRuntimeBackendConfig,
}
