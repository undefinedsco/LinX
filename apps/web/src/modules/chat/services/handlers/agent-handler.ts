/**
 * Agent Chat Handler
 *
 * @deprecated 已被 @openai/chatkit-react SDK 替代。
 * ChatKit SDK 内部处理 AI 对话、流式响应、工具调用等。
 * 保留此文件以备回退，将在稳定后移除。
 *
 * @see docs/feature-plan/wave-a/03-xpod-client-core.md
 *
 * Handles AI assistant conversations:
 * - Outgoing: Save user message, call xpod API
 * - Incoming: Stream AI response, save to Pod
 */

import {
  messageRepository,
  chatRepository,
  resolveRowId,
  type MessageInsert,
} from '@linx/models'
import type {
  ChatHandler,
  ChatHandlerContext,
  ChatCapabilities,
  OutgoingStrategy,
  IncomingStrategy,
  OutgoingMessage,
  IncomingMessage,
  SendResult,
  SendStatus,
} from '../types'

class AgentOutgoingStrategy implements OutgoingStrategy {
  private abortController: AbortController | null = null

  constructor(private ctx: ChatHandlerContext) {}

  onSendStatusChange?: (status: SendStatus) => void

  canSend(): boolean {
    return true
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    const { db, chatId, agent, session } = this.ctx

    if (!agent) {
      return { success: false, error: 'No agent configuration found' }
    }

    try {
      this.onSendStatusChange?.('sending')
      const podBaseUrl = session.podUrl.replace(/\/$/, '')
      const chatUri = `${podBaseUrl}/.data/chat/${chatId}/index.ttl#this`
      const threadUri = `${podBaseUrl}/.data/chat/${chatId}/index.ttl#${chatId}`

      const userMsgInput: MessageInsert = {
        chat: chatUri,
        thread: threadUri,
        maker: session.webId,
        role: 'user',
        content: message.content,
        status: 'sent',
        createdAt: new Date(),
      }

      const userMsg = await messageRepository.create!(db, userMsgInput)
      const userMsgId = resolveRowId(userMsg)

      await chatRepository.update!(db, chatId, {
        lastActiveAt: new Date(),
        lastMessageId: userMsgId ?? undefined,
        lastMessagePreview: message.content.slice(0, 100),
      })

      this.ctx.invalidateQueries([
        ['threads', chatId, 'messages'],
        ['chats'],
      ])

      this.onSendStatusChange?.('sent')

      return {
        success: true,
        messageId: userMsgId ?? undefined,
      }
    } catch (error) {
      this.onSendStatusChange?.('failed')
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send failed',
      }
    }
  }

  abort(): void {
    this.abortController?.abort()
  }
}

class AgentIncomingStrategy implements IncomingStrategy {
  private abortController: AbortController | null = null
  private isStreaming = false

  constructor(private ctx: ChatHandlerContext) {}

  onMessage?: (message: IncomingMessage) => void
  onStreamingChunk?: (chunk: string, messageId?: string) => void
  onStreamingThought?: (chunk: string, messageId?: string) => void
  onStreamingComplete?: (messageId: string) => void

  canReceive(): boolean {
    return true
  }

  subscribe(): () => void {
    return () => {
      this.abort()
    }
  }

  async triggerResponse(userMessage: string, history: Array<{ role: string; content: string }> = []): Promise<void> {
    const { db, chatId, contact, agent, session } = this.ctx

    if (!agent) {
      throw new Error('No agent configuration found')
    }

    this.isStreaming = true
    this.abortController = new AbortController()

    try {
      const { podUrl, fetch: authFetch } = session
      if (!podUrl) {
        throw new Error('Missing podUrl in session context')
      }

      const provider = (agent.provider || '').trim()
      const model = (agent.model || '').trim()
      if (!provider || !model) {
        throw new Error('Agent provider/model is not configured')
      }

      const modelRef = model.startsWith(`${provider}/`) ? model : `${provider}/${model}`
      const endpoint = `${podUrl.replace(/\/$/, '')}/v1/chat/completions`
      const apiMessages = [
        ...(agent.instructions ? [{ role: 'system', content: agent.instructions }] : []),
        ...history,
        { role: 'user', content: userMessage },
      ]

      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelRef,
          messages: apiMessages,
          max_tokens: 2048,
          temperature: agent.temperature ?? 0.7,
          stream: true,
        }),
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`xpod API error ${response.status}: ${text.slice(0, 200)}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let fullThought = ''
      const tempMessageId = `temp-${Date.now()}`

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue

          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta

            if (delta?.content) {
              fullContent += delta.content
              this.onStreamingChunk?.(delta.content, tempMessageId)
            }

            if (delta?.reasoning_content) {
              fullThought += delta.reasoning_content
              this.onStreamingThought?.(delta.reasoning_content, tempMessageId)
            }
          } catch {
            // Ignore malformed chunks from intermediate proxy frames.
          }
        }
      }

      const aiMaker = contact.entityUri
      const richContent = fullThought ? JSON.stringify({ thought: fullThought }) : undefined
      const podBaseUrl = session.podUrl.replace(/\/$/, '')
      const chatUri = `${podBaseUrl}/.data/chat/${chatId}/index.ttl#this`
      const threadUri = `${podBaseUrl}/.data/chat/${chatId}/index.ttl#${chatId}`

      const aiMsgInput: MessageInsert = {
        chat: chatUri,
        thread: threadUri,
        maker: aiMaker,
        role: 'assistant',
        content: fullContent,
        richContent,
        status: 'sent',
        createdAt: new Date(),
      }

      const aiMsg = await messageRepository.create!(db, aiMsgInput)
      const aiMsgId = resolveRowId(aiMsg)

      await chatRepository.update!(db, chatId, {
        lastActiveAt: new Date(),
        lastMessageId: aiMsgId ?? undefined,
        lastMessagePreview: fullContent.slice(0, 100),
      })

      this.onStreamingComplete?.(aiMsgId ?? tempMessageId)

      this.ctx.invalidateQueries([
        ['threads', chatId, 'messages'],
        ['chats'],
      ])

      this.onMessage?.({
        id: aiMsgId ?? tempMessageId,
        maker: aiMaker,
        content: fullContent,
        role: 'assistant',
        createdAt: new Date(),
        richContent,
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return
      }
      throw error
    } finally {
      this.isStreaming = false
      this.abortController = null
    }
  }

  abort(): void {
    this.abortController?.abort()
    this.isStreaming = false
  }

  getIsStreaming(): boolean {
    return this.isStreaming
  }
}

export class AgentChatHandler implements ChatHandler {
  type = 'agent' as const

  capabilities: ChatCapabilities = {
    canSend: true,
    canReceive: true,
    hasStreaming: true,
    hasThinking: true,
    hasToolCalls: true,
    hasPresence: false,
    hasReadReceipt: false,
    hasTypingIndicator: false,
    hasMembers: false,
    isArchive: false,
  }

  outgoing: AgentOutgoingStrategy
  incoming: AgentIncomingStrategy

  constructor(ctx: ChatHandlerContext) {
    this.outgoing = new AgentOutgoingStrategy(ctx)
    this.incoming = new AgentIncomingStrategy(ctx)
  }

  async sendAndRespond(
    content: string,
    history: Array<{ role: string; content: string }> = [],
  ): Promise<void> {
    const result = await this.outgoing.send({ content })
    if (!result.success) {
      throw new Error(result.error ?? 'Send failed')
    }

    await this.incoming.triggerResponse(content, history)
  }

  stop(): void {
    this.incoming.abort()
  }

  isStreaming(): boolean {
    return this.incoming.getIsStreaming()
  }

  dispose(): void {
    this.incoming.abort()
  }
}

export function createAgentHandler(ctx: ChatHandlerContext): AgentChatHandler {
  return new AgentChatHandler(ctx)
}
