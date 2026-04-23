import { appendFileSync } from 'node:fs'
import { resolveLinxRuntimeApiBaseUrl } from '@linx/models/client'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './default-model.js'

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

function withTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

export async function listRemoteModels(
  _session: unknown,
  runtimeUrl: string,
  apiKey: string,
  options: { fallback?: boolean; timeoutMs?: number } = {},
): Promise<RemoteModelSummary[]> {
  const url = `${resolveRuntimeBaseUrl(runtimeUrl)}/models`

  try {
    const response = await fetch(url, {
      signal: withTimeoutSignal(options.timeoutMs ?? 10_000),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
    }

    const bodyText = await response.text()
    let json: {
      data?: Array<{
        id: string
        provider?: string
        owned_by?: string
        context_window?: number
      }>
      error?: string
      message?: string
    }
    try {
      json = JSON.parse(bodyText) as typeof json
    } catch {
      throw new Error(`Invalid JSON response from ${url}: ${bodyText.slice(0, 200)}`)
    }

    if (Array.isArray(json.data)) {
      return json.data.map((model) => ({
        id: model.id,
        provider: model.provider,
        ownedBy: model.owned_by,
        contextWindow: model.context_window,
      }))
    }

    if (json.error || json.message) {
      throw new Error(`Runtime error from ${url}: ${json.message || json.error}`)
    }

    throw new Error(`Unexpected response from ${url}: ${bodyText.slice(0, 200)}`)
  } catch (error) {
    if (options.fallback === false) {
      throw error
    }
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
    return [{ id: DEFAULT_LINX_CLOUD_MODEL_ID }]
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
  const resolvedModel = model || DEFAULT_LINX_CLOUD_MODEL_ID
  const requestBody = {
    model: resolvedModel,
    stream: false,
    messages,
  }

  appendFileSync('/tmp/linx-chat-debug.log', `${JSON.stringify({
    at: new Date().toISOString(),
    url,
    body: requestBody,
  })}\n`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
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
