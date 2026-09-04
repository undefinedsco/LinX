import { MODEL_PROVIDERS, type ProviderDef } from '../domain/provider-catalog'

export interface Model {
  id: string
  name: string
  capabilities: string[]
  logo?: string
}

export interface ProviderModelGatewayOptions {
  apiBaseUrl: string
  authenticatedFetch: typeof fetch
}

interface GatewayCredentialResponse {
  credential?: {
    id?: string
  }
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

function formatGatewayModelListError(status: number, payload: unknown): string {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}
  const providerStatus = typeof record.providerStatus === 'number'
    ? record.providerStatus
    : undefined

  if (providerStatus !== undefined) return formatModelListError(providerStatus)
  if (status === 401 || status === 403) {
    return '当前空间授权已失效。请重新连接空间后重试。'
  }
  if (status === 404) {
    return '未找到已保存的模型凭据。请先保存 API Key 后重试。'
  }
  if (status === 429) {
    return '请求太频繁。请稍等一会儿再试。'
  }
  if (status >= 500) {
    return 'Xpod 模型服务暂时没有响应。请稍后重试。'
  }
  return '模型列表获取失败。请检查密钥、服务地址或网络后重试。'
}

async function discoverModelsThroughGateway(
  providerId: string,
  gateway: ProviderModelGatewayOptions,
): Promise<unknown> {
  const apiBaseUrl = new URL(gateway.apiBaseUrl).origin
  const endpoint = new URL(
    `/api/ai/gateway/providers/${encodeURIComponent(providerId)}/models/refresh`,
    apiBaseUrl,
  ).href
  const response = await gateway.authenticatedFetch(endpoint, {
    method: 'POST',
    credentials: 'omit',
    mode: 'cors',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: '{}',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(formatGatewayModelListError(response.status, payload))
  }
  return payload
}

export async function saveProviderApiKeyThroughGateway(
  providerId: string,
  apiKey: string,
  baseUrl: string | undefined,
  gateway: ProviderModelGatewayOptions,
): Promise<string> {
  const normalizedApiKey = apiKey.trim()
  if (!normalizedApiKey) throw new Error('请先填写 API Key 再验证连接')

  const apiBaseUrl = new URL(gateway.apiBaseUrl).origin
  const endpoint = new URL(
    `/api/ai/providers/${encodeURIComponent(providerId)}/credentials/api-key`,
    apiBaseUrl,
  ).href
  const response = await gateway.authenticatedFetch(endpoint, {
    method: 'POST',
    credentials: 'omit',
    mode: 'cors',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      apiKey: normalizedApiKey,
      ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
      priority: 0,
    }),
  })
  const payload = await response.json().catch(() => ({})) as GatewayCredentialResponse
  if (!response.ok) {
    throw new Error(formatGatewayModelListError(response.status, payload))
  }
  const credentialId = payload.credential?.id?.trim()
  if (!credentialId) throw new Error('Xpod 未返回已保存的模型凭据，请重试。')
  return credentialId
}

export const searchProviderModels = async (
  provider: ProviderDef | string,
  apiKey?: string,
  baseUrl?: string,
  query?: string,
  gateway?: ProviderModelGatewayOptions,
): Promise<Record<string, Model[]>> => {
  const providerDef = typeof provider === 'string' ? providerMap[provider] : provider
  const providerId = providerDef?.id || (typeof provider === 'string' ? provider : 'custom')

  if (providerId === 'undefineds' && !apiKey) {
    const models = (providerDef?.defaultModels || []).map((id) => ({
      id,
      name: id === 'linx-lite' ? 'LinX Lite' : id === 'linx' ? 'LinX' : id,
      capabilities: [],
    }))
    return { '平台内置': models }
  }

  if (!gateway && providerId !== 'ollama' && !apiKey) {
    throw new Error('请先填写 API Key 再搜索在线模型')
  }

  const endpoint = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/models`
    : providerDef?.modelsApi || `${(providerDef?.defaultBaseUrl || '').replace(/\/$/, '')}/models`

  const data = gateway
    ? await discoverModelsThroughGateway(providerId, gateway)
    : await (async () => {
        const res = await fetch(endpoint, {
          headers: buildHeaders(providerId, apiKey),
        })
        if (!res.ok) {
          await res.text().catch(() => '')
          console.warn('[ModelFetcher] Failed to fetch model list:', {
            providerId,
            status: res.status,
          })
          throw new Error(formatModelListError(res.status))
        }
        return res.json()
      })()
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
        logo: item?.image || item?.image_url,
      }
    })
    .filter(Boolean) as Model[]

  const filtered = query
    ? models.filter((m) => m.id.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase()))
    : models

  return { '在线获取': filtered }
}
