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
 * Group-specific display info attached to UnifiedContact
 * Populated when rdfType marks the row as a GroupContact subclass
 */
export interface GroupContactInfo {
  /** Number of members (human + AI) */
  memberCount: number
  /** Whether the current user is the group owner */
  isOwner: boolean
  /** Preview list of member display names (max 4) */
  memberPreview: string[]
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

  // Group specific data (optional, populated if rdfType is GroupContact)
  groupInfo?: GroupContactInfo
}

/** Filter mode for the contact list view */
export type ContactListFilter = 'all' | 'personal' | 'groups' | 'agents'

export type SectionKey = 'new-friends' | 'agents' | 'contacts' | 'starred' | 'groups'

export interface ContactSection {
  key: SectionKey
  title: string
  items: UnifiedContact[]
}
