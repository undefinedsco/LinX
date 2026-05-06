import { resolveLinxRuntimeApiBaseUrl } from '@undefineds.co/models/client'
import { DEFAULT_LINX_CLOUD_MODEL_ID, FALLBACK_LINX_CLOUD_MODEL_IDS } from './default-model.js'

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
  reasoning_content?: string
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
  reasoningContent?: string
  toolCalls: RemoteChatToolCall[]
  finishReason?: string | null
  usage?: RemoteCompletionUsage
}

export interface RemoteCompletionUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
}

const DEFAULT_CHAT_TIMEOUT_MS = 10 * 60 * 1000

export class RemoteChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
    readonly authExpired: boolean = false,
  ) {
    super(message)
    this.name = 'RemoteChatRequestError'
  }
}

export function isRemoteAuthExpiredError(error: unknown): boolean {
  if (error instanceof RemoteChatRequestError) {
    return error.authExpired
  }
  if (typeof error === 'object' && error !== null && 'authExpired' in error && error.authExpired === true) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('linx cloud login expired')
    || normalized.includes('invalid solid token')
    || (normalized.includes('401') && normalized.includes('unauthorized'))
}

function resolveRuntimeBaseUrl(runtimeUrl: string): string {
  return resolveLinxRuntimeApiBaseUrl(runtimeUrl)
}

function withTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

function resolveChatTimeoutMs(): number {
  const raw = process.env.LINX_CHAT_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_CHAT_TIMEOUT_MS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHAT_TIMEOUT_MS
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
      throw buildRemoteChatRequestError(response.status, text || response.statusText, `Models request failed (${response.status})`)
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
        provider: normalizeRemoteModelProvider(model.id, model.provider),
        ownedBy: normalizeRemoteModelProvider(model.id, model.owned_by),
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

function normalizeRemoteModelProvider(modelId: string, provider: string | undefined): string | undefined {
  if (FALLBACK_LINX_CLOUD_MODEL_IDS.includes(modelId as typeof FALLBACK_LINX_CLOUD_MODEL_IDS[number])) {
    return 'undefineds'
  }

  return provider
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

  const timeoutMs = resolveChatTimeoutMs()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: withTimeoutSignal(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new RemoteChatRequestError(
        `LinX Cloud request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        0,
        error instanceof Error ? error.message : String(error),
      )
    }
    throw error
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw buildRemoteChatRequestError(response.status, text || response.statusText)
  }

  const json = (await response.json()) as {
    usage?: RemoteCompletionRawUsage
    choices?: Array<{
      finish_reason?: string | null
      usage?: RemoteCompletionRawUsage
      message?: {
        content?: string | Array<{ type?: string; text?: string }> | null
        reasoning_content?: string | null
        reasoning?: string | null
        reasoning_text?: string | null
        tool_calls?: RemoteChatToolCall[]
      }
    }>
  }

  const choice = json.choices?.[0]
  const message = choice?.message
  const content = normalizeRemoteContent(message?.content)
  const reasoningContent = normalizeRemoteReasoning(message)
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  const usage = normalizeRemoteUsage(json.usage ?? choice?.usage)

  if (content || reasoningContent || toolCalls.length > 0) {
    return {
      content,
      reasoningContent,
      toolCalls,
      finishReason: choice?.finish_reason,
      usage,
    }
  }

  throw new Error('Empty response from remote model')
}

function buildRemoteChatRequestError(
  status: number,
  responseBody: string,
  prefix = `Chat request failed (${status})`,
): RemoteChatRequestError {
  const authExpired = isInvalidSolidTokenResponse(status, responseBody)
  if (authExpired) {
    return new RemoteChatRequestError(
      'LinX Cloud login expired.',
      status,
      responseBody,
      true,
    )
  }
  if (isTimeoutResponse(status, responseBody)) {
    return new RemoteChatRequestError(
      `LinX Cloud request timed out upstream: ${extractRemoteErrorMessage(responseBody)}`,
      status,
      responseBody,
    )
  }

  return new RemoteChatRequestError(
    `${prefix}: ${responseBody}`,
    status,
    responseBody,
  )
}

function isTimeoutResponse(status: number, responseBody: string): boolean {
  const normalized = responseBody.toLowerCase()
  return status >= 500
    && normalized.includes('timeout')
    && normalized.includes('aborted')
}

function extractRemoteErrorMessage(responseBody: string): string {
  try {
    const parsed = JSON.parse(responseBody) as { error?: { message?: string } | string; message?: string }
    if (typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
      return parsed.error.message
    }
    if (typeof parsed.error === 'string') {
      return parsed.error
    }
    if (typeof parsed.message === 'string') {
      return parsed.message
    }
  } catch {
    // Fall through to a trimmed raw body.
  }
  return responseBody.slice(0, 300)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function isInvalidSolidTokenResponse(status: number, responseBody: string): boolean {
  if (status !== 401) {
    return false
  }
  const normalized = responseBody.toLowerCase()
  return normalized.includes('invalid solid token')
    || normalized.includes('unauthorized')
}

type RemoteCompletionRawUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: {
    cached_tokens?: number
    cache_write_tokens?: number
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
  }
}

function normalizeRemoteUsage(rawUsage: RemoteCompletionRawUsage | undefined): RemoteCompletionUsage | undefined {
  if (!rawUsage) {
    return undefined
  }

  const promptTokens = asNonNegativeNumber(rawUsage.prompt_tokens)
  const reportedCachedTokens = asNonNegativeNumber(rawUsage.prompt_tokens_details?.cached_tokens)
  const cacheWrite = asNonNegativeNumber(rawUsage.prompt_tokens_details?.cache_write_tokens)
  const cacheRead = cacheWrite > 0 ? Math.max(0, reportedCachedTokens - cacheWrite) : reportedCachedTokens
  const input = Math.max(0, promptTokens - cacheRead - cacheWrite)
  const output = asNonNegativeNumber(rawUsage.completion_tokens)
    + asNonNegativeNumber(rawUsage.completion_tokens_details?.reasoning_tokens)
  const computedTotal = input + output + cacheRead + cacheWrite

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: computedTotal || asNonNegativeNumber(rawUsage.total_tokens),
  }
}

function asNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
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

function normalizeRemoteReasoning(message: {
  reasoning_content?: string | null
  reasoning?: string | null
  reasoning_text?: string | null
} | null | undefined): string {
  for (const value of [message?.reasoning_content, message?.reasoning, message?.reasoning_text]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}
