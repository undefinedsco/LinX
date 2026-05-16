import type { AgentRuntimeCapabilities } from './acp.js'

export const LINX_RUNTIME_ENDPOINTS = ['linx', 'acp:codex', 'acp:claude', 'acp:codebuddy'] as const

export type LinxRuntimeEndpointId = (typeof LINX_RUNTIME_ENDPOINTS)[number]
export type LinxRuntimeEndpointProtocol = 'linx' | 'acp'
export type LinxRuntimeBackendId = 'linx' | 'codex' | 'claude' | 'codebuddy'

export interface LinxRuntimeEndpoint {
  id: LinxRuntimeEndpointId
  protocol: LinxRuntimeEndpointProtocol
  backend: LinxRuntimeBackendId
  label: string
  capabilities?: AgentRuntimeCapabilities
}

export type LinxRuntimeEventType =
  | 'session.started'
  | 'message.delta'
  | 'message.completed'
  | 'tool.call'
  | 'approval.required'
  | 'input.required'
  | 'session.completed'
  | 'session.error'

export interface LinxRuntimeEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  endpoint: LinxRuntimeEndpointId
  type: LinxRuntimeEventType
  timestamp?: string
  payload: TPayload
}

export interface LinxRuntimeApprovalRequest {
  endpoint: LinxRuntimeEndpointId
  requestId: string
  toolCallId: string
  toolName: string
  message: string
  action: string
  risk: 'low' | 'medium' | 'high'
  cwd?: string
  context?: Record<string, unknown>
}

export interface LinxRuntimeInputRequest {
  endpoint: LinxRuntimeEndpointId
  requestId: string
  message: string
  questions: Array<{
    id: string
    question: string
    options?: Array<{ label: string; description?: string }>
  }>
  context?: Record<string, unknown>
}

const ENDPOINTS: Record<LinxRuntimeEndpointId, LinxRuntimeEndpoint> = {
  linx: {
    id: 'linx',
    protocol: 'linx',
    backend: 'linx',
    label: 'LinX',
  },
  'acp:codex': {
    id: 'acp:codex',
    protocol: 'acp',
    backend: 'codex',
    label: 'Codex ACP',
  },
  'acp:claude': {
    id: 'acp:claude',
    protocol: 'acp',
    backend: 'claude',
    label: 'Claude ACP',
  },
  'acp:codebuddy': {
    id: 'acp:codebuddy',
    protocol: 'acp',
    backend: 'codebuddy',
    label: 'CodeBuddy ACP',
  },
}

export function isLinxRuntimeEndpointId(value: unknown): value is LinxRuntimeEndpointId {
  return typeof value === 'string' && value in ENDPOINTS
}

export function getLinxRuntimeEndpoint(id: LinxRuntimeEndpointId): LinxRuntimeEndpoint {
  return ENDPOINTS[id]
}

export function linxRuntimeEndpointForBackend(backend: LinxRuntimeBackendId): LinxRuntimeEndpointId {
  return backend === 'linx' ? 'linx' : `acp:${backend}` as LinxRuntimeEndpointId
}
