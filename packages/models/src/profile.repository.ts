import { extractProfileUsernameFromWebId } from './client/index.js'
import { definePodRepository, type AnyPodTable } from './repository.js'
import {
  solidProfileTable,
  type SolidProfileInsert,
  type SolidProfileRow,
  type SolidProfileUpdate,
} from './profile.schema.js'

export interface SolidProfileIdentity {
  webId: string
  profile: SolidProfileRow | null
  displayName: string | null
  username: string
}

export interface SolidProfileRepositoryReader {
  findByIri?(table: AnyPodTable, iri: string): Promise<unknown | null>
}

const baseProfileRepository = definePodRepository<
  typeof solidProfileTable,
  SolidProfileRow,
  SolidProfileInsert,
  SolidProfileUpdate
>({
  namespace: 'profile',
  table: solidProfileTable,
  searchableFields: ['name', 'nick'],
  disableMutations: {
    create: true,
    update: true,
    remove: true,
  },
})

export const profileRepository = {
  ...baseProfileRepository,

  async findByWebId(db: SolidProfileRepositoryReader, webId: string): Promise<SolidProfileRow | null> {
    if (!webId.trim()) {
      return null
    }
    return await db.findByIri?.(solidProfileTable, webId) as SolidProfileRow | null ?? null
  },

  async resolveDisplayName(db: SolidProfileRepositoryReader, webId: string): Promise<string | null> {
    return pickSolidProfileDisplayName(await profileRepository.findByWebId(db, webId))
  },

  async resolveIdentity(db: SolidProfileRepositoryReader, webId: string): Promise<SolidProfileIdentity | null> {
    if (!webId.trim()) {
      return null
    }

    const profile = await profileRepository.findByWebId(db, webId)
    return {
      webId,
      profile,
      displayName: pickSolidProfileDisplayName(profile),
      username: extractProfileUsernameFromWebId(webId),
    }
  },
}

export function pickSolidProfileDisplayName(
  profile: Pick<SolidProfileRow, 'name' | 'nick'> | null | undefined,
): string | null {
  return normalizeDisplayName(profile?.name) ?? normalizeDisplayName(profile?.nick) ?? null
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
