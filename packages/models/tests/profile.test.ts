import { describe, expect, it } from 'vitest'
import {
  pickSolidProfileDisplayName,
  profileRepository,
  resolveSolidProfile,
  resolveSolidProfileDisplayName,
  resolveSolidProfileIdentityWithReader,
  resolveSolidProfileWithTable,
  type SolidProfileRow,
} from '../src/profile'
import { extractProfileUsernameFromWebId } from '../src/client'
import type { SolidDatabase } from '../src/repository'

describe('solid profile helpers', () => {
  it('prefers profile name over nick for display identity', () => {
    expect(pickSolidProfileDisplayName({ name: ' Gan Lu ', nick: 'ganbb' } as SolidProfileRow)).toBe('Gan Lu')
    expect(pickSolidProfileDisplayName({ name: ' ', nick: 'ganbb' } as SolidProfileRow)).toBe('ganbb')
    expect(pickSolidProfileDisplayName(null)).toBeNull()
  })

  it('extracts fallback username from WebID profile paths', () => {
    expect(extractProfileUsernameFromWebId('https://id.undefineds.co/ganbb/profile/card#me')).toBe('ganbb')
    expect(extractProfileUsernameFromWebId('https://id.undefineds.co/local/profile/card#me')).toBe('local')
    expect(extractProfileUsernameFromWebId('not logged in')).toBe('there')
  })

  it('resolves profile rows through a caller-provided profile table without loading schema dependencies', async () => {
    const profileTable = { name: 'solidProfileTable' }
    const calls: Array<{ table: unknown; iri: string }> = []
    const db = {
      async findByIri(table: unknown, iri: string) {
        calls.push({ table, iri })
        return { name: 'Gan Lu', nick: 'ganbb' }
      },
    } as unknown as SolidDatabase

    await expect(resolveSolidProfileWithTable(db, 'https://id.undefineds.co/ganbb/profile/card#me', profileTable)).resolves.toEqual({
      name: 'Gan Lu',
      nick: 'ganbb',
    })
    expect(calls).toEqual([
      { table: profileTable, iri: 'https://id.undefineds.co/ganbb/profile/card#me' },
    ])
  })

  it('exposes profile lookup as a shared models repository', async () => {
    const webId = 'https://id.undefineds.co/ganbb/profile/card#me'
    const calls: Array<{ table: unknown; iri: string }> = []
    const db = {
      async findByIri(table: unknown, iri: string) {
        calls.push({ table, iri })
        return { name: 'Gan Lu', nick: 'ganbb' }
      },
    } as unknown as SolidDatabase

    await expect(profileRepository.findByWebId(db, webId)).resolves.toMatchObject({
      name: 'Gan Lu',
      nick: 'ganbb',
    })
    await expect(profileRepository.resolveDisplayName(db, webId)).resolves.toBe('Gan Lu')
    await expect(profileRepository.resolveIdentity(db, webId)).resolves.toMatchObject({
      webId,
      displayName: 'Gan Lu',
      username: 'ganbb',
    })
    expect(calls.map((call) => call.iri)).toEqual([webId, webId, webId])
  })

  it('skips db calls for blank profile WebIDs', async () => {
    const db = {
      async findByIri() {
        throw new Error('findByIri should not be called for blank WebIDs')
      },
    } as unknown as SolidDatabase

    await expect(resolveSolidProfile(db, '   ')).resolves.toBeNull()
    await expect(resolveSolidProfileDisplayName(db, '   ')).resolves.toBeNull()
    await expect(profileRepository.findByWebId(db, '   ')).resolves.toBeNull()
    await expect(profileRepository.resolveIdentity(db, '   ')).resolves.toBeNull()
  })

  it('wraps profile lookup into a shared identity API', async () => {
    const webId = 'https://id.undefineds.co/ganbb/profile/card#me'
    const db = {
      async findByIri(_table: unknown, iri: string) {
        expect(iri).toBe(webId)
        return { name: 'Gan Lu', nick: 'ganbb' }
      },
    } as unknown as SolidDatabase

    await expect(resolveSolidProfileIdentityWithReader(db, webId)).resolves.toMatchObject({
      webId,
      displayName: 'Gan Lu',
      username: 'ganbb',
      profile: { name: 'Gan Lu' },
    })
  })
})
