import type { ContactRow, AgentRow } from '@linx/models'

export type ContactSourceType = 'solid' | 'wechat' | 'agent' | 'external'

export type GenderType = 'male' | 'female' | 'bot' | 'unknown'

/**
 * Contact Tag
 */
export interface ContactTag {
  id: string
  name: string
  color?: string
}

/**
 * Unified Contact View Model
 * Combines basic contact info with agent details if applicable.
 * Uses Omit to allow overriding the gender type.
 */
export interface UnifiedContact extends Omit<ContactRow, 'gender'> {
  // Enhanced display fields
  displayName: string
  displayAvatar: string
  initial: string // First letter for sorting (A-Z, #)
  
  // Type identification
  sourceType: ContactSourceType
  
  // Demographics (override ContactRow.gender with more specific type)
  gender?: GenderType
  region?: string // "Province City"
  
  // Tags
  tags?: ContactTag[]
  
  // Agent specific data (optional, populated if contactType='agent')
  agentConfig?: Partial<AgentRow> & {
    ttsModel?: string
    videoModel?: string
    tools?: string[] // List of enabled tool IDs
  }
}

export type SectionKey = 'new-friends' | 'agents' | 'contacts' | 'starred'

export interface ContactSection {
  key: SectionKey
  title: string
  items: UnifiedContact[]
}
