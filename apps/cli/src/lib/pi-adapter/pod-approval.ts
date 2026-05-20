import type { BeforeToolCallContext, BeforeToolCallResult } from '@mariozechner/pi-agent-core'
import type { AgentSession } from '@mariozechner/pi-coding-agent'
import { linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import {
  createFallbackAutoModeSecretaryRecommendation,
  isTrustedAutoModeCommand,
  resolveAutoModeAutoApprovalDecision,
  autoModeApprovalActionUri,
  autoModeApprovalRequestMessage,
  autoModeApprovalRisk,
  autoModeApprovalToolName,
  type AutoModeApprovalDecision,
  type AutoModeApprovalRequest,
  type AutoModeMode,
  type AutoModeSecretaryApprovalRecommendation,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import {
  createRemoteApproval,
  requestRemoteApproval,
  resolveRemoteAutoModeApproval,
  type RemoteApprovalRequestDetails,
  type RemoteApprovalSubjectContext,
  type AutoModeRemoteApprovalRuntime,
} from '../auto-mode/pod-approval.js'
import { resolveAutoModeSecretaryRecommendation } from '../auto-mode/secretary.js'
import { buildAgentUri, buildThreadUri, DEFAULT_SECRETARY_CHAT_ID } from './pod-mirror-mapping.js'

export interface LinxPiRemoteApprovalOptions {
  session: AgentSession
  cwd: string
  pollMs?: number
  runtime?: AutoModeRemoteApprovalRuntime
  mode?: AutoModeMode
  resolveSecretaryRecommendation?: typeof resolveAutoModeSecretaryRecommendation
}

export function installLinxPiRemoteApproval(options: LinxPiRemoteApprovalOptions): void {
  const agent = options.session.agent
  const originalBeforeToolCall = agent.beforeToolCall?.bind(agent)

  agent.beforeToolCall = async (context: BeforeToolCallContext, signal?: AbortSignal) => {
    const originalResult = await originalBeforeToolCall?.(context, signal)
    if (originalResult?.block) {
      return originalResult
    }

    const request = buildPiToolApprovalRequest(context, options.cwd)
    if (!request) {
      return originalResult
    }

    const decision = await resolveLinxPiToolApproval({
      request,
      record: buildPiApprovalRecord(options, context),
      mode: options.mode ?? 'smart',
      pollMs: options.pollMs,
      signal,
      runtime: options.runtime,
      resolveSecretaryRecommendation: options.resolveSecretaryRecommendation ?? resolveAutoModeSecretaryRecommendation,
    })

    return mapApprovalDecisionToBeforeToolCallResult(decision, request)
  }
}

interface LinxPiToolApprovalInput {
  request: AutoModeApprovalRequest
  record: AutoModeSessionRecord
  mode: AutoModeMode
  pollMs?: number
  signal?: AbortSignal
  runtime?: AutoModeRemoteApprovalRuntime
  resolveSecretaryRecommendation: typeof resolveAutoModeSecretaryRecommendation
}

export async function resolveLinxPiToolApproval(input: LinxPiToolApprovalInput): Promise<AutoModeApprovalDecision> {
  const fallbackDecision = resolvePiFallbackAutoDecision(input)
  if (fallbackDecision) {
    return fallbackDecision
  }

  const rawRecommendation = await input.resolveSecretaryRecommendation({
    mode: input.mode,
    record: input.record,
    request: input.request,
  }).catch(() => createFallbackAutoModeSecretaryRecommendation({
    mode: input.mode,
    request: input.request,
  }))
  const recommendation = normalizePiApprovalRecommendation(input, rawRecommendation)

  if (recommendation?.canAutoDecide && recommendation.decision && recommendation.source === 'model') {
    return resolvePiRemoteApproval(input, recommendation)
  }

  const autoDecision = resolvePiAutoDecision(input, recommendation)
  if (autoDecision) {
    return autoDecision
  }

  return resolvePiRemoteApproval(input, recommendation)
    .catch(() => 'decline')
}

function normalizePiApprovalRecommendation(
  input: LinxPiToolApprovalInput,
  recommendation: Awaited<ReturnType<typeof resolveAutoModeSecretaryRecommendation>> | null,
): AutoModeSecretaryApprovalRecommendation | null {
  if (!isApprovalRecommendation(input.request, recommendation)) {
    return null
  }

  if (recommendation.source === 'fallback' && recommendation.canAutoDecide && !isTrustedPiFallbackApproval(input.request)) {
    return {
      ...recommendation,
      canAutoDecide: false,
      decision: undefined,
    }
  }

  return recommendation
}

async function resolvePiRemoteApproval(
  input: LinxPiToolApprovalInput,
  recommendation: AutoModeSecretaryApprovalRecommendation | null,
): Promise<AutoModeApprovalDecision> {
  const subject = buildPiApprovalSubject(input.record)
  const request = buildPiRemoteApprovalRequest(input.request)

  if (recommendation?.canAutoDecide && recommendation.decision) {
    const remote = await createRemoteApproval({
      subject,
      request,
      runtime: input.runtime,
    })
    await resolveRemoteAutoModeApproval({
      approvalId: remote.id,
      approvalUri: remote.approvalUri,
      decision: recommendation.decision,
      decisionRole: 'secretary',
      note: recommendation.reason ?? 'resolved by AI secretary',
      runtime: input.runtime,
    }).catch(() => undefined)
    return recommendation.decision
  }

  return requestRemoteApproval({
    subject,
    request,
    pollMs: input.pollMs,
    signal: input.signal,
    runtime: input.runtime,
  })
}

function buildPiApprovalSubject(record: AutoModeSessionRecord): (input: { webId: string }) => RemoteApprovalSubjectContext {
  return ({ webId }) => ({
    sessionUri: buildThreadUri(webId, DEFAULT_SECRETARY_CHAT_ID, record.id),
    actorUri: buildAgentUri(webId),
    policyVersion: 'linx-pi-remote-approval/v1',
  })
}

function buildPiRemoteApprovalRequest(request: AutoModeApprovalRequest): RemoteApprovalRequestDetails {
  const details = buildLinxPiApprovalDetails(request)
  return {
    kind: request.kind,
    message: details.message,
    toolCallId: extractPiToolCallId(request),
    toolName: details.toolName,
    action: details.action,
    risk: details.risk,
    ...(request.kind === 'command-approval' && request.command ? { command: request.command } : {}),
    ...(request.kind === 'command-approval' && request.cwd ? { cwd: request.cwd } : {}),
  }
}

function extractPiToolCallId(request: AutoModeApprovalRequest): string {
  const raw = isRecord(request.raw) ? request.raw : {}
  const params = isRecord(raw.params) ? raw.params : {}
  const toolCall = isRecord(params.toolCall) ? params.toolCall : {}
  return typeof toolCall.toolCallId === 'string' && toolCall.toolCallId.trim()
    ? toolCall.toolCallId.trim()
    : `${autoModeApprovalToolName(request)}-${Date.now()}`
}

function resolvePiAutoDecision(
  input: Pick<LinxPiToolApprovalInput, 'mode' | 'request'>,
  recommendation: AutoModeSecretaryApprovalRecommendation | null,
): AutoModeApprovalDecision | null {
  if (recommendation?.canAutoDecide && recommendation.decision) {
    if (recommendation.source === 'fallback' && !isTrustedPiFallbackApproval(input.request)) {
      return null
    }
    return recommendation.decision
  }

  return resolvePiFallbackAutoDecision(input)
}

function resolvePiFallbackAutoDecision(
  input: Pick<LinxPiToolApprovalInput, 'mode' | 'request'>,
): AutoModeApprovalDecision | null {
  if (input.request.kind === 'command-approval') {
    return resolveAutoModeAutoApprovalDecision({
      mode: input.mode,
      request: input.request,
    })
  }

  if (input.mode === 'auto' && (
    input.request.kind === 'file-change-approval'
      || input.request.kind === 'permissions-approval'
  )) {
    return 'accept_for_session'
  }

  return null
}

function isTrustedPiFallbackApproval(request: AutoModeApprovalRequest): boolean {
  return request.kind === 'command-approval' && isTrustedAutoModeCommand(request.command)
}

function isApprovalRecommendation(
  request: AutoModeApprovalRequest,
  recommendation: Awaited<ReturnType<typeof resolveAutoModeSecretaryRecommendation>> | null,
): recommendation is AutoModeSecretaryApprovalRecommendation {
  return Boolean(recommendation && recommendation.kind === request.kind)
}

function buildPiToolApprovalRequest(context: BeforeToolCallContext, cwd: string): AutoModeApprovalRequest | null {
  const toolName = typeof context.toolCall.name === 'string' ? context.toolCall.name : undefined
  if (!toolName) {
    return null
  }

  const toolCallId = typeof context.toolCall.id === 'string' && context.toolCall.id.trim()
    ? context.toolCall.id.trim()
    : `${toolName}-${Date.now()}`
  const raw = {
    endpoint: linxRuntimeEndpointForBackend('linx'),
    params: {
      toolCall: {
        toolCallId,
        name: toolName,
      },
    },
    piToolCall: context.toolCall,
    args: context.args,
  }

  if (toolName === 'bash') {
    const args = isRecord(context.args) ? context.args : {}
    const command = typeof args.command === 'string' ? args.command : undefined
    return {
      kind: 'command-approval',
      message: command ? `Approve command: ${command}` : 'Approve bash command',
      command,
      cwd,
      raw,
    }
  }

  if (toolName === 'edit' || toolName === 'write') {
    return {
      kind: 'file-change-approval',
      message: `Approve ${toolName} tool call`,
      reason: summarizeToolArgs(toolName, context.args),
      raw,
    }
  }

  return null
}

function buildPiApprovalRecord(options: LinxPiRemoteApprovalOptions, context: BeforeToolCallContext): AutoModeSessionRecord {
  const sessionId = getPiSessionId(options.session)
  return {
    id: sessionId,
    backend: 'codex',
    runtime: 'local',
    transport: 'native',
    mode: options.mode ?? 'smart',
    cwd: options.cwd,
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    approvalSource: 'hybrid',
    command: 'linx',
    args: [],
    status: 'running',
    startedAt: new Date(context.assistantMessage.timestamp ?? Date.now()).toISOString(),
    archiveDir: '',
    eventsFile: '',
  }
}

function getPiSessionId(session: AgentSession): string {
  const manager = (session as unknown as { sessionManager?: { getSessionId?: () => string } }).sessionManager
  return manager?.getSessionId?.() || 'linx-pi-session'
}

function mapApprovalDecisionToBeforeToolCallResult(
  decision: AutoModeApprovalDecision,
  request: AutoModeApprovalRequest,
): BeforeToolCallResult | undefined {
  if (decision === 'accept' || decision === 'accept_for_session') {
    return undefined
  }

  return {
    block: true,
    reason: decision === 'cancel'
      ? `LinX cancelled ${autoModeApprovalRequestMessage(request)}`
      : `LinX denied ${autoModeApprovalRequestMessage(request)}`,
  }
}

function summarizeToolArgs(toolName: string, args: unknown): string {
  if (!isRecord(args)) {
    return toolName
  }

  const path = typeof args.path === 'string' ? args.path : undefined
  const filePath = typeof args.filePath === 'string' ? args.filePath : undefined
  const target = path ?? filePath
  return target ? `${toolName} ${target}` : toolName
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildLinxPiApprovalDetails(request: AutoModeApprovalRequest): {
  message: string
  toolName: string
  action: string
  risk: 'low' | 'medium' | 'high'
} {
  return {
    message: autoModeApprovalRequestMessage(request),
    toolName: autoModeApprovalToolName(request),
    action: autoModeApprovalActionUri(request),
    risk: autoModeApprovalRisk(request),
  }
}
