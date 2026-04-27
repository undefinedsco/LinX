import { resolveLinxRuntimeApiBaseUrl } from '@undefineds.co/models/client'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './default-model.js'

export interface RemoteModelSummary {
  id: string
  provider?: string
  ownedBy?: string
  contextWindow?: number
}

export type RemoteChatContent = string | Array<{ type?: string; text?: string; [key: string]: unknown }> | null

export interface RemoteChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface RemoteChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: RemoteChatContent
  tool_calls?: RemoteChatToolCall[]
  tool_call_id?: string
  name?: string
}

export interface RemoteChatTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: unknown
  }
}

export interface RemoteCompletionResult {
  content: string
  toolCalls: RemoteChatToolCall[]
  finishReason?: string | null
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
    const discoveryModuleName = '@undefineds.co/models/discovery'
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

export async function createRemoteCompletionResult(options: {
  runtimeUrl: string
  apiKey: string
  model?: string
  messages: RemoteChatMessage[]
  tools?: RemoteChatTool[]
}): Promise<RemoteCompletionResult> {
  const { runtimeUrl, apiKey, model, messages, tools } = options
  const url = `${resolveRuntimeBaseUrl(runtimeUrl)}/chat/completions`
  const resolvedModel = model || DEFAULT_LINX_CLOUD_MODEL_ID
  const requestBody: {
    model: string
    stream: false
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    tool_choice?: 'auto'
  } = {
    model: resolvedModel,
    stream: false,
    messages,
  }
  if (tools && tools.length > 0) {
    requestBody.tools = tools
    requestBody.tool_choice = 'auto'
  }

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
      finish_reason?: string | null
      message?: {
        content?: string | Array<{ type?: string; text?: string }> | null
        tool_calls?: RemoteChatToolCall[]
      }
    }>
  }

  const choice = json.choices?.[0]
  const message = choice?.message
  const content = normalizeRemoteContent(message?.content)
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []

  if (content || toolCalls.length > 0) {
    return {
      content,
      toolCalls,
      finishReason: choice?.finish_reason,
    }
  }

  throw new Error('Empty response from remote model')
}

export async function createRemoteCompletion(options: {
  runtimeUrl: string
  apiKey: string
  model?: string
  messages: RemoteChatMessage[]
  tools?: RemoteChatTool[]
}): Promise<string> {
  const result = await createRemoteCompletionResult(options)
  return result.content.trim()
}

function normalizeRemoteContent(content: string | Array<{ type?: string; text?: string }> | null | undefined): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text || '')
      .join('')
      .trim()
  }

  return ''
}
