import { type AssistantMessage, type AssistantMessageEventStream } from '@earendil-works/pi-ai'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './default-model.js'
import type { LinxCompletionBackendResult } from './linx-completion-backend.js'
import {
  LINX_CLOUD_PROVIDER_API,
  LINX_CLOUD_PROVIDER_ID,
} from './linx-cloud-models.js'

export function createLinxPiAssistantMessage(modelId?: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: LINX_CLOUD_PROVIDER_API,
    provider: LINX_CLOUD_PROVIDER_ID,
    model: modelId ?? DEFAULT_LINX_CLOUD_MODEL_ID,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

export function resolveLinxPiModelId(modelArg: unknown, overrideModelId?: string, fallbackModelId?: string): string {
  if (overrideModelId?.trim()) {
    return overrideModelId.trim()
  }

  if (typeof modelArg === 'object' && modelArg !== null && 'id' in modelArg) {
    const modelId = (modelArg as { id?: unknown }).id
    if (typeof modelId === 'string' && modelId.trim()) {
      return modelId.trim()
    }
  }

  if (fallbackModelId?.trim()) {
    return fallbackModelId.trim()
  }

  return DEFAULT_LINX_CLOUD_MODEL_ID
}

export function emitLinxCompletionResultToPiStream(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  reply: string | LinxCompletionBackendResult,
): void {
  const content = typeof reply === 'string' ? reply : reply.content ?? ''
  const toolCalls = typeof reply === 'string' ? [] : reply.toolCalls ?? []
  if (!isStringReply(reply) && reply.usage) {
    message.usage = {
      input: reply.usage.input,
      output: reply.usage.output,
      cacheRead: reply.usage.cacheRead,
      cacheWrite: reply.usage.cacheWrite,
      totalTokens: reply.usage.totalTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    }
  }

  if (content) {
    const contentIndex = message.content.length
    message.content.push({ type: 'text', text: '' })
    stream.push({ type: 'text_start', contentIndex, partial: { ...message } })
    message.content[contentIndex] = { type: 'text', text: content }
    stream.push({ type: 'text_delta', contentIndex, delta: content, partial: { ...message } })
    stream.push({ type: 'text_end', contentIndex, content, partial: { ...message } })
  }

  for (const toolCall of toolCalls) {
    const parsedArguments = parseToolArguments(toolCall.function.arguments)
    const contentIndex = message.content.length
    const piToolCall = {
      type: 'toolCall' as const,
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parsedArguments,
    }
    message.content.push(piToolCall)
    stream.push({ type: 'toolcall_start', contentIndex, partial: { ...message } })
    stream.push({
      type: 'toolcall_delta',
      contentIndex,
      delta: toolCall.function.arguments,
      partial: { ...message },
    })
    stream.push({
      type: 'toolcall_end',
      contentIndex,
      toolCall: piToolCall,
      partial: { ...message },
    })
  }

  const reason = toolCalls.length > 0 || (!isStringReply(reply) && reply.finishReason === 'tool_calls') ? 'toolUse' : 'stop'
  message.stopReason = reason
  stream.push({ type: 'done', reason, message })
}

function parseToolArguments(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input || '{}')
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isStringReply(reply: string | LinxCompletionBackendResult): reply is string {
  return typeof reply === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
