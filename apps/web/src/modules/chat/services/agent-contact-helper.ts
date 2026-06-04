/**
 * Helper functions for managing Agent and Contact relationships
 * 
 * When creating an AI chat, we need:
 * 1. An Agent record (stores provider, model, instructions)
 * 2. A Contact record (contactType='agent', entityUri points to Agent)
 * 3. A Chat record (participants stores the Contact URI)
 */

import type { SolidDatabase } from '@undefineds.co/models'
import {
  asResourceIri,
  agentTable,
  contactTable,
  agentRepository,
  contactRepository,
  ContactClass,
  ContactType,
  isAgentContact,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  type AgentRow,
  type ContactRow,
} from '@undefineds.co/models'

export interface FindOrCreateAgentParams {
  provider: string
  model: string
  name?: string
  instructions?: string
}

export interface FindOrCreateContactParams {
  agent: AgentRow
  agentUri: string
}

/**
 * Find an existing Agent by provider+model, or create a new one
 */
export async function findOrCreateAgent(
  db: SolidDatabase,
  params: FindOrCreateAgentParams
): Promise<{ agent: AgentRow; agentUri: string; created: boolean }> {
  const { provider, model, name, instructions } = params

  // Query existing agents
  const agents = await db.select().from(agentTable).execute()
  
  // Find matching agent by provider + model
  const existing = agents.find(
    (agent) => (
      normalizeAIConfigProviderId(typeof agent.provider === 'string' ? agent.provider : '') === normalizeAIConfigProviderId(provider)
      && normalizeAIConfigResourceId(typeof agent.model === 'string' ? agent.model : '') === normalizeAIConfigResourceId(model)
    )
  )

  if (existing) {
    const uri = asResourceIri(db.resolveRowIri(agentTable as any, existing), 'Agent IRI')
    return { agent: existing, agentUri: uri, created: false }
  }

  // Create new agent
  const agentName = name || `${provider}/${model}`
  const newAgent = await agentRepository.create!(db, {
    name: agentName,
    provider: normalizeAIConfigProviderId(provider),
    model: normalizeAIConfigResourceId(model),
    instructions: instructions || '',
  })

  const uri = asResourceIri(db.resolveRowIri(agentTable as any, newAgent), 'Agent IRI')
  return { agent: newAgent, agentUri: uri, created: true }
}

/**
 * Find an existing Contact for an Agent, or create a new one
 */
export async function findOrCreateAgentContact(
  db: SolidDatabase,
  params: FindOrCreateContactParams
): Promise<{ contact: ContactRow; contactUri: string; created: boolean }> {
  const { agent, agentUri } = params

  // Query existing contacts
  const contacts = await db.select().from(contactTable).execute()
  
  // Find contact that points to this agent
  const existing = contacts.find(
    c => c.entityUri === agentUri && isAgentContact(c)
  )

  if (existing) {
    const uri = asResourceIri(db.resolveRowIri(contactTable as any, existing), 'Contact IRI')
    return { contact: existing, contactUri: uri, created: false }
  }

  // Create new contact for agent
  const newContact = await contactRepository.create!(db, {
    name: agent.name,
    avatarUrl: agent.avatarUrl || undefined,
    entityUri: agentUri,
    rdfType: ContactClass.AGENT,
    contactType: ContactType.AGENT,
    isPublic: false,
  })

  const uri = asResourceIri(db.resolveRowIri(contactTable as any, newContact), 'Contact IRI')
  return { contact: newContact, contactUri: uri, created: true }
}

/**
 * Convenience function: ensure Agent and Contact exist for a provider+model combo
 * Returns the Contact URI to use in Chat.participants
 */
export async function ensureAgentContact(
  db: SolidDatabase,
  params: FindOrCreateAgentParams
): Promise<{ contactUri: string; agentUri: string }> {
  const { agent, agentUri } = await findOrCreateAgent(db, params)
  const { contactUri } = await findOrCreateAgentContact(db, { agent, agentUri })
  return { contactUri, agentUri }
}
