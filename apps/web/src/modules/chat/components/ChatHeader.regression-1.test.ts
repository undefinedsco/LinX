import { describe, expect, it } from 'vitest'
import { buildChatModelOptions } from './ChatHeader'

describe('ChatHeader model option recovery', () => {
  it('keeps the persisted model visible when its provider is not currently enabled', () => {
    const options = buildChatModelOptions({
      openai: {
        id: 'openai',
        name: 'OpenAI',
        enabled: false,
        models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', enabled: false, capabilities: [] }],
      } as any,
    }, 'openai', 'gpt-5.6-sol')

    expect(options).toEqual([{
      id: 'openai/gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      providerId: 'openai',
      providerName: 'OpenAI',
      capabilities: [],
    }])
  })

  it('does not duplicate a persisted model that is already enabled', () => {
    const options = buildChatModelOptions({
      openai: {
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        models: [{ id: 'gpt-4o', name: 'GPT-4o', enabled: true, capabilities: ['vision'] }],
      } as any,
    }, 'openai', 'gpt-4o')

    expect(options).toHaveLength(1)
    expect(options[0]?.id).toBe('openai/gpt-4o')
  })
})
