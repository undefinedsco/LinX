import { describe, expect, it } from 'vitest'
import {
  mapVercelOwnerToProviderId,
  mergeVercelModelsIntoDiscovery,
  normalizeVercelModelEntry,
  updateDiscoveryModelRegistry,
  type VercelModelCatalogResponse,
} from '../src/discovery/vercel'
import type { DiscoveryRegistry, ModelMetadata } from '../src/discovery'

describe('vercel discovery sync', () => {
  it('maps Vercel owners to supported canonical providers', () => {
    expect(mapVercelOwnerToProviderId('xai')).toBe('x-ai')
    expect(mapVercelOwnerToProviderId('moonshotai')).toBe('moonshot')
    expect(mapVercelOwnerToProviderId('zai')).toBe('zhipu')
    expect(mapVercelOwnerToProviderId('unknown')).toBe('')
  })

  it('normalizes a Vercel language model into shared discovery metadata', () => {
    const normalized = normalizeVercelModelEntry(
      {
        id: 'anthropic/claude-3.5-sonnet',
        owned_by: 'anthropic',
        name: 'Claude 3.5 Sonnet',
        description: 'Coding and agentic tasks',
        context_window: 200000,
        max_tokens: 8192,
        type: 'language',
        tags: ['tool-use', 'vision'],
        pricing: {
          input: '0.000003',
          output: '0.000015',
        },
      },
      { anthropic: 'anthropic/claude-3.5-sonnet' },
    )

    expect(normalized).toEqual({
      id: 'anthropic/claude-3.5-sonnet',
      provider: 'anthropic',
      displayName: 'Claude 3.5 Sonnet',
      description: 'Coding and agentic tasks',
      contextLength: 200000,
      maxOutputTokens: 8192,
      capabilities: ['chat', 'vision', 'function-calling', 'streaming'],
      pricing: {
        input: 0.000003,
        output: 0.000015,
      },
      isDefault: true,
    })
  })

  it('replaces synced providers while preserving local-only providers', () => {
    const currentModels: ModelMetadata[] = [
      {
        id: 'openai/gpt-4o-mini',
        provider: 'openai',
        displayName: 'GPT-4o Mini',
      },
      {
        id: 'openai/gpt-4o',
        provider: 'openai',
        displayName: 'GPT-4o',
        isDefault: true,
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        provider: 'openrouter',
        displayName: 'Claude 3.5 Sonnet (OR)',
      },
      {
        id: 'llama3',
        provider: 'ollama',
        displayName: 'llama3',
      },
    ]

    const merged = mergeVercelModelsIntoDiscovery(currentModels, [
      {
        id: 'openai/gpt-4.1',
        owned_by: 'openai',
        name: 'GPT-4.1',
        type: 'language',
      },
      {
        id: 'openai/gpt-4o',
        owned_by: 'openai',
        name: 'GPT-4o',
        type: 'language',
      },
    ], {
      openai: 'openai/gpt-4o',
    })

    expect(merged).toEqual([
      {
        id: 'llama3',
        provider: 'ollama',
        displayName: 'llama3',
      },
      {
        id: 'openai/gpt-4o',
        provider: 'openai',
        displayName: 'GPT-4o',
        description: undefined,
        contextLength: undefined,
        maxOutputTokens: undefined,
        capabilities: ['chat', 'streaming'],
        pricing: { input: 0, output: 0 },
        isDefault: true,
      },
      {
        id: 'openai/gpt-4.1',
        provider: 'openai',
        displayName: 'GPT-4.1',
        description: undefined,
        contextLength: undefined,
        maxOutputTokens: undefined,
        capabilities: ['chat', 'streaming'],
        pricing: { input: 0, output: 0 },
        isDefault: undefined,
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        provider: 'openrouter',
        displayName: 'Claude 3.5 Sonnet (OR)',
      },
    ])
  })

  it('updates discovery registry metadata and model list', () => {
    const currentRegistry: DiscoveryRegistry = {
      version: '1.0.0',
      updatedAt: '2024-12-14',
      providers: [],
      models: [
        {
          id: 'llama3',
          provider: 'ollama',
          displayName: 'llama3',
        },
      ],
    }
    const upstream: VercelModelCatalogResponse = {
      object: 'list',
      data: [
        {
          id: 'xai/grok-4',
          owned_by: 'xai',
          name: 'Grok 4',
          type: 'language',
          tags: ['reasoning', 'tool-use', 'vision'],
        },
      ],
    }

    expect(updateDiscoveryModelRegistry(currentRegistry, upstream, '2026-03-16', {
      'x-ai': 'xai/grok-4',
    })).toEqual({
      version: '1.0.0',
      updatedAt: '2026-03-16',
      providers: [],
      models: [
        {
          id: 'llama3',
          provider: 'ollama',
          displayName: 'llama3',
        },
        {
          id: 'xai/grok-4',
          provider: 'x-ai',
          displayName: 'Grok 4',
          description: undefined,
          contextLength: undefined,
          maxOutputTokens: undefined,
          capabilities: ['chat', 'vision', 'function-calling', 'streaming'],
          pricing: { input: 0, output: 0 },
          isDefault: true,
        },
      ],
    })
  })
})
