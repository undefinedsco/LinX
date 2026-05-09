import {
  agentTable,
  chatTable,
  contactTable,
  ContactType,
  eq,
  resolveRowId,
  type AgentRow,
  type ChatRow,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import type {
  GroupTurnAgent,
  GroupTurnDecision,
  GroupTurnMessage,
  GroupTurnRoute,
} from '@linx/agent-runtime/turn-controller'
import {
  routeGroupTurn,
} from '@linx/agent-runtime/turn-controller'
import { DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID } from '@linx/agent-runtime/companion-model'

export interface RoutedGroupAgent extends GroupTurnAgent {
  contact: ContactRow
  agent: AgentRow
  agentUri: string
  contactUri: string
}

export interface GroupTurnRoutingContext {
  route: GroupTurnRoute
  agents: RoutedGroupAgent[]
  targetAgents: RoutedGroupAgent[]
}

export interface ResolveGroupTurnRoutingInput {
  db: SolidDatabase
  thread: { id: string; metadata?: Record<string, unknown> }
  latestUserMessage: string
  history: GroupTurnMessage[]
  coordinationId?: string
  decide?: (input: {
    latestUserMessage: string
    agents: GroupTurnAgent[]
    history: GroupTurnMessage[]
  }) => Promise<GroupTurnDecision>
}

type QueryableTable = typeof chatTable | typeof contactTable | typeof agentTable

function extractStorageId(value: string | null | undefined): string | null {
  if (!value) return null
  const fragment = value.includes('#') ? value.split('#').pop() : null
  if (fragment && fragment !== 'this') return fragment

  const ttlMatch = value.match(/\/([^/#]+)\.ttl(?:#.*)?$/)
  if (ttlMatch?.[1]) return ttlMatch[1]

  const chatMatch = value.match(/\/\.data\/chat\/([^/]+)\/index\.ttl#this$/)
  if (chatMatch?.[1]) return chatMatch[1]

  return value
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

async function findRowsByCandidates<T extends Record<string, unknown>>(
  db: SolidDatabase,
  table: QueryableTable,
  candidates: string[],
): Promise<T[]> {
  const rows = await db.select().from(table).execute() as T[]
  const candidateSet = new Set(candidates)
  return rows.filter((row) => {
    const rowId = typeof row.id === 'string' ? row.id : null
    const rowUri = resolveRowId(row)
    return (rowId && candidateSet.has(rowId)) || (rowUri && candidateSet.has(rowUri))
  })
}

async function findChat(db: SolidDatabase, chatId: string): Promise<ChatRow | null> {
  try {
    const rows = await db.select().from(chatTable).where(eq(chatTable.id, chatId)).execute()
    if (rows[0]) return rows[0] as ChatRow
  } catch {
    // Some drizzle-solid query modes only match the full subject. Fall through.
  }

  const candidates = uniqueStrings([chatId, extractStorageId(chatId)])
  const rows = await findRowsByCandidates<ChatRow>(db, chatTable, candidates)
  return rows[0] ?? null
}

async function findContact(db: SolidDatabase, participant: string): Promise<ContactRow | null> {
  const candidates = uniqueStrings([participant, extractStorageId(participant)])
  const rows = await findRowsByCandidates<ContactRow>(db, contactTable, candidates)
  return rows[0] ?? null
}

async function findAgent(db: SolidDatabase, entityUri: string): Promise<AgentRow | null> {
  const candidates = uniqueStrings([entityUri, extractStorageId(entityUri)])
  const rows = await findRowsByCandidates<AgentRow>(db, agentTable, candidates)
  return rows[0] ?? null
}

function parseToolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return []

  return uniqueStrings(tools.flatMap((tool) => {
    if (typeof tool !== 'string') return []
    try {
      const parsed = JSON.parse(tool) as { name?: unknown; function?: { name?: unknown } }
      const parsedName = typeof parsed.name === 'string'
        ? parsed.name
        : typeof parsed.function?.name === 'string'
          ? parsed.function.name
          : null
      return parsedName ? [parsedName] : [tool]
    } catch {
      return [tool]
    }
  }))
}

function buildRoutedAgent(contact: ContactRow, agent: AgentRow): RoutedGroupAgent {
  const agentUri = resolveRowId(agent) ?? String(agent.id)
  const contactUri = resolveRowId(contact) ?? String(contact.id)
  const name = String(contact.alias || contact.name || agent.name || agent.id)
  const aliases = uniqueStrings([
    typeof contact.alias === 'string' ? contact.alias : null,
    typeof contact.name === 'string' ? contact.name : null,
    typeof agent.name === 'string' ? agent.name : null,
    typeof contact.id === 'string' ? contact.id : null,
    typeof agent.id === 'string' ? agent.id : null,
  ]).filter((alias) => alias !== name)

  return {
    id: String(agent.id),
    uri: agentUri,
    name,
    aliases,
    description: typeof agent.description === 'string' ? agent.description : undefined,
    tags: uniqueStrings([
      typeof agent.provider === 'string' ? agent.provider : null,
      typeof agent.model === 'string' ? agent.model : null,
    ]),
    capabilityNames: parseToolNames(agent.tools),
    contact,
    agent,
    agentUri,
    contactUri,
  }
}

export async function resolveGroupTurnRouting(
  input: ResolveGroupTurnRoutingInput,
): Promise<GroupTurnRoutingContext | null> {
  const chatId = typeof input.thread.metadata?.chat_id === 'string' ? input.thread.metadata.chat_id : null
  if (!chatId) return null

  const chat = await findChat(input.db, chatId)
  const participants = Array.isArray(chat?.participants) ? chat.participants : []
  if (participants.length === 0) return null

  const agents: RoutedGroupAgent[] = []
  for (const participant of participants) {
    if (typeof participant !== 'string') continue
    const contact = await findContact(input.db, participant)
    if (!contact || contact.contactType !== ContactType.AGENT || !contact.entityUri) continue
    const agent = await findAgent(input.db, String(contact.entityUri))
    if (!agent?.id || !agent.name) continue
    agents.push(buildRoutedAgent(contact, agent))
  }

  if (agents.length === 0) return null

  const route = await routeGroupTurn({
    latestUserMessage: input.latestUserMessage,
    agents,
    history: input.history,
    coordinationId: input.coordinationId,
    decide: input.decide,
  })

  return {
    route,
    agents,
    targetAgents: agents.filter((agent) => route.targetAgentIds.includes(agent.id)),
  }
}

export function parseGroupTurnDecision(value: string): GroupTurnDecision {
  const match = value.match(/\{[\s\S]*\}/)
  if (!match) {
    return { shouldReply: false, targetAgentIds: [], reason: 'Controller returned no JSON decision.' }
  }

  try {
    const parsed = JSON.parse(match[0]) as Partial<GroupTurnDecision>
    return {
      shouldReply: parsed.shouldReply === true,
      targetAgentIds: Array.isArray(parsed.targetAgentIds)
        ? parsed.targetAgentIds.filter((id): id is string => typeof id === 'string')
        : [],
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
    }
  } catch {
    return { shouldReply: false, targetAgentIds: [], reason: 'Controller returned invalid JSON.' }
  }
}

export function buildGroupTurnControllerMessages(input: {
  latestUserMessage: string
  agents: GroupTurnAgent[]
  history: GroupTurnMessage[]
}): Array<{ role: string; content: string }> {
  const agentProfiles = input.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    aliases: agent.aliases ?? [],
    description: agent.description,
    tags: agent.tags ?? [],
    capabilityNames: agent.capabilityNames ?? [],
  }))

  return [
    {
      role: 'system',
      content: [
        `You are ${DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID}, a fast turn router for a LinX group chat.`,
        'Choose which AI participant should reply to the latest user message.',
        'Return only JSON: {"shouldReply": boolean, "targetAgentIds": string[], "reason": string, "confidence": number}.',
        'If no AI should reply or confidence is low, return shouldReply=false and an empty targetAgentIds array.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        agents: agentProfiles,
        recentMessages: input.history.slice(-24),
        latestUserMessage: input.latestUserMessage,
      }),
    },
  ]
}
