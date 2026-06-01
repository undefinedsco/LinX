import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solidProfileTable } from '@undefineds.co/models'

const mocked = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: mocked.invalidateQueries,
  },
}))

import {
  clearProfileOpsSyncResults,
  getProfileOpsSyncResults,
  profileOps,
  setProfileDatabaseGetter,
  setProfileWebIdGetter,
} from './collections'

describe('profileOps sync modeling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearProfileOpsSyncResults()
    setProfileDatabaseGetter(() => null)
    setProfileWebIdGetter(() => null)
  })

  it('models profile updates as app-to-Pod control-plane sync', async () => {
    const profile = {
      id: 'https://alice.example/profile/card#me',
      name: 'Alice',
      note: 'hello',
    }
    const db = {
      updateByIri: vi.fn().mockResolvedValue(undefined),
      findByIri: vi.fn().mockResolvedValue(profile),
    }

    setProfileDatabaseGetter(() => db as any)
    setProfileWebIdGetter(() => 'https://alice.example/profile/card#me')

    const result = await profileOps.update({ name: 'Alice', note: 'hello' })

    expect(result).toBe(profile)
    expect(db.updateByIri).toHaveBeenCalledWith(solidProfileTable, 'https://alice.example/profile/card#me', {
      name: 'Alice',
      note: 'hello',
    })
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile'] })
    expect(getProfileOpsSyncResults()).toHaveLength(1)
    expect(getProfileOpsSyncResults()[0]).toMatchObject({
      source: 'app-profile',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'control-plane',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'profile.update',
        resourceBindings: {
          profile: {
            uri: 'https://alice.example/profile/card#me',
            local: 'https://alice.example/profile/card#me',
          },
        },
        fieldKeys: ['name', 'note'],
      },
    })
  })
})
