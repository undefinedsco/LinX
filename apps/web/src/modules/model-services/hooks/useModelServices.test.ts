import { describe, expect, it } from 'vitest'
import {
  aiModelResource,
  aiProviderResource,
  buildAIConfigMutationPlan,
  credentialResource,
} from '@undefineds.co/models'
import {
  buildModelServiceExactUpdate,
  buildHydratedModelServiceExactUpdate,
  collectKnownModelServiceProviderIds,
  buildModelServiceInsertRows,
  buildCredentialVerificationUpdate,
  mergeModelServiceCredentialRows,
  mergeModelServiceProviderRows,
  normalizeLiveQueryRows,
  recoverModelServiceProviderRows,
} from './useModelServices'

describe('collectKnownModelServiceProviderIds', () => {
  it('recovers a provider id from a partially persisted default credential', () => {
    expect(collectKnownModelServiceProviderIds(
      [],
      [{ id: 'credentials.ttl#timecc-default', failCount: 0 }],
      [],
    )).toEqual(['timecc'])
  })
})

describe('buildModelServiceExactUpdate', () => {
  it('preserves predicates omitted by a partial mutation plan', () => {
    expect(buildModelServiceExactUpdate(
      { id: 'timecc.ttl', displayName: 'Timecc', baseUrl: 'https://timicc.com/v1' },
      { baseUrl: 'https://timicc.com/v2' },
    )).toEqual({
      id: 'timecc.ttl',
      displayName: 'Timecc',
      baseUrl: 'https://timicc.com/v2',
    })
  })

  it('hydrates omitted predicates immediately before a replacement-style update', async () => {
    const db = {
      findById: async () => ({
        id: 'timecc-default',
        apiKey: 'secret-test-key',
        provider: 'timecc',
      }),
    }

    await expect(buildHydratedModelServiceExactUpdate(
      db as any,
      credentialResource as any,
      { id: 'timecc-default', failCount: 0 },
      { failCount: 1 },
    )).resolves.toEqual({
      id: 'timecc-default',
      apiKey: 'secret-test-key',
      provider: 'timecc',
      failCount: 1,
    })
  })
})

describe('mergeModelServiceCredentialRows', () => {
  it('recovers a credential omitted by a collection query from its exact read', () => {
    const exact = {
      id: 'credentials.ttl#timecc-default',
      provider: '/settings/providers/timecc.ttl',
      apiKey: 'secret-test-key',
    }

    expect(mergeModelServiceCredentialRows([], [exact])).toEqual([exact])
  })

  it('lets the exact read restore fields missing from a partial query row', () => {
    expect(mergeModelServiceCredentialRows(
      [{ id: 'timecc-default', failCount: 0 }],
      [{ id: 'credentials.ttl#timecc-default', apiKey: 'secret-test-key' }],
    )).toEqual([{
      id: 'credentials.ttl#timecc-default',
      failCount: 0,
      apiKey: 'secret-test-key',
    }])
  })
})

describe('mergeModelServiceProviderRows', () => {
  it('restores Base URL omitted by a partial provider query', () => {
    expect(mergeModelServiceProviderRows(
      [{ id: 'timecc', displayName: 'Timecc' }],
      [{ id: 'timecc.ttl', baseUrl: 'https://timicc.com/v1' }],
    )).toEqual([{
      id: 'timecc.ttl',
      displayName: 'Timecc',
      baseUrl: 'https://timicc.com/v1',
    }])
  })
})

describe('buildCredentialVerificationUpdate', () => {
  it('updates only health fields after a failed verification', () => {
    const credential = {
      id: 'timecc-default',
      provider: '/settings/providers/timecc.ttl',
      apiKey: 'secret-test-key',
      label: 'Timecc Key',
      service: 'ai',
      status: 'active',
      isDefault: true,
      failCount: 1,
    }

    expect(buildCredentialVerificationUpdate(credential, new Error('unavailable'))).toEqual({ failCount: 2 })
  })

  it('updates only health fields after a successful verification', () => {
    const credential = {
      id: 'timecc-default',
      provider: '/settings/providers/timecc.ttl',
      apiKey: 'secret-test-key',
      status: 'active',
      failCount: 3,
    }

    const update = buildCredentialVerificationUpdate(credential)

    expect(update).toMatchObject({ failCount: 0 })
    expect(update).not.toHaveProperty('apiKey')
    expect(update.lastUsedAt).toBeInstanceOf(Date)
  })
})

describe('normalizeLiveQueryRows', () => {
  it('keeps the resource rows returned directly by TanStack DB', () => {
    const rows = [
      { id: 'openai', displayName: 'OpenAI' },
      { id: 'anthropic', displayName: 'Anthropic' },
    ]

    expect(normalizeLiveQueryRows(rows)).toEqual(rows)
  })

  it('returns an empty list before the live query has data', () => {
    expect(normalizeLiveQueryRows(undefined)).toEqual([])
  })
})

describe('recoverModelServiceProviderRows', () => {
  it('recovers a provider overwritten by a model write from its credential and models', () => {
    expect(recoverModelServiceProviderRows(
      [],
      [{
        provider: 'http://localhost:5737/settings/providers/timecc.ttl',
        label: 'Timecc',
        baseUrl: 'https://timicc.com',
      }],
      [{ isProvidedBy: 'http://localhost:5737/settings/providers/timecc.ttl' }],
    )).toEqual([{
      id: 'timecc',
      displayName: 'Timecc',
      baseUrl: 'https://timicc.com',
      proxyUrl: undefined,
    }])
  })

  it('does not duplicate a provider returned by the provider query', () => {
    const provider = { id: 'timecc.ttl', displayName: 'Timecc' }
    expect(recoverModelServiceProviderRows(
      [provider],
      [{ provider: '/settings/providers/timecc.ttl', label: 'Other' }],
      [],
    )).toEqual([provider])
  })
})

describe('buildModelServiceInsertRows', () => {
  it('converts domain ids to resource ids before inserting into the Pod', () => {
    const plan = buildAIConfigMutationPlan({
      providerId: 'qa-temporary',
      currentProviderRows: [],
      currentCredentialRows: [],
      currentModelRows: [],
      updates: {
        enabled: true,
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
        models: [{
          id: 'test-model',
          name: 'Test model',
          enabled: true,
          capabilities: [],
        }],
      },
    })

    const rows = buildModelServiceInsertRows(plan)

    expect(rows.providerPayload?.id).toBe(aiProviderResource.buildId({ id: 'qa-temporary' }))
    expect(rows.credentialPayload?.id).toBe(
      credentialResource.buildId({ id: plan.credentialPayload!.id }),
    )
    expect(rows.credentialPayload?.provider).toBe(plan.providerId)
    expect(rows.modelPayloads[0]?.id).toBe(
      aiModelResource.buildId({
        id: 'test-model',
        isProvidedBy: plan.modelUpserts[0].isProvidedBy,
      }),
    )
    expect(rows.modelPayloads[0]?.isProvidedBy).toBe(plan.providerId)
  })
})
