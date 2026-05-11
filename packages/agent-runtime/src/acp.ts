export type AgentRuntimeProtocol = 'acp' | 'linx-chatkit' | 'linx-cloud' | 'custom'

export type AgentRuntimeCapabilityName =
  | 'session.start'
  | 'session.resume'
  | 'message.send'
  | 'message.receive'
  | 'message.stream'
  | 'message.thinking'
  | 'message.inject'
  | 'tool.call'
  | 'approval.request'
  | 'approval.options'
  | 'input.structured'
  | 'control.interrupt'
  | 'control.pause'
  | 'control.resume'
  | 'control.stop'
  | 'model.set'

export interface AgentRuntimeCapabilities {
  protocol: AgentRuntimeProtocol
  canStartSession: boolean
  canResumeSession: boolean
  canSendMessage: boolean
  canReceiveEvents: boolean
  hasStreaming: boolean
  hasThinking: boolean
  hasToolCalls: boolean
  hasApprovals: boolean
  hasApprovalOptions: boolean
  hasStructuredUserInput: boolean
  canInterrupt: boolean
  canInjectMessage: boolean
  canPause: boolean
  canResume: boolean
  canStop: boolean
  canSetModel: boolean
}

export const BASE_ACP_AGENT_CAPABILITIES: AgentRuntimeCapabilities = {
  protocol: 'acp',
  canStartSession: true,
  canResumeSession: false,
  canSendMessage: true,
  canReceiveEvents: true,
  hasStreaming: true,
  hasThinking: false,
  hasToolCalls: true,
  hasApprovals: true,
  hasApprovalOptions: true,
  hasStructuredUserInput: true,
  canInterrupt: false,
  canInjectMessage: false,
  canPause: false,
  canResume: false,
  canStop: true,
  canSetModel: false,
}

export const DEFAULT_LINX_CHATKIT_AGENT_CAPABILITIES: AgentRuntimeCapabilities = {
  protocol: 'linx-chatkit',
  canStartSession: true,
  canResumeSession: true,
  canSendMessage: true,
  canReceiveEvents: true,
  hasStreaming: true,
  hasThinking: true,
  hasToolCalls: true,
  hasApprovals: true,
  hasApprovalOptions: true,
  hasStructuredUserInput: true,
  canInterrupt: true,
  canInjectMessage: true,
  canPause: false,
  canResume: false,
  canStop: true,
  canSetModel: true,
}

export function defineAgentRuntimeCapabilities(
  base: AgentRuntimeCapabilities,
  overrides: Partial<AgentRuntimeCapabilities> = {},
): AgentRuntimeCapabilities {
  return {
    ...base,
    ...overrides,
  }
}

export function createAcpAgentCapabilities(
  overrides: Partial<AgentRuntimeCapabilities> = {},
): AgentRuntimeCapabilities {
  return defineAgentRuntimeCapabilities(BASE_ACP_AGENT_CAPABILITIES, overrides)
}

export function createLinxChatKitAgentCapabilities(
  overrides: Partial<AgentRuntimeCapabilities> = {},
): AgentRuntimeCapabilities {
  return defineAgentRuntimeCapabilities(DEFAULT_LINX_CHATKIT_AGENT_CAPABILITIES, overrides)
}

export function supportsAgentRuntimeCapability(
  capabilities: AgentRuntimeCapabilities,
  capability: AgentRuntimeCapabilityName,
): boolean {
  switch (capability) {
    case 'session.start':
      return capabilities.canStartSession
    case 'session.resume':
      return capabilities.canResumeSession
    case 'message.send':
      return capabilities.canSendMessage
    case 'message.receive':
      return capabilities.canReceiveEvents
    case 'message.stream':
      return capabilities.hasStreaming
    case 'message.thinking':
      return capabilities.hasThinking
    case 'message.inject':
      return capabilities.canInjectMessage
    case 'tool.call':
      return capabilities.hasToolCalls
    case 'approval.request':
      return capabilities.hasApprovals
    case 'approval.options':
      return capabilities.hasApprovalOptions
    case 'input.structured':
      return capabilities.hasStructuredUserInput
    case 'control.interrupt':
      return capabilities.canInterrupt
    case 'control.pause':
      return capabilities.canPause
    case 'control.resume':
      return capabilities.canResume
    case 'control.stop':
      return capabilities.canStop
    case 'model.set':
      return capabilities.canSetModel
  }
}
