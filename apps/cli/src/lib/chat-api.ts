import { resolveLinxRuntimeApiBaseUrl } from '@linx/models/client'

export interface RemoteModelSummary {
  id: string
  provider?: string
  ownedBy?: string
  contextWindow?: number
}

export interface RemoteChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function resolveRuntimeBaseUrl(runtimeUrl: string): string {
  return resolveLinxRuntimeApiBaseUrl(runtimeUrl)
}

export async function listRemoteModels(
  _session: unknown,
  runtimeUrl: string,
  apiKey: string,
): Promise<RemoteModelSummary[]> {
  const url = `${resolveRuntimeBaseUrl(runtimeUrl)}/models`

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = (await response.json()) as {
      data?: Array<{
        id: string
        provider?: string
        owned_by?: string
        context_window?: number
      }>
    }

    return (json.data ?? []).map((model) => ({
      id: model.id,
      provider: model.provider,
      ownedBy: model.owned_by,
      contextWindow: model.context_window,
    }))
  } catch {
    return loadBuiltinModelFallback()
  }
}

async function loadBuiltinModelFallback(): Promise<RemoteModelSummary[]> {
  try {
    const discoveryModuleName = '@linx/models/discovery'
    const { getBuiltinModels } = await import(discoveryModuleName)
    return getBuiltinModels().map((model: { id: string; provider?: string; contextLength?: number }) => ({
      id: model.id,
      provider: model.provider,
      ownedBy: model.provider,
      contextWindow: model.contextLength,
    }))
  } catch {
    return [{ id: 'default' }]
  }
}

export async function createRemoteCompletion(options: {
  runtimeUrl: string
  apiKey: string
  model?: string
  messages: RemoteChatMessage[]
}): Promise<string> {
  const { runtimeUrl, apiKey, model, messages } = options
  const url = `${resolveRuntimeBaseUrl(runtimeUrl)}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'default',
      stream: false,
      messages,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Chat request failed (${response.status}): ${text || response.statusText}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>
      }
    }>
  }

  const content = json.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text || '')
      .join('')
      .trim()
  }

  throw new Error('Empty response from remote model')
}
