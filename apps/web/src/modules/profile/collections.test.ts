import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { solidProfileResource } from '@undefineds.co/models'

const { invalidateQueries } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: { invalidateQueries },
}))

import {
  fetchRemoteProfile,
  profileOps,
  setProfileDatabaseGetter,
  setProfileWebIdGetter,
} from './collections'

describe('profile singleton query model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProfileDatabaseGetter(() => null)
    setProfileWebIdGetter(() => null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays lazy until both the database and WebID are available', async () => {
    await expect(profileOps.fetch()).resolves.toBeNull()
  })

  it('reads the singleton profile by its exact WebID IRI', async () => {
    const webId = 'https://id.example/alice/profile/card#me'
    const row = { id: 'profile/card#me', name: 'Alice' }
    const db = {
      findByIri: vi.fn(async () => row),
    }
    setProfileDatabaseGetter(() => db as any)
    setProfileWebIdGetter(() => webId)

    await expect(profileOps.fetch()).resolves.toBe(row)
    expect(db.findByIri).toHaveBeenCalledWith(solidProfileResource, webId)
  })

  it('updates by exact WebID, invalidates the singleton key, and rereads once', async () => {
    const webId = 'https://id.example/alice/profile/card#me'
    const updated = { id: 'profile/card#me', name: 'Alice Updated' }
    const db = {
      updateByIri: vi.fn(async () => undefined),
      findByIri: vi.fn(async () => updated),
    }
    setProfileDatabaseGetter(() => db as any)
    setProfileWebIdGetter(() => webId)

    await expect(profileOps.updateName('Alice Updated')).resolves.toBe(updated)
    expect(db.updateByIri).toHaveBeenCalledWith(solidProfileResource, webId, {
      name: 'Alice Updated',
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile'] })
    expect(db.findByIri).toHaveBeenCalledOnce()
  })

  it('maps a remote Turtle profile without entering the local collection cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      @prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
      @prefix ldp: <http://www.w3.org/ns/ldp#> .
      <#me>
        foaf:name "Alice";
        foaf:img <https://cdn.example/alice.png>;
        vcard:note "Builder";
        ldp:inbox <https://pod.example/inbox/> .
    `, {
      headers: { 'Content-Type': 'text/turtle' },
    })))

    await expect(fetchRemoteProfile('https://id.example/alice/profile/card#me')).resolves.toMatchObject({
      webId: 'https://id.example/alice/profile/card#me',
      name: 'Alice',
      avatar: 'https://cdn.example/alice.png',
      note: 'Builder',
      inbox: 'https://pod.example/inbox/',
    })
  })
})
