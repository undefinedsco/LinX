export interface RuntimeModelConfig {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  proxyUrl: string
  loaded: boolean
}

const RUNTIME_MODEL_CONFIG_TIMEOUT_MS = 3_000
export const FALLBACK_RUNTIME_MODEL_CONFIG: RuntimeModelConfig = {
  provider: 'openai',
  model: 'gpt-5.5',
  baseUrl: '',
  apiKey: '',
  proxyUrl: '',
  loaded: false,
}

export function getLocalXpodAdminBaseUrl() {
  return (import.meta.env.VITE_LINX_LOCAL_XPOD_URL?.trim() || 'http://localhost:5737').replace(/\/$/, '')
}

export async function fetchRuntimeModelConfig(): Promise<RuntimeModelConfig> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error('xpod config request timed out'))
  }, RUNTIME_MODEL_CONFIG_TIMEOUT_MS)

  try {
    const response = await fetch(`${getLocalXpodAdminBaseUrl()}/api/admin/config`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`xpod config: HTTP ${response.status}`)
    }

    const data = await response.json() as { env?: Record<string, string> }
    const env = data.env ?? {}
    return {
      provider: env.DEFAULT_PROVIDER || '',
      model: env.DEFAULT_MODEL || '',
      baseUrl: env.DEFAULT_API_BASE || '',
      apiKey: env.DEFAULT_API_KEY || '',
      proxyUrl: env.DEFAULT_PROXY_URL || '',
      loaded: true,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function saveRuntimeModelConfig(config: RuntimeModelConfig) {
  const response = await fetch(`${getLocalXpodAdminBaseUrl()}/api/admin/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      env: {
        DEFAULT_PROVIDER: config.provider.trim(),
        DEFAULT_MODEL: config.model.trim(),
        DEFAULT_API_BASE: config.baseUrl.trim(),
        DEFAULT_API_KEY: config.apiKey.trim(),
        DEFAULT_PROXY_URL: config.proxyUrl.trim(),
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`xpod config save failed: HTTP ${response.status} ${text.slice(0, 160)}`)
  }
}

export async function restartRuntimeXpod() {
  const response = await fetch(`${getLocalXpodAdminBaseUrl()}/api/admin/restart`, {
    method: 'POST',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`xpod restart failed: HTTP ${response.status} ${text.slice(0, 160)}`)
  }
}
