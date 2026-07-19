import { MODEL_PROVIDERS, type ProviderDef } from '../constants'

export interface Model {
  id: string
  name: string
  capabilities: string[]
  logo?: string
}

const providerMap = Object.fromEntries(MODEL_PROVIDERS.map((p) => [p.id, p]))

/**
 * Search models from the provider's real API surface.
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

const shouldUseServiceModelProxy = () =>
  typeof window !== 'undefined' && Boolean((window as any).__LINX_SERVICE__)

const fetchModelList = (endpoint: string, providerId: string, apiKey?: string) => {
  if (!shouldUseServiceModelProxy()) {
    return fetch(endpoint, {
      headers: buildHeaders(providerId, apiKey),
    })
  }

  return fetch('/api/model-services/models', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      providerId,
      endpoint,
      apiKey: apiKey || '',
    }),
  })
}

function formatModelListError(status: number): string {
  if (status === 401 || status === 403) {
    return '密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。'
  }

  if (status === 404) {
    return '模型服务地址不正确。请检查服务地址后重试。'
  }

  if (status === 429) {
    return '请求太频繁。请稍等一会儿再试。'
  }

  if (status >= 500) {
    return '模型服务暂时没有响应。请稍后重试。'
  }

  return '模型列表获取失败。请检查密钥、服务地址或网络后重试。'
}

export const searchProviderModels = async (
  provider: ProviderDef | string,
  apiKey?: string,
  baseUrl?: string,
  query?: string,
): Promise<Record<string, Model[]>> => {
  const providerDef = typeof provider === 'string' ? providerMap[provider] : provider
  const providerId = providerDef?.id || (typeof provider === 'string' ? provider : 'custom')

  if (providerId === 'undefineds' && !apiKey) {
    const models = (providerDef?.defaultModels || []).map((id) => ({
      id,
      name: id === 'linx-lite' ? 'LinX Lite' : id === 'linx' ? 'LinX' : id,
      capabilities: [],
      logo: providerDef?.avatar,
    }))
    return { '平台内置': models }
  }

  if (providerId !== 'ollama' && !apiKey) {
    throw new Error('请先填写 API Key 再搜索在线模型')
  }

  const configuredBaseUrl = (baseUrl || '').trim().replace(/\/$/, '')
  const defaultBaseUrl = (providerDef?.defaultBaseUrl || '').trim().replace(/\/$/, '')
  const endpoint = configuredBaseUrl
    ? providerId === 'ollama'
      ? `${configuredBaseUrl.replace(/\/v1$/, '')}/api/tags`
      : `${configuredBaseUrl}/models`
    : providerDef?.modelsApi || `${defaultBaseUrl}/models`

  const res = await fetchModelList(endpoint, providerId, apiKey)
  if (!res.ok) {
    const text = await res.text()
    console.warn('[ModelFetcher] Failed to fetch model list:', {
      providerId,
      status: res.status,
      body: text.slice(0, 500),
    })
    throw new Error(formatModelListError(res.status))
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
