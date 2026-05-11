import type { ToolControlCommandName } from '@undefineds.co/models'
import type { AgentRuntimeCapabilityName } from './acp.js'

export type AgentParticipantRole = 'user' | 'primary-agent' | 'secretary' | 'system'

export type AgentTurnTrigger =
  | 'user.message'
  | 'agent.message'
  | 'tool.call'
  | 'approval.required'
  | 'input.required'
  | 'grant.coverage.check'
  | 'session.idle'
  | 'session.error'

export type AgentTurnOutputKind =
  | 'chat_message'
  | 'approval_decision'
  | 'input_answer'
  | 'control_command'

export interface AgentContextWindowPolicy {
  recentMessages?: number
  includeCurrentApproval?: boolean
  includeMatchingGrants?: boolean
  includeToolCalls?: boolean
  includeToolResults?: boolean
  includeSystemEvents?: boolean
}

export interface AgentTurnControllerRule {
  id: string
  trigger: AgentTurnTrigger
  targetAgent: string
  targetRole: AgentParticipantRole
  requiredCapabilities?: AgentRuntimeCapabilityName[]
  context: AgentContextWindowPolicy
  allowedOutputs: AgentTurnOutputKind[]
  allowedControls?: ToolControlCommandName[]
  requiresUserVisibleTrace?: boolean
}

export interface GroupTurnAgent {
  id: string
  name: string
  aliases?: string[]
  uri?: string
  description?: string
  tags?: string[]
  capabilityNames?: string[]
}

export interface GroupTurnMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  speaker?: string
}

export interface GroupTurnDecision {
  shouldReply: boolean
  targetAgentIds: string[]
  reason?: string
  confidence?: number
}

export interface GroupTurnRoute {
  shouldReply: boolean
  targetAgentIds: string[]
  routedBy: 'mention' | 'controller' | 'single-agent' | 'none'
  coordinationId: string
  reason?: string
  confidence?: number
}

export interface RouteGroupTurnInput {
  latestUserMessage: string
  agents: GroupTurnAgent[]
  history?: GroupTurnMessage[]
  coordinationId?: string
  decide?: (input: {
    latestUserMessage: string
    agents: GroupTurnAgent[]
    history: GroupTurnMessage[]
  }) => Promise<GroupTurnDecision>
}

function normalizeMentionToken(value: string): string {
  return value.trim().toLowerCase()
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function findMentionedGroupAgents(message: string, agents: GroupTurnAgent[]): GroupTurnAgent[] {
  const normalizedMessage = message.toLowerCase()

  return agents.filter((agent) => {
    const candidates = uniqueStrings([
      agent.id,
      agent.name,
      ...(agent.aliases ?? []),
    ]).map(normalizeMentionToken)

    return candidates.some((candidate) => candidate && normalizedMessage.includes(`@${candidate}`))
  })
}

export async function routeGroupTurn(input: RouteGroupTurnInput): Promise<GroupTurnRoute> {
  const coordinationId = input.coordinationId ?? `group-turn-${Date.now()}`
  const agents = input.agents.filter((agent) => agent.id && agent.name)

  if (agents.length === 0) {
    return {
      shouldReply: false,
      targetAgentIds: [],
      routedBy: 'none',
      coordinationId,
      reason: 'No AI agent participants are available.',
    }
  }

  const mentionedAgents = findMentionedGroupAgents(input.latestUserMessage, agents)
  if (mentionedAgents.length > 0) {
    return {
      shouldReply: true,
      targetAgentIds: mentionedAgents.map((agent) => agent.id),
      routedBy: 'mention',
      coordinationId,
      reason: 'User explicitly mentioned one or more AI agents.',
      confidence: 1,
    }
  }

  if (agents.length === 1) {
    return {
      shouldReply: true,
      targetAgentIds: [agents[0].id],
      routedBy: 'single-agent',
      coordinationId,
      reason: 'Only one AI agent is present in the group.',
      confidence: 1,
    }
  }

  if (!input.decide) {
    return {
      shouldReply: false,
      targetAgentIds: [],
      routedBy: 'none',
      coordinationId,
      reason: 'No group turn controller is available for unmentioned multi-agent routing.',
    }
  }

  const decision = await input.decide({
    latestUserMessage: input.latestUserMessage,
    agents,
    history: input.history ?? [],
  })
  const validAgentIds = new Set(agents.map((agent) => agent.id))
  const targetAgentIds = uniqueStrings(decision.targetAgentIds).filter((id) => validAgentIds.has(id))

  return {
    shouldReply: decision.shouldReply && targetAgentIds.length > 0,
    targetAgentIds,
    routedBy: 'controller',
    coordinationId,
    reason: decision.reason,
    confidence: decision.confidence,
  }
}

export const GROUP_AGENT_TURN_RULE: AgentTurnControllerRule = {
  id: 'chat.group.agent-turn',
  trigger: 'user.message',
  targetAgent: 'agent-turn-controller',
  targetRole: 'system',
  context: {
    recentMessages: 24,
    includeToolCalls: false,
    includeToolResults: false,
    includeSystemEvents: false,
  },
  allowedOutputs: ['chat_message'],
  requiresUserVisibleTrace: false,
}

export const WATCH_SECRETARY_APPROVAL_RULE: AgentTurnControllerRule = {
  id: 'watch.secretary.approval',
  trigger: 'approval.required',
  targetAgent: 'ai-secretary',
  targetRole: 'secretary',
  requiredCapabilities: ['approval.request', 'approval.options'],
  context: {
    recentMessages: 24,
    includeCurrentApproval: true,
    includeMatchingGrants: true,
    includeToolCalls: true,
    includeToolResults: true,
    includeSystemEvents: false,
  },
  allowedOutputs: ['chat_message', 'approval_decision', 'control_command'],
  allowedControls: ['inject_message', 'pause', 'stop'],
  requiresUserVisibleTrace: true,
}

export const WATCH_SECRETARY_INPUT_RULE: AgentTurnControllerRule = {
  id: 'watch.secretary.input',
  trigger: 'input.required',
  targetAgent: 'ai-secretary',
  targetRole: 'secretary',
  requiredCapabilities: ['input.structured'],
  context: {
    recentMessages: 24,
    includeCurrentApproval: false,
    includeMatchingGrants: false,
    includeToolCalls: true,
    includeToolResults: true,
    includeSystemEvents: false,
  },
  allowedOutputs: ['chat_message', 'input_answer', 'control_command'],
  allowedControls: ['inject_message'],
  requiresUserVisibleTrace: true,
}

export const DEFAULT_WATCH_SECRETARY_RULES: AgentTurnControllerRule[] = [
  WATCH_SECRETARY_APPROVAL_RULE,
  WATCH_SECRETARY_INPUT_RULE,
]
