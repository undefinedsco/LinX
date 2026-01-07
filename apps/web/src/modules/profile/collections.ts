/**
 * Profile Module Collections
 * 
 * Operations for managing the user's own Solid Profile.
 * This is for reading/writing the current user's profile at idp:///profile/card
 * 
 * Note: Profile is a single document, not a collection of records.
 * So we don't use createPodCollection, but direct db operations.
 */

import {
  solidProfileTable,
  type SolidProfileRow,
  type SolidProfileUpdate,
} from '@linx/models'
import type { SolidDatabase } from '@linx/models'
import { queryClient } from '@/providers/query-provider'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null
let webIdGetter: (() => string | null) | null = null

export function setProfileDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

export function setProfileWebIdGetter(getter: () => string | null) {
  webIdGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

function getWebId(): string | null {
  return webIdGetter?.() ?? null
}

// ============================================================================
// Profile Operations (Business Logic)
// ============================================================================

/**
 * Profile Operations - Business logic for profile management
 * 
 * Profile is a single document (not a collection), so we use direct db operations.
 */
export const profileOps = {
  /**
   * Fetch current user's profile
   */
  async fetch(): Promise<SolidProfileRow | null> {
    const db = getDb()
    const webId = getWebId()
    
    if (!db || !webId) {
      console.warn('[profileOps] No database or webId available')
      return null
    }
    
    try {
      const record = await db.findByIri(solidProfileTable, webId)
      return record as SolidProfileRow | null
    } catch (error) {
      console.error('[profileOps] Failed to fetch profile:', error)
      return null
    }
  },

  /**
   * Update profile fields
   */
  async update(data: Partial<SolidProfileUpdate>): Promise<SolidProfileRow | null> {
    const db = getDb()
    const webId = getWebId()
    
    if (!db || !webId) {
      console.warn('[profileOps] No database or webId available')
      return null
    }
    
    try {
      await db.updateByIri(solidProfileTable, webId, data)
      
      // Invalidate query cache
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      
      // Return updated profile
      return await this.fetch()
    } catch (error) {
      console.error('[profileOps] Failed to update profile:', error)
      throw error
    }
  },

  /**
   * Update avatar
   * @param avatarUrl - URL of the uploaded avatar
   */
  async updateAvatar(avatarUrl: string): Promise<SolidProfileRow | null> {
    return await this.update({ avatar: avatarUrl })
  },

  /**
   * Update display name
   */
  async updateName(name: string): Promise<SolidProfileRow | null> {
    return await this.update({ name })
  },

  /**
   * Update nickname
   */
  async updateNick(nick: string): Promise<SolidProfileRow | null> {
    return await this.update({ nick })
  },

  /**
   * Update note/bio
   */
  async updateNote(note: string): Promise<SolidProfileRow | null> {
    return await this.update({ note })
  },

  /**
   * Update gender
   */
  async updateGender(gender: string): Promise<SolidProfileRow | null> {
    return await this.update({ gender })
  },

  /**
   * Update region
   */
  async updateRegion(region: string): Promise<SolidProfileRow | null> {
    return await this.update({ region })
  },
}

// ============================================================================
// Fetch Remote Profile (for viewing other users)
// ============================================================================

export interface RemoteProfileInfo {
  webId: string
  name?: string
  nick?: string
  avatar?: string
  note?: string
  region?: string
  gender?: string
  inbox?: string
}

/**
 * Fetch a remote user's profile by WebID
 * This is used for viewing Solid contacts' profiles
 * 
 * @param webId - The WebID URL to fetch
 * @returns Profile info or null if not found
 */
export async function fetchRemoteProfile(webId: string): Promise<RemoteProfileInfo | null> {
  try {
    const response = await fetch(webId, {
      headers: {
        'Accept': 'text/turtle, application/ld+json',
      },
    })
    
    if (!response.ok) {
      console.warn(`[fetchRemoteProfile] Failed to fetch: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    
    // Simple Turtle parsing (not robust, but works for common cases)
    let name = ''
    let nick = ''
    let avatar = ''
    let note = ''
    let region = ''
    let gender = ''
    let inbox = ''
    
    if (contentType.includes('turtle') || contentType.includes('n3')) {
      // Extract name
      const nameMatch = text.match(/(?:foaf:name|vcard:fn)\s+"([^"]+)"/i) ||
                       text.match(/<http:\/\/xmlns\.com\/foaf\/0\.1\/name>\s+"([^"]+)"/i) ||
                       text.match(/<http:\/\/www\.w3\.org\/2006\/vcard\/ns#fn>\s+"([^"]+)"/i)
      if (nameMatch) name = nameMatch[1]
      
      // Extract nick
      const nickMatch = text.match(/foaf:nick\s+"([^"]+)"/i)
      if (nickMatch) nick = nickMatch[1]
      
      // Extract avatar
      const avatarMatch = text.match(/(?:foaf:img|vcard:hasPhoto)\s+<([^>]+)>/i)
      if (avatarMatch) avatar = avatarMatch[1]
      
      // Extract note
      const noteMatch = text.match(/vcard:note\s+"([^"]+)"/i)
      if (noteMatch) note = noteMatch[1]
      
      // Extract region
      const regionMatch = text.match(/vcard:region\s+"([^"]+)"/i)
      if (regionMatch) region = regionMatch[1]
      
      // Extract gender
      const genderMatch = text.match(/vcard:hasGender\s+"([^"]+)"/i)
      if (genderMatch) gender = genderMatch[1]
      
      // Extract inbox
      const inboxMatch = text.match(/ldp:inbox\s+<([^>]+)>/i)
      if (inboxMatch) inbox = inboxMatch[1]
    }
    
    // Fallback: extract name from WebID hostname
    if (!name && !nick) {
      try {
        const url = new URL(webId)
        const hostParts = url.hostname.split('.')
        if (hostParts.length >= 3) {
          name = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1)
        }
      } catch {
        // ignore
      }
    }
    
    return {
      webId,
      name: name || undefined,
      nick: nick || undefined,
      avatar: avatar || undefined,
      note: note || undefined,
      region: region || undefined,
      gender: gender || undefined,
      inbox: inbox || undefined,
    }
  } catch (error) {
    console.error('[fetchRemoteProfile] Error:', error)
    return null
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize profile operations with database and webId.
 * Call this from a component that has access to useSolidDatabase and useSession.
 */
export function initializeProfileOps(db: SolidDatabase | null, webId: string | null) {
  setProfileDatabaseGetter(() => db)
  setProfileWebIdGetter(() => webId)
}
