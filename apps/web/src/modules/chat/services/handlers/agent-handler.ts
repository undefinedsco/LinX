/**
 * Agent Chat Handler
 *
 * @deprecated 已被 @openai/chatkit-react SDK 替代。
 * ChatKit SDK 内部处理 AI 对话、流式响应、工具调用等。
 * xpod-api-server 实现 ChatKit 协议后端，前端直接使用 ChatKit SDK。
 * 保留此文件以备回退，将在稳定后移除。
 *
 * @see docs/feature-plan/wave-a/03-xpod-client-core.md
 *
 * Handles AI assistant conversations:
 * - Outgoing: Save user message, call AI API
 * - Incoming: Stream AI response, save to Pod
 */

import {
  messageRepository,
  chatRepository,
  modelProviderTable,
  resolveRowId,
  eq,
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

// ============================================
// Outgoing Strategy
// ============================================

class AgentOutgoingStrategy implements OutgoingStrategy {
  private abortController: AbortController | null = null
  
  constructor(private ctx: ChatHandlerContext) {}
  
  onSendStatusChange?: (status: SendStatus) => void
  
  canSend(): boolean {
    return true
  }
  
  async send(message: OutgoingMessage): Promise<SendResult> {
    const { db, chatId, chat, contact, agent, session } = this.ctx
    
    if (!agent) {
      return { success: false, error: 'No agent configuration found' }
    }
    
    try {
      this.onSendStatusChange?.('sending')
      
      // 1. Save user message
      const userMsgInput: MessageInsert = {
        chatId,
        threadId: chatId, // For now, use chatId as threadId
        maker: session.webId,
        role: 'user',
        content: message.content,
        status: 'sent',
        createdAt: new Date(),
      }
      
      const userMsg = await messageRepository.create!(db, userMsgInput)
      const userMsgId = resolveRowId(userMsg)
      
      // 2. Update chat last activity
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

// ============================================
// Incoming Strategy
// ============================================

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
    // AI doesn't need persistent subscription
    // Responses are triggered by outgoing messages
    return () => {
      this.abort()
    }
  }
  
  /**
   * Trigger AI response after user message is sent
   */
  async triggerResponse(userMessage: string, history: Array<{ role: string; content: string }> = []): Promise<void> {
    const { db, chatId, contact, agent, session } = this.ctx
    
    if (!agent) {
      throw new Error('No agent configuration found')
    }
    
    this.isStreaming = true
    this.abortController = new AbortController()
    
    try {
      // 1. Get credential from modelProviderTable
      const idCol = (modelProviderTable as any).id
      const providers = await db.select()
        .from(modelProviderTable)
        .where(eq(idCol, agent.provider))
        .execute()
      
      const prov = providers[0]
      
      if (!prov?.apiKey) {
        throw new Error(`No API key found for provider ${agent.provider}`)
      }
      
      // 2. Prepare API request
      const baseUrl = prov.baseUrl || inferBaseUrl(agent.provider ?? '')
      const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
      
      const apiMessages = [
        ...(agent.instructions ? [{ role: 'system', content: agent.instructions }] : []),
        ...history,
        { role: 'user', content: userMessage },
      ]
      
      // 3. Call streaming API
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${prov.apiKey}`,
        },
        body: JSON.stringify({
          model: agent.model,
          messages: apiMessages,
          max_tokens: 2048,
          temperature: agent.temperature ?? 0.7,
          stream: true,
        }),
        signal: this.abortController.signal,
      })
      
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`AI API error ${response.status}: ${text.slice(0, 200)}`)
      }
      
      // 4. Process stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
      
      const decoder = new TextDecoder()
      let fullContent = ''
      let fullThought = ''
      const tempMessageId = `temp-${Date.now()}`
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          
          const data = line.slice(6)
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            
            if (delta?.content) {
              fullContent += delta.content
              this.onStreamingChunk?.(delta.content, tempMessageId)
            }
            
            // DeepSeek R1 style reasoning
            if (delta?.reasoning_content) {
              fullThought += delta.reasoning_content
              this.onStreamingThought?.(delta.reasoning_content, tempMessageId)
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
      
      // 5. Save AI message
      const aiMaker = contact.entityUri
      
      const richContent = fullThought 
        ? JSON.stringify({ thought: fullThought })
        : undefined
      
      const aiMsgInput: MessageInsert = {
        chatId,
        threadId: chatId,
        maker: aiMaker,
        role: 'assistant',
        content: fullContent,
        richContent,
        status: 'sent',
        createdAt: new Date(),
      }
      
      const aiMsg = await messageRepository.create!(db, aiMsgInput)
      const aiMsgId = resolveRowId(aiMsg)
      
      // 6. Update chat
      await chatRepository.update!(db, chatId, {
        lastActiveAt: new Date(),
        lastMessageId: aiMsgId ?? undefined,
        lastMessagePreview: fullContent.slice(0, 100),
      })
      
      // 7. Notify completion
      this.onStreamingComplete?.(aiMsgId ?? tempMessageId)
      
      this.ctx.invalidateQueries([
        ['threads', chatId, 'messages'],
        ['chats'],
      ])
      
      // 8. Emit as incoming message
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
        return // User cancelled
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

// ============================================
// Agent Chat Handler
// ============================================

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
  
  constructor(private ctx: ChatHandlerContext) {
    this.outgoing = new AgentOutgoingStrategy(ctx)
    this.incoming = new AgentIncomingStrategy(ctx)
  }
  
  /**
   * Send user message and trigger AI response
   */
  async sendAndRespond(
    content: string, 
    history: Array<{ role: string; content: string }> = []
  ): Promise<void> {
    // 1. Send user message
    const result = await this.outgoing.send({ content })
    if (!result.success) {
      throw new Error(result.error ?? 'Send failed')
    }
    
    // 2. Trigger AI response
    await this.incoming.triggerResponse(content, history)
  }
  
  /**
   * Stop streaming response
   */
  stop(): void {
    this.incoming.abort()
  }
  
  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.incoming.getIsStreaming()
  }
  
  dispose(): void {
    this.incoming.abort()
  }
}

// ============================================
// Helpers
// ============================================

function inferBaseUrl(provider: string): string {
  switch (provider) {
    case 'anthropic':
    case 'claude':
      return 'https://api.anthropic.com/v1'
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'deepseek':
      return 'https://api.deepseek.com/v1'
    case 'x-ai':
      return 'https://api.x.ai/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}

export function createAgentHandler(ctx: ChatHandlerContext): AgentChatHandler {
  return new AgentChatHandler(ctx)
}
