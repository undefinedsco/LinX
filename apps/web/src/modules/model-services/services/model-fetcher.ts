import { MODEL_PROVIDERS, type ProviderDef } from '../constants'

export interface Model {
  id: string
  name: string
  capabilities: string[]
  logo?: string
}

const providerMap = Object.fromEntries(MODEL_PROVIDERS.map((p) => [p.id, p]))

const MOCK_PROVIDER_MODELS: Record<string, Record<string, Model[]>> = {
  openai: {
    'GPT-4o 系列': [
      { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['vision', 'function_calling'], logo: 'https://openai.com/favicon.ico' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', capabilities: ['function_calling'], logo: 'https://openai.com/favicon.ico' },
    ],
    'GPT-3.5 系列': [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', capabilities: [], logo: 'https://openai.com/favicon.ico' },
    ],
  },
  anthropic: {
    'Claude 3': [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', capabilities: ['vision'], logo: 'https://assets-global.website-files.com/646ff90f09097f3bdbd1b0b0/646ffc34f3c6e7d42937f1c6_anthropic%20favicon%20transparent.png' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', capabilities: ['vision'], logo: 'https://assets-global.website-files.com/646ff90f09097f3bdbd1b0b0/646ffc34f3c6e7d42937f1c6_anthropic%20favicon%20transparent.png' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', capabilities: [], logo: 'https://assets-global.website-files.com/646ff90f09097f3bdbd1b0b0/646ffc34f3c6e7d42937f1c6_anthropic%20favicon%20transparent.png' },
    ],
  },
  google: {
    'Gemini 1.5': [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', capabilities: ['vision', 'function_calling'], logo: 'https://ai.google.dev/static/favicon.png' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', capabilities: ['vision'], logo: 'https://ai.google.dev/static/favicon.png' },
    ],
  },
  deepseek: {
    'DeepSeek': [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', capabilities: ['function_calling'], logo: 'https://raw.githubusercontent.com/deepseek-ai/deepseek-coder/main/assets/logo.png' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', capabilities: [], logo: 'https://raw.githubusercontent.com/deepseek-ai/deepseek-coder/main/assets/logo.png' },
    ],
  },
  'x-ai': {
    'Grok': [
      { id: 'grok-2', name: 'Grok 2', capabilities: ['function_calling'], logo: 'https://x.ai/favicon.ico' },
      { id: 'grok-beta', name: 'Grok Beta', capabilities: [], logo: 'https://x.ai/favicon.ico' },
    ],
  },
  openrouter: {
    'OpenRouter': [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini (OR)', capabilities: ['function_calling'], logo: 'https://openrouter.ai/favicon.ico' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OR)', capabilities: ['vision'], logo: 'https://openrouter.ai/favicon.ico' },
    ],
  },
  minimax: {
    'MiniMax': [
      { id: 'abab6.5-chat', name: 'abab6.5 Chat', capabilities: [], logo: 'https://www.minimaxi.com/favicon.ico' },
      { id: 'abab6.5s-chat', name: 'abab6.5s Chat', capabilities: [], logo: 'https://www.minimaxi.com/favicon.ico' },
    ],
  },
  ollama: {
    '本地模型': [
      { id: 'llama3', name: 'llama3', capabilities: [], logo: 'https://ollama.com/public/ollama.png' },
      { id: 'mistral', name: 'mistral', capabilities: [], logo: 'https://ollama.com/public/ollama.png' },
    ],
  },
}

export const fetchModels = async (providerId: string, apiKey?: string, baseUrl?: string): Promise<Record<string, Model[]>> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800))
  
  if (MOCK_PROVIDER_MODELS[providerId]) {
    return MOCK_PROVIDER_MODELS[providerId]
  }
  
  return {
    'Custom': [
      { id: 'custom-model-1', name: 'Custom Model 1', capabilities: [] },
    ]
  }
}

/**
 * Online search against provider APIs (best-effort; requires apiKey).
 * Currently implemented for OpenAI (GET /models). Others fall back to mock.
 */
const normalizeId = (raw: string, providerId?: string) => {
  if (!raw) return ''
  if (providerId === 'google' && raw.startsWith('models/')) return raw.replace(/^models\//, '')
  return raw
}

const extractList = (data: any): any[] => {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.models)) return data.models
  if (Array.isArray(data.result)) return data.result
  if (data.models && Array.isArray(data.models.models)) return data.models.models
  return []
}

const normalizeCapabilities = (item: any): string[] => {
  if (Array.isArray(item?.capabilities)) return item.capabilities.filter(Boolean)
  if (Array.isArray(item?.capability)) return item.capability.filter(Boolean)
  return []
}

const isEmbedding = (id: string) => /embed/i.test(id)

const buildHeaders = (providerId: string, apiKey?: string) => {
  const headers: Record<string, string> = {}
  if (providerId === 'google') {
    if (apiKey) headers['x-goog-api-key'] = apiKey
  } else if (providerId !== 'ollama' && apiKey) {
    headers.authorization = `Bearer ${apiKey}`
  }
  return headers
}

export const searchProviderModels = async (
  provider: ProviderDef | string,
  apiKey?: string,
  baseUrl?: string,
  query?: string,
): Promise<Record<string, Model[]>> => {
  const providerDef = typeof provider === 'string' ? providerMap[provider] : provider
  const providerId = providerDef?.id || (typeof provider === 'string' ? provider : 'custom')

  if (providerId !== 'ollama' && !apiKey) {
    throw new Error('请先填写 API Key 再搜索在线模型')
  }

  const endpoint =
    providerDef?.modelsApi ||
    `${(baseUrl || providerDef?.defaultBaseUrl || '').replace(/\/$/, '')}/models`

  const res = await fetch(endpoint, {
    headers: buildHeaders(providerId, apiKey),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${providerDef?.name || providerId} 模型列表获取失败: ${res.status} ${text}`)
  }

  const data = await res.json()
  const rawItems = extractList(data)
  const models: Model[] = rawItems
    .map((item: any) => {
      const rawId = normalizeId(
        String(item?.id || item?.name || item?.model || item?.slug || item?.uid || ''),
        providerId,
      )
      if (!rawId) return null
      if (isEmbedding(rawId)) return null

      const name = String(item?.display_name || item?.displayName || item?.title || item?.name || rawId)
      const capabilities = normalizeCapabilities(item)
      return {
        id: rawId,
        name,
        capabilities,
        logo: item?.image || item?.image_url || providerDef?.avatar,
      }
    })
    .filter(Boolean) as Model[]

  const filtered = query
    ? models.filter((m) => m.id.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase()))
    : models

  return { '在线获取': filtered }
}
