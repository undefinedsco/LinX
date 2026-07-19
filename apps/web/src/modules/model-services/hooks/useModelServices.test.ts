import { describe, expect, it } from 'vitest'
import {
  aiModelResource,
  aiProviderResource,
  buildAIConfigMutationPlan,
  credentialResource,
} from '@undefineds.co/models'
import {
  buildModelServiceInsertRows,
  normalizeLiveQueryRows,
  recoverModelServiceProviderRows,
} from './useModelServices'

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
    expect(rows.modelPayloads[0]?.id).toBe(
      aiModelResource.buildId({
        id: 'test-model',
        isProvidedBy: plan.modelUpserts[0].isProvidedBy,
      }),
    )
    expect(rows.modelPayloads[0]?.isProvidedBy).toBe(plan.providerId)
  })
})
