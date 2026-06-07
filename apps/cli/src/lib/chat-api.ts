import { setTimeout as delay } from 'node:timers/promises'
import { resolveLinxRuntimeApiBaseUrl } from '@undefineds.co/models/client'
import { DEFAULT_LINX_CLOUD_MODEL_ID, FALLBACK_LINX_CLOUD_MODEL_IDS } from './default-model.js'
import {
  formatLinxCloudTransientMessage,
  normalizeMisclassifiedCloudCompletionPodTimeoutMessage,
} from './linx-cloud-errors.js'

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

export type RemoteAuthFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface RemoteAuthSessionLike {
  runtimeFetch?: RemoteAuthFetch
  fetch?: RemoteAuthFetch
}

export interface RemoteAuthSessionOptions {
  authSession?: RemoteAuthSessionLike
  authFetch?: RemoteAuthFetch
  apiKey?: string
}

const DEFAULT_CHAT_TIMEOUT_MS = 10 * 60 * 1000
const REMOTE_CHAT_RETRY_DELAYS_MS = [100, 500, 1_000] as const
const TRANSIENT_REMOTE_STATUS_CODES = new Set([502, 503, 504])

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

function withTimeoutSignal(timeoutMs: number, signal?: AbortSignal): {
  signal: AbortSignal
  timeoutSignal: AbortSignal
} {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!signal) {
    return { signal: timeoutSignal, timeoutSignal }
  }

  const anySignal = typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, timeoutSignal])
    : combineAbortSignals(signal, timeoutSignal)

  return { signal: anySignal, timeoutSignal }
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
  authSession: RemoteAuthSessionLike | RemoteAuthFetch,
  runtimeUrl: string,
  optionsOrApiKey: { fallback?: boolean; timeoutMs?: number } | string = {},
  maybeOptions: { fallback?: boolean; timeoutMs?: number } = {},
): Promise<RemoteModelSummary[]> {
  const url = `${resolveRuntimeBaseUrl(runtimeUrl)}/models`
  const options = typeof optionsOrApiKey === 'string' ? maybeOptions : optionsOrApiKey
  const authFetch = resolveRemoteAuthFetch(authSession, typeof optionsOrApiKey === 'string' ? optionsOrApiKey : undefined)
  const timeoutMs = options.timeoutMs ?? 30_000

  try {
    const response = await authFetch(url, {
      signal: withTimeoutSignal(timeoutMs).signal,
      headers: {
        Accept: 'application/json',
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
    if (isAbortError(error)) {
      throw new RemoteChatRequestError(
        `LinX Cloud models request timed out after ${formatTimeoutSeconds(timeoutMs)}s.`,
        0,
        error instanceof Error ? error.message : String(error),
      )
    }
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
  authSession?: RemoteAuthSessionLike | RemoteAuthFetch
  authFetch?: RemoteAuthFetch
  apiKey?: string
  model?: string
  messages: RemoteChatMessage[]
  tools?: RemoteChatTool[]
  signal?: AbortSignal
}): Promise<RemoteCompletionResult> {
  const { runtimeUrl, model, messages, tools } = options
  const authFetch = resolveRemoteAuthFetch(options.authSession ?? options.authFetch, options.apiKey)
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
  const abortSignals = withTimeoutSignal(timeoutMs, options.signal)

  try {
    for (let attempt = 0; attempt <= REMOTE_CHAT_RETRY_DELAYS_MS.length; attempt += 1) {
      let response: Response
      try {
        response = await authFetch(url, {
          method: 'POST',
          signal: abortSignals.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(requestBody),
        })
      } catch (error) {
        if (isAbortError(error)) {
          if (options.signal?.aborted) {
            throw new RemoteChatRequestError(
              'LinX Cloud request aborted by user.',
              0,
              error instanceof Error ? error.message : String(error),
            )
          }
          throw new RemoteChatRequestError(
            formatLinxCloudTransientMessage(`Request exceeded ${formatTimeoutSeconds(timeoutMs)}s.`),
            0,
            error instanceof Error ? error.message : String(error),
          )
        }
        const misclassifiedRuntimeTimeout = normalizeMisclassifiedPodRuntimeTimeout(error)
        if (misclassifiedRuntimeTimeout) {
          throw misclassifiedRuntimeTimeout
        }
        const transientFailure = normalizeTransientRemoteFailure(error)
        if (transientFailure && shouldRetryRemoteChatAttempt(attempt)) {
          await delay(REMOTE_CHAT_RETRY_DELAYS_MS[attempt]!, undefined, { signal: abortSignals.signal })
          continue
        }
        if (transientFailure) {
          throw transientFailure
        }
        const nonRetryableRemoteFailure = normalizeNonRetryableRemoteFailure(error)
        if (nonRetryableRemoteFailure) {
          throw nonRetryableRemoteFailure
        }
        throw error
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const responseBody = text || response.statusText
        if (shouldRetryRemoteChatResponse(response.status, responseBody) && shouldRetryRemoteChatAttempt(attempt)) {
          await delay(REMOTE_CHAT_RETRY_DELAYS_MS[attempt]!, undefined, { signal: abortSignals.signal })
          continue
        }
        throw buildRemoteChatRequestError(response.status, responseBody)
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
    throw new Error('Empty response from remote model')
  } catch (error) {
    if (isAbortError(error)) {
      if (options.signal?.aborted) {
        throw new RemoteChatRequestError(
          'LinX Cloud request aborted by user.',
          0,
          error instanceof Error ? error.message : String(error),
        )
      }
      throw new RemoteChatRequestError(
        formatLinxCloudTransientMessage(`Request exceeded ${formatTimeoutSeconds(timeoutMs)}s.`),
        0,
        error instanceof Error ? error.message : String(error),
      )
    }
    const misclassifiedRuntimeTimeout = normalizeMisclassifiedPodRuntimeTimeout(error)
    if (misclassifiedRuntimeTimeout) {
      throw misclassifiedRuntimeTimeout
    }
    throw error
  }
}

function shouldRetryRemoteChatAttempt(attempt: number): boolean {
  return attempt < REMOTE_CHAT_RETRY_DELAYS_MS.length
}

function formatTimeoutSeconds(timeoutMs: number): number {
  return Math.max(1, Math.round(timeoutMs / 1000))
}

function combineAbortSignals(signal: AbortSignal, timeoutSignal: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  if (signal.aborted || timeoutSignal.aborted) {
    abort()
  } else {
    signal.addEventListener('abort', abort, { once: true })
    timeoutSignal.addEventListener('abort', abort, { once: true })
  }

  return controller.signal
}

function buildRemoteChatRequestError(
  status: number,
  responseBody: string,
  prefix = `Chat request failed (${status})`,
): RemoteChatRequestError {
  const upstreamMessage = extractRemoteErrorMessage(responseBody, status).trim() || fallbackRemoteErrorMessage(status)
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
      formatLinxCloudTransientMessage('Upstream did not return in time.'),
      status,
      responseBody,
    )
  }

  if (shouldRetryRemoteChatResponse(status, responseBody)) {
    return new RemoteChatRequestError(
      formatLinxCloudTransientMessage(),
      status,
      responseBody,
    )
  }

  if (isCloudFetchFailedResponse(status, responseBody)) {
    return new RemoteChatRequestError(
      formatLinxCloudTransientMessage(),
      status,
      responseBody,
    )
  }

  return new RemoteChatRequestError(
    `${prefix}: ${upstreamMessage}`,
    status,
    responseBody,
  )
}

function shouldRetryRemoteChatResponse(status: number, responseBody: string): boolean {
  if (TRANSIENT_REMOTE_STATUS_CODES.has(status)) {
    return true
  }

  const normalized = responseBody.toLowerCase()
  return status >= 500 && (
    normalized.includes('service unavailable')
    || normalized.includes('bad gateway')
    || normalized.includes('gateway timeout')
    || normalized.includes('temporarily unavailable')
  )
}

function normalizeTransientRemoteFailure(error: unknown): RemoteChatRequestError | null {
  const status = resolveTransientRemoteStatus(error)
  if (status === null) {
    return null
  }

  if (error instanceof RemoteChatRequestError && error.status === status) {
    return error
  }

  const responseBody = error instanceof Error ? error.message : String(error)
  return new RemoteChatRequestError(
    formatLinxCloudTransientMessage(),
    status,
    responseBody,
  )
}

function normalizeNonRetryableRemoteFailure(error: unknown): RemoteChatRequestError | null {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('500') && normalized.includes('fetch failed')) {
    return new RemoteChatRequestError(
      formatLinxCloudTransientMessage(),
      500,
      message,
    )
  }
  if (normalized.includes('500') && normalized.includes('outgoing request timed out')) {
    return new RemoteChatRequestError(
      formatLinxCloudTransientMessage('Upstream did not return in time.'),
      500,
      message,
    )
  }
  return null
}

function normalizeMisclassifiedPodRuntimeTimeout(error: unknown): RemoteChatRequestError | null {
  const normalized = normalizeMisclassifiedCloudCompletionPodTimeoutMessage(error)
  if (!normalized) {
    return null
  }

  return new RemoteChatRequestError(
    normalized,
    0,
    error instanceof Error ? error.message : String(error),
  )
}

function resolveTransientRemoteStatus(error: unknown): number | null {
  if (error instanceof RemoteChatRequestError && !error.authExpired && TRANSIENT_REMOTE_STATUS_CODES.has(error.status)) {
    return error.status
  }

  if (typeof error === 'object' && error !== null) {
    const statusCandidates = [
      (error as { status?: unknown }).status,
      (error as { response?: { status?: unknown } }).response?.status,
      (error as { cause?: { status?: unknown } }).cause?.status,
    ]

    for (const candidate of statusCandidates) {
      if (typeof candidate === 'number' && TRANSIENT_REMOTE_STATUS_CODES.has(candidate)) {
        return candidate
      }
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('502') && normalized.includes('bad gateway')) {
    return 502
  }
  if (normalized.includes('503') && normalized.includes('service unavailable')) {
    return 503
  }
  if (normalized.includes('504') && normalized.includes('gateway timeout')) {
    return 504
  }
  if (normalized.includes('expected 200 ok') && normalized.includes('bad gateway')) {
    return 502
  }
  return null
}

function isCloudFetchFailedResponse(status: number, responseBody: string): boolean {
  return status >= 500 && responseBody.toLowerCase().includes('fetch failed')
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`
  return normalized.replace(/\/{2,}/g, '/')
}

function isTimeoutResponse(status: number, responseBody: string): boolean {
  const normalized = responseBody.toLowerCase()
  if (status < 500) {
    return false
  }

  return (normalized.includes('timeout') && normalized.includes('aborted'))
    || normalized.includes('outgoing request timed out')
}

function extractRemoteErrorMessage(responseBody: string, status: number): string {
  const trimmed = responseBody.trim()
  if (!trimmed) {
    return fallbackRemoteErrorMessage(status)
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: string } | string; message?: string }
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
    // Fall through to sanitized plain text handling.
  }

  if (isHtmlResponseBody(trimmed)) {
    return fallbackRemoteErrorMessage(status)
  }

  return trimmed.slice(0, 300)
}

function isHtmlResponseBody(responseBody: string): boolean {
  const normalized = responseBody.slice(0, 500).toLowerCase()
  return normalized.startsWith('<!doctype html')
    || normalized.startsWith('<html')
    || normalized.includes('<body')
    || normalized.includes('</html>')
}

function fallbackRemoteErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Forbidden'
    case 404:
      return 'Not Found'
    case 502:
      return 'Bad Gateway'
    case 503:
      return 'Service Unavailable'
    case 504:
      return 'Gateway Timeout'
    default:
      return status >= 500 ? 'Service Unavailable' : `HTTP ${status}`
  }
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
  authSession?: RemoteAuthSessionLike | RemoteAuthFetch
  authFetch?: RemoteAuthFetch
  apiKey?: string
  model?: string
  messages: RemoteChatMessage[]
  tools?: RemoteChatTool[]
  signal?: AbortSignal
}): Promise<string> {
  const result = await createRemoteCompletionResult(options)
  return result.content.trim()
}

function resolveRemoteAuthFetch(sessionOrFetch?: RemoteAuthSessionLike | RemoteAuthFetch, apiKey?: string): RemoteAuthFetch {
  if (typeof sessionOrFetch === 'function') {
    return sessionOrFetch
  }
  if (sessionOrFetch?.runtimeFetch) {
    return sessionOrFetch.runtimeFetch
  }
  if (sessionOrFetch?.fetch) {
    return sessionOrFetch.fetch
  }
  if (apiKey) {
    return buildBearerAuthFetch(apiKey)
  }
  throw new Error('Remote auth fetch is required.')
}

function buildBearerAuthFetch(apiKey: string): RemoteAuthFetch {
  return async (url, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    return fetch(url, { ...init, headers })
  }
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
