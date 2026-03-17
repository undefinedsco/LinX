import { describe, expect, it } from 'vitest'
import {
  aiConfigModelUri,
  aiConfigProviderUri,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  getAIConfigProviderFamilyIds,
  normalizeAIConfigProviderId,
  sameAIConfigProviderFamily,
} from '../src/ai-config'

describe('ai-config shared core', () => {
  it('normalizes provider aliases to canonical ids', () => {
    expect(normalizeAIConfigProviderId('claude')).toBe('anthropic')
    expect(normalizeAIConfigProviderId('codex')).toBe('openai')
    expect(normalizeAIConfigProviderId('xai')).toBe('x-ai')
    expect(getAIConfigProviderFamilyIds('claude')).toEqual(['anthropic', 'claude'])
    expect(getAIConfigProviderFamilyIds('openai')).toEqual(['openai', 'codex'])
    expect(getAIConfigProviderFamilyIds('xai')).toEqual(['x-ai', 'xai'])
    expect(sameAIConfigProviderFamily('https://pod.example/settings/ai/providers.ttl#claude', 'anthropic')).toBe(true)
    expect(sameAIConfigProviderFamily('xai', 'https://pod.example/settings/ai/providers.ttl#x-ai')).toBe(true)
  })

  it('builds provider state from split AI config tables', () => {
    const states = buildAIConfigProviderStateMap({
      fallbackToCatalogModels: false,
      providerRows: [
        {
          id: 'anthropic',
          baseUrl: 'https://api.anthropic.com/v1',
          hasModel: '/settings/ai/models.ttl#claude-sonnet-4',
        },
      ],
      credentialRows: [
        {
          id: 'anthropic-default',
          provider: '/settings/ai/providers.ttl#claude',
          service: 'ai',
          status: 'active',
          apiKey: 'sk-ant-test',
        },
      ],
      modelRows: [
        {
          id: 'claude-sonnet-4',
          displayName: 'Claude Sonnet 4',
          isProvidedBy: '/settings/ai/providers.ttl#anthropic',
          status: 'active',
        },
      ],
    })

    expect(states.anthropic).toMatchObject({
      id: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com/v1',
      selectedModelId: 'claude-sonnet-4',
    })
    expect(states.anthropic?.models).toEqual([
      {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        enabled: true,
        capabilities: [],
        isCustom: true,
      },
    ])
  })

  it('creates a shared mutation plan for provider, credential, and model writes', () => {
    const plan = buildAIConfigMutationPlan({
      providerId: 'claude',
      currentProviderRows: [],
      currentCredentialRows: [],
      currentModelRows: [],
      updates: {
        enabled: true,
        apiKey: 'sk-ant-test',
        models: [
          {
            id: 'claude-sonnet-4',
            name: 'Claude Sonnet 4',
            enabled: true,
            capabilities: [],
          },
        ],
      },
    })

    expect(plan.providerId).toBe('anthropic')
    expect(plan.providerPayload).toMatchObject({
      id: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      hasModel: aiConfigModelUri('claude-sonnet-4'),
    })
    expect(plan.credentialPayload).toMatchObject({
      id: 'anthropic-default',
      provider: aiConfigProviderUri('anthropic'),
      service: 'ai',
      status: 'active',
      apiKey: 'sk-ant-test',
    })
    expect(plan.modelUpserts).toHaveLength(1)
    expect(plan.modelUpserts[0]).toMatchObject({
      id: 'claude-sonnet-4',
      displayName: 'Claude Sonnet 4',
      isProvidedBy: aiConfigProviderUri('anthropic'),
      status: 'active',
    })
    expect(plan.modelDeleteIds).toEqual([])
  })
})
