import {
  createFallbackWatchSecretaryRecommendation,
  parseWatchGrantCoverageDecision,
  parseWatchSecretaryRecommendation,
  type WatchApprovalRequest,
  type WatchGrantCoverageDecision,
  type WatchInteractionRequest,
  type WatchMode,
  type WatchSecretaryRecommendation,
  type WatchSessionRecord,
} from '@undefineds.co/models/watch'
import { createRemoteCompletionResult } from '../chat-api.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import { resolveRuntimeTarget } from '../runtime-target.js'

export interface WatchSecretaryRecommendationInput {
  mode: WatchMode
  record: WatchSessionRecord
  request: WatchInteractionRequest
}

export interface WatchGrantCoverageInput {
  record?: Partial<WatchSessionRecord>
  request: WatchApprovalRequest | Record<string, unknown>
  requestContext?: Record<string, unknown>
  grant: Record<string, unknown>
}

const SECRETARY_MODEL = DEFAULT_LINX_CLOUD_MODEL_ID
const SECRETARY_TIMEOUT_MS = 15_000

export async function resolveWatchSecretaryRecommendation(
  input: WatchSecretaryRecommendationInput,
): Promise<WatchSecretaryRecommendation | null> {
  if (input.mode === 'manual') {
    return null
  }

  try {
    const session = await getDefaultPodDataSession()
    if (!session) {
      return createFallbackWatchSecretaryRecommendation(input)
    }

    const target = resolveRuntimeTarget({ issuerUrl: session.credentials.url })
    const apiKey = await session.getRuntimeAuthToken()
    const result = await createRemoteCompletionResult({
      runtimeUrl: target.runtimeUrl,
      apiKey,
      model: SECRETARY_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            'You are the LinX AI secretary for tool approvals and structured user-input requests.',
            'Return strict JSON only.',
            'For approvals, choose canAutoDecide=true only when the request is clearly safe, reversible, and sufficiently contextualized.',
            'For approvals, decision must be one of "accept", "decline", or "cancel". Never recommend grant, allow_always, accept_for_session, session approval, or long-term authorization.',
            'LinX derives the reaction window from confidence and caps it at 60 seconds; do not rely on a model-provided reactionWindowMs.',
            'Use canAutoDecide=false when the command is destructive, writes outside the workspace, exposes secrets, changes credentials, installs packages, makes network side effects, or lacks context.',
            'For user-input requests, answer only when the answer can be inferred from the provided context. Do not invent secrets, tokens, paths, or user preferences.',
            'Schema for approval: {"canAutoDecide":boolean,"decision":"accept|decline|cancel","confidence":0..1,"reason":"short"}.',
            'Schema for user-input: {"canAutoDecide":boolean,"answers":{"question_id":{"answers":["value"]}},"confidence":0..1,"reason":"short"}.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(buildSecretaryPayload(input)),
        },
      ],
      signal: AbortSignal.timeout(SECRETARY_TIMEOUT_MS),
    })

    return parseWatchSecretaryRecommendation(result.content, {
      mode: input.mode,
      request: input.request,
    }) ?? createFallbackWatchSecretaryRecommendation(input)
  } catch {
    return createFallbackWatchSecretaryRecommendation(input)
  }
}

export async function resolveWatchGrantCoverage(
  input: WatchGrantCoverageInput,
): Promise<WatchGrantCoverageDecision> {
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
    const apiKey = await session.getRuntimeAuthToken()
    const result = await createRemoteCompletionResult({
      runtimeUrl: target.runtimeUrl,
      apiKey,
      model: SECRETARY_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            'You are the LinX AI secretary evaluating whether an existing delegation grant covers a new approval request.',
            'Return strict JSON only.',
            'A grant is an LLM Wiki page, not a string pattern. Use covers=true only after reading the page body, summary, tags, provenance, and context, and only when the current request clearly fits the documented semantics.',
            'Use covers=false when the request changes from read-only to write/destructive behavior, touches credentials/secrets, installs packages, makes new network side effects, changes workspace boundaries, or the wiki page is ambiguous.',
            'Schema: {"covers":boolean,"confidence":0..1,"reason":"short"}.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(buildGrantCoveragePayload(input)),
        },
      ],
      signal: AbortSignal.timeout(SECRETARY_TIMEOUT_MS),
    })

    return parseWatchGrantCoverageDecision(result.content) ?? {
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

function buildSecretaryPayload(input: WatchSecretaryRecommendationInput): Record<string, unknown> {
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

function hasSemanticGrantPage(grant: Record<string, unknown>): boolean {
  return typeof grant.body === 'string' && grant.body.trim().length > 0
    || typeof grant.policy === 'string' && grant.policy.trim().length > 0
}

function buildGrantCoveragePayload(input: WatchGrantCoverageInput): Record<string, unknown> {
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
    body: grant.body,
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

function summarizeCoverageRequest(request: WatchApprovalRequest | Record<string, unknown>): Record<string, unknown> {
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

function summarizeRequest(request: WatchInteractionRequest): Record<string, unknown> {
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
