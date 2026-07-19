import { describe, expect, it } from 'vitest'
import { buildChatModelOptions, resolveDefaultChatModelSelection } from './model-options'
import type { AIProvider } from '@/modules/model-services/types'

function provider(input: Partial<AIProvider> & Pick<AIProvider, 'id' | 'name'>): AIProvider {
  return {
    enabled: true,
    models: [],
    ...input,
  } as AIProvider
}

describe('chat model options', () => {
  it('only exposes models from enabled model services', () => {
    const options = buildChatModelOptions({
      openai22: provider({
        id: 'openai22',
        name: 'OpenAI22',
        enabled: true,
        models: [{ id: 'gpt-5.4-mini', name: 'gpt-5.4-mini', enabled: true, capabilities: [] }],
      }),
      disabled: provider({
        id: 'disabled',
        name: 'Disabled',
        enabled: false,
        models: [{ id: 'disabled-model', name: 'Disabled Model', enabled: true, capabilities: [] }],
      }),
    })

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: 'openai22', id: 'gpt-5.4-mini' }),
      expect.objectContaining({ providerId: 'undefineds', id: 'linx-lite' }),
    ]))
    expect(options.some((option) => option.providerId === 'disabled')).toBe(false)
  })

  it('does not choose a disabled provider as the default chat model', () => {
    const providers = {
      disabled: provider({
        id: 'disabled',
        name: 'Disabled',
        enabled: false,
        selectedModelId: 'disabled-model',
        models: [{ id: 'disabled-model', name: 'Disabled Model', enabled: true, capabilities: [] }],
      }),
    }
    const options = buildChatModelOptions(providers)

    expect(resolveDefaultChatModelSelection(providers, options)).toEqual({
      provider: 'undefineds',
      model: 'linx-lite',
    })
  })
})
