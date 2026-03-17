import { describe, expect, it } from 'vitest'
import { MODEL_PROVIDERS } from './constants'

describe('model-services provider metadata', () => {
  it('hydrates shared provider metadata from builtin discovery', () => {
    const anthropic = MODEL_PROVIDERS.find((provider) => provider.id === 'anthropic')
    const ollama = MODEL_PROVIDERS.find((provider) => provider.id === 'ollama')

    expect(anthropic).toMatchObject({
      id: 'anthropic',
      name: 'Anthropic',
      homeUrl: 'https://www.anthropic.com',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
    })
    expect(ollama).toMatchObject({
      id: 'ollama',
      name: 'Ollama',
      homeUrl: 'https://ollama.com',
      defaultBaseUrl: 'http://localhost:11434/v1',
    })
  })

  it('keeps web-specific docs and default models on top of discovery metadata', () => {
    const openai = MODEL_PROVIDERS.find((provider) => provider.id === 'openai')
    const zhipu = MODEL_PROVIDERS.find((provider) => provider.id === 'zhipu')

    expect(openai).toMatchObject({
      apiKeyUrl: 'https://platform.openai.com/api-keys',
      docsUrl: 'https://platform.openai.com/docs',
      modelsUrl: 'https://platform.openai.com/docs/models',
      defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    })
    expect(zhipu).toMatchObject({
      name: 'ZhiPu',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModels: ['glm-4', 'glm-4v', 'glm-3-turbo'],
    })
  })
})
