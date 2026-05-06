import type { BeforeToolCallContext, BeforeToolCallResult } from '@mariozechner/pi-agent-core'
import type { AgentSession, SessionManager } from '@mariozechner/pi-coding-agent'
import type {
  RemoteApprovalRisk,
  RemoteApprovalSubjectContext,
  WatchRemoteApprovalRuntime,
} from '../watch/pod-approval.js'
import { requestRemoteApproval } from '../watch/pod-approval.js'
import {
  DEFAULT_SECRETARY_CHAT_ID,
  buildAgentUri,
  buildThreadUri,
  pathToWorkspaceUri,
} from './pod-mirror-mapping.js'

const PI_REMOTE_APPROVAL_POLICY_VERSION = 'linx-pi-remote-approval/v1'
const DEFAULT_PI_REMOTE_APPROVAL_POLL_MS = 1000
const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls'])

export interface LinxPiRemoteApprovalOptions {
  session: AgentSession
  cwd: string
  pollMs?: number
  runtime?: WatchRemoteApprovalRuntime
}

export function installLinxPiRemoteApproval(options: LinxPiRemoteApprovalOptions): void {
  const agent = options.session.agent
  const originalBeforeToolCall = agent.beforeToolCall?.bind(agent)

  agent.beforeToolCall = async (context: BeforeToolCallContext, signal?: AbortSignal) => {
    const originalResult = await originalBeforeToolCall?.(context, signal)
    if (originalResult?.block) {
      return originalResult
    }

    const approvalResult = await requestLinxPiToolApproval({
      ...options,
      context,
      signal,
    })
    return approvalResult ?? originalResult
  }
}

export async function requestLinxPiToolApproval(options: {
  session: AgentSession
  cwd: string
  context: BeforeToolCallContext
  pollMs?: number
  signal?: AbortSignal
  runtime?: WatchRemoteApprovalRuntime
}): Promise<BeforeToolCallResult | undefined> {
  const toolName = options.context.toolCall.name
  if (!requiresRemoteApproval(toolName)) {
    return undefined
  }

  const sessionManager = options.session.sessionManager
  const decision = await requestRemoteApproval({
    subject: ({ webId }) => buildPiApprovalSubject(webId, sessionManager),
    request: ({ sessionUri }) => buildPiApprovalRequest({
      cwd: options.cwd,
      sessionUri,
      sessionManager,
      context: options.context,
    }),
    pollMs: options.pollMs ?? DEFAULT_PI_REMOTE_APPROVAL_POLL_MS,
    signal: options.signal,
    runtime: options.runtime,
  })

  if (decision === 'decline' || decision === 'cancel') {
    return {
      block: true,
      reason: `LinX remote approval ${decision === 'cancel' ? 'cancelled' : 'rejected'} tool ${toolName}.`,
    }
  }

  return undefined
}

export function requiresRemoteApproval(toolName: string): boolean {
  return !READ_ONLY_TOOLS.has(toolName)
}

function buildPiApprovalSubject(webId: string, sessionManager: SessionManager): RemoteApprovalSubjectContext {
  return {
    sessionUri: buildThreadUri(webId, DEFAULT_SECRETARY_CHAT_ID, sessionManager.getSessionId()),
    actorUri: buildAgentUri(webId),
    targetUri: buildThreadUri(webId, DEFAULT_SECRETARY_CHAT_ID, sessionManager.getSessionId()),
    assignedTo: webId,
    onBehalfOf: webId,
    policyVersion: PI_REMOTE_APPROVAL_POLICY_VERSION,
  }
}

function buildPiApprovalRequest(options: {
  cwd: string
  sessionUri: string
  sessionManager: SessionManager
  context: BeforeToolCallContext
}): {
  kind: 'command-approval' | 'file-change-approval' | 'permissions-approval'
  message: string
  toolCallId: string
  toolName: string
  action: string
  risk: RemoteApprovalRisk
  command?: string
  cwd?: string
  context: Record<string, unknown>
} {
  const toolName = options.context.toolCall.name
  const args = isRecord(options.context.args) ? options.context.args : {}
  const command = toolName === 'bash' && typeof args.command === 'string'
    ? args.command
    : undefined
  const filePath = typeof args.path === 'string' ? args.path : undefined
  const risk = riskForTool(toolName)
  const kind = toolName === 'bash' ? 'command-approval' : 'file-change-approval'
  const message = command
    ? `Run command: ${command}`
    : filePath
      ? `${toolName} file: ${filePath}`
      : `Run tool: ${toolName}`

  return {
    kind,
    message,
    toolCallId: options.context.toolCall.id,
    toolName,
    action: actionForTool(toolName),
    risk,
    ...(command ? { command } : {}),
    cwd: options.cwd,
    context: {
      kind,
      message,
      runtime: 'linx-pi',
      sessionId: options.sessionManager.getSessionId(),
      sessionUri: options.sessionUri,
      toolName,
      toolCallId: options.context.toolCall.id,
      cwd: options.cwd,
      ...(pathToWorkspaceUri(options.cwd) ? { workspace: pathToWorkspaceUri(options.cwd) } : {}),
      ...(command ? { command } : {}),
      ...(filePath ? { path: filePath } : {}),
      args,
    },
  }
}

function actionForTool(toolName: string): string {
  if (toolName === 'bash') {
    return 'https://undefineds.co/ns#commandExecution'
  }
  if (toolName === 'edit' || toolName === 'write') {
    return 'https://undefineds.co/ns#fileChange'
  }
  return 'https://undefineds.co/ns#toolExecution'
}

function riskForTool(toolName: string): RemoteApprovalRisk {
  if (toolName === 'edit' || toolName === 'write') {
    return 'high'
  }
  if (toolName === 'bash') {
    return 'medium'
  }
  return 'medium'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
