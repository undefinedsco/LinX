/**
 * AI Provider Adapters
 * 
 * 不同的 AI 供应商有不同的 API 格式，这里提供统一的接口
 */

import {
  getAIConfigDefaultBaseUrl,
  normalizeAIConfigProviderId,
} from '@linx/models'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamCallbacks {
  onContent: (content: string) => void
  onThought?: (thought: string) => void
  onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void
  onError: (error: Error) => void
  onDone: () => void
}

export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  model: string
  systemPrompt?: string
}

export interface ProviderAdapter {
  name: string
  streamChat: (
    messages: ChatMessage[],
    config: ProviderConfig,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ) => Promise<void>
}

function joinApiPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

// ============================================================================
// OpenAI Compatible Provider (OpenAI, DeepSeek, X.AI, etc.)
// ============================================================================

const createOpenAIAdapter = (defaultBaseUrl: string): ProviderAdapter => ({
  name: 'openai-compatible',
  async streamChat(messages, config, callbacks, signal) {
    const baseUrl = config.baseUrl || defaultBaseUrl
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`

    const apiMessages = config.systemPrompt
      ? [{ role: 'system' as const, content: config.systemPrompt }, ...messages]
      : messages

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: apiMessages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API Error ${response.status}: ${text.slice(0, 200)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta

              if (delta?.content) {
                fullContent += delta.content
                callbacks.onContent(fullContent)
              }

              // DeepSeek R1 reasoning
              if (delta?.reasoning_content && callbacks.onThought) {
                callbacks.onThought(delta.reasoning_content)
              }

              // Tool calls
              if (delta?.tool_calls && callbacks.onToolCall) {
                for (const tc of delta.tool_calls) {
                  callbacks.onToolCall({
                    id: tc.id || `tool-${tc.index}`,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  })
                }
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
      callbacks.onDone()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        callbacks.onDone()
      } else {
        callbacks.onError(error as Error)
      }
    }
  },
})

// ============================================================================
// Anthropic Provider
// ============================================================================

const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',
  async streamChat(messages, config, callbacks, signal) {
    const baseUrl = config.baseUrl || getAIConfigDefaultBaseUrl('anthropic') || 'https://api.anthropic.com/v1'
    const endpoint = joinApiPath(baseUrl, 'messages')

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        system: config.systemPrompt,
        messages: anthropicMessages,
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Anthropic Error ${response.status}: ${text.slice(0, 200)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              
              // Anthropic stream events
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta
                if (delta?.type === 'text_delta' && delta.text) {
                  fullContent += delta.text
                  callbacks.onContent(fullContent)
                }
                // Anthropic thinking blocks
                if (delta?.type === 'thinking_delta' && delta.thinking && callbacks.onThought) {
                  callbacks.onThought(delta.thinking)
                }
              }
              
              // Tool use
              if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                if (callbacks.onToolCall) {
                  callbacks.onToolCall({
                    id: parsed.content_block.id,
                    name: parsed.content_block.name,
                    arguments: '',
                  })
                }
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
      callbacks.onDone()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        callbacks.onDone()
      } else {
        callbacks.onError(error as Error)
      }
    }
  },
}

// ============================================================================
// Provider Registry
// ============================================================================

const openaiAdapter = createOpenAIAdapter(getAIConfigDefaultBaseUrl('openai') || 'https://api.openai.com/v1')
const deepseekAdapter = createOpenAIAdapter(getAIConfigDefaultBaseUrl('deepseek') || 'https://api.deepseek.com/v1')
const xaiAdapter = createOpenAIAdapter(getAIConfigDefaultBaseUrl('x-ai') || 'https://api.x.ai/v1')
const groqAdapter = createOpenAIAdapter(getAIConfigDefaultBaseUrl('groq') || 'https://api.groq.com/openai/v1')
const togetherAdapter = createOpenAIAdapter('https://api.together.xyz/v1')
const openrouterAdapter = createOpenAIAdapter(getAIConfigDefaultBaseUrl('openrouter') || 'https://openrouter.ai/api/v1')

export const providerAdapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  'x-ai': xaiAdapter,
  groq: groqAdapter,
  together: togetherAdapter,
  openrouter: openrouterAdapter,
}

export function getProviderAdapter(provider: string): ProviderAdapter {
  const normalizedProvider = normalizeAIConfigProviderId(provider)
  return providerAdapters[normalizedProvider] || openaiAdapter
}
