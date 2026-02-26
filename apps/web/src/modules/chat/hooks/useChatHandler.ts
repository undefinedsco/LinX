/**
 * useChatHandler Hook
 *
 * @deprecated 已被 @openai/chatkit-react SDK 替代。
 * ChatKit SDK 内部处理消息发送、流式响应、工具调用等。
 * 保留此文件以备回退，将在稳定后移除。
 *
 * @see docs/feature-plan/wave-a/03-xpod-client-core.md
 *
 * Provides a unified interface for chat operations using the handler pattern.
 * Automatically selects the appropriate handler based on contact type.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  chatTable,
  contactTable,
  agentTable,
  messageTable,
  eq,
  type ToolRisk,
} from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useSession } from '@inrupt/solid-ui-react'
import { createChatHandler, type ChatHandler, type AgentChatHandler } from '../services'
import { extractPodUrlFromWebId, resolvePodUrl } from '@/lib/pod-url'
import { CHAT_CP1_ENABLED } from '../feature-flags'

// ============================================
// Types
// ============================================

export interface UseChatHandlerOptions {
  chatId: string | null
}

/** A tool call awaiting user approval */
export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  risk: ToolRisk
  timeout: number
  createdAt: number
  status: 'pending' | 'approved' | 'rejected'
}

/** Timeout rules per risk level (spec §7.1) */
const APPROVAL_TIMEOUTS: Record<ToolRisk, { seconds: number; autoAction: 'approve' | 'reject' } | null> = {
  high:   { seconds: 30, autoAction: 'reject' },
  medium: { seconds: 60, autoAction: 'approve' },
  low:    null,
}

export interface UseChatHandlerResult {
  // State
  isLoading: boolean
  isStreaming: boolean
  error: Error | null

  // Chat data
  chat: any | null
  contact: any | null
  agent: any | null
  messages: any[]

  // Streaming content
  streamingContent: string
  streamingThought: string

  // Capabilities
  canSend: boolean
  canReceive: boolean
  hasStreaming: boolean
  hasThinking: boolean
  isArchive: boolean

  // Actions
  sendMessage: (content: string) => Promise<void>
  stop: () => void

  // CP1: Tool approval flow
  pendingApprovals: PendingApproval[]
  approveToolCall: (toolCallId: string) => void
  rejectToolCall: (toolCallId: string) => void

  // Handler (for advanced usage)
  handler: ChatHandler | null
}

// ============================================
// Hook Implementation
// ============================================

export function useChatHandler(options: UseChatHandlerOptions): UseChatHandlerResult {
  const { chatId } = options
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [podUrl, setPodUrl] = useState('')
  
  // State
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingThought, setStreamingThought] = useState('')
  const [error, setError] = useState<Error | null>(null)
  
  // Handler ref (to persist across renders)
  const handlerRef = useRef<ChatHandler | null>(null)

  // CP1: Tool approval flow state
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const approvalTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const webId = session?.info?.webId
    if (!webId) {
      setPodUrl('')
      return
    }

    let cancelled = false
    const fallback = extractPodUrlFromWebId(webId)
    setPodUrl(fallback)

    const controller = new AbortController()
    const resolve = async () => {
      const next = await resolvePodUrl(webId, { signal: controller.signal })
      if (!cancelled && next) {
        setPodUrl(next)
      }
    }

    void resolve()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [session?.info?.webId])
  
  // ============================================
  // Queries
  // ============================================
  
  // Fetch chat
  const { data: chat, isLoading: chatLoading } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => {
      if (!db || !chatId) return null
      const idCol = (chatTable as any).id
      const rows = await db.select()
        .from(chatTable)
        .where(eq(idCol, chatId))
        .execute()
      return rows[0] ?? null
    },
    enabled: !!db && !!chatId,
  })
  
  // Fetch contact (using chat.contact or fallback to chat.participants)
  const contactUri = (chat as any)?.contact
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['contact', contactUri],
    queryFn: async () => {
      if (!db || !contactUri) return null
      const idCol = (contactTable as any).id
      const rows = await db.select()
        .from(contactTable)
        .where(eq(idCol, extractId(contactUri)))
        .execute()
      return rows[0] ?? null
    },
    enabled: !!db && !!contactUri,
  })
  
  // Fetch agent (if contact type is agent)
  const agentUri = contact?.entityUri
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentUri],
    queryFn: async () => {
      if (!db || !agentUri || contact?.contactType !== 'agent') return null
      const idCol = (agentTable as any).id
      const rows = await db.select()
        .from(agentTable)
        .where(eq(idCol, extractId(agentUri)))
        .execute()
      return rows[0] ?? null
    },
    enabled: !!db && !!agentUri && contact?.contactType === 'agent',
  })
  
  // Fetch messages
  const threadId = chatId // For now, use chatId as threadId
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['threads', threadId, 'messages'],
    queryFn: async () => {
      if (!db || !threadId) return []
      const threadIdCol = (messageTable as any).threadId
      const createdAtCol = (messageTable as any).createdAt
      const rows = await db.select()
        .from(messageTable)
        .where(eq(threadIdCol, threadId))
        .orderBy(createdAtCol)
        .execute()
      return rows
    },
    enabled: !!db && !!threadId,
  })
  
  // ============================================
  // Create Handler
  // ============================================
  
  const handler = useMemo(() => {
    if (!db || !chat || !contact || !session?.info?.webId) {
      return null
    }
    
    // Clean up previous handler
    handlerRef.current?.dispose()
    
    const ctx = {
      db,
      chatId: chatId!,
      chat,
      contact,
      agent: agent ?? undefined,
      session: {
        webId: session.info.webId,
        podUrl,
        fetch: session.fetch,
      },
      invalidateQueries: (keys: string[][]) => {
        keys.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }
    
    const newHandler = createChatHandler(ctx)
    handlerRef.current = newHandler
    
    // Set up incoming callbacks
    if (newHandler.incoming) {
      newHandler.incoming.onStreamingChunk = (chunk) => {
        setStreamingContent(prev => prev + chunk)
      }
      newHandler.incoming.onStreamingThought = (chunk) => {
        setStreamingThought(prev => prev + chunk)
      }
      newHandler.incoming.onStreamingComplete = () => {
        setIsStreaming(false)
        setStreamingContent('')
        setStreamingThought('')
      }

      // CP1: Wire tool approval callbacks (only when feature flag is on)
      if (CHAT_CP1_ENABLED) {
        newHandler.incoming.onToolApproval = (toolCallId, toolName, args, risk, timeout) => {
          const approval: PendingApproval = {
            toolCallId,
            toolName,
            args,
            risk,
            timeout,
            createdAt: Date.now(),
            status: 'pending',
          }
          setPendingApprovals(prev => [...prev, approval])

          // Set up auto-action timer based on risk level
          const rule = APPROVAL_TIMEOUTS[risk]
          if (rule) {
            const timer = setTimeout(() => {
              approvalTimersRef.current.delete(toolCallId)
              setPendingApprovals(prev =>
                prev.map(a => {
                  if (a.toolCallId !== toolCallId || a.status !== 'pending') return a
                  return { ...a, status: rule.autoAction === 'approve' ? 'approved' : 'rejected' }
                })
              )
              // Forward auto-decision to handler
              if (newHandler.outgoing.sendApproval) {
                const decision = rule.autoAction === 'approve' ? 'approved' : 'rejected'
                newHandler.outgoing.sendApproval(toolCallId, decision).catch(() => {})
              }
            }, rule.seconds * 1000)
            approvalTimersRef.current.set(toolCallId, timer)
          }
        }

        newHandler.incoming.onToolCallEnd = (toolCallId) => {
          // Remove from pending when tool call completes
          setPendingApprovals(prev => prev.filter(a => a.toolCallId !== toolCallId))
          const timer = approvalTimersRef.current.get(toolCallId)
          if (timer) {
            clearTimeout(timer)
            approvalTimersRef.current.delete(toolCallId)
          }
        }
      }
    }

    return newHandler
  }, [db, chat, contact, agent, session?.info?.webId, session?.fetch, podUrl, chatId, queryClient])
  
  // ============================================
  // Actions
  // ============================================
  
  const sendMessage = useCallback(async (content: string) => {
    if (!handler || !handler.outgoing.canSend()) {
      throw new Error('Cannot send messages in this chat')
    }
    
    setError(null)
    
    try {
      // For agent handler, use sendAndRespond
      if (handler.type === 'agent') {
        setIsStreaming(true)
        setStreamingContent('')
        setStreamingThought('')
        
        // Build history from messages
        const history = messages.map(m => ({
          role: (m.role ?? 'user') as string,
          content: (m.content ?? '') as string,
        }))
        
        await (handler as AgentChatHandler).sendAndRespond(content, history)
      } else {
        // For other handlers, just send
        await handler.outgoing.send({ content })
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Send failed'))
      setIsStreaming(false)
      throw err
    }
  }, [handler, messages])
  
  const stop = useCallback(() => {
    if (handler?.type === 'agent') {
      (handler as AgentChatHandler).stop()
    }
    setIsStreaming(false)
  }, [handler])

  // ============================================
  // CP1: Tool Approval Actions
  // ============================================

  const resolveApproval = useCallback((toolCallId: string, decision: 'approved' | 'rejected') => {
    // Clear timeout timer
    const timer = approvalTimersRef.current.get(toolCallId)
    if (timer) {
      clearTimeout(timer)
      approvalTimersRef.current.delete(toolCallId)
    }

    // Update local state
    setPendingApprovals(prev =>
      prev.map(a => a.toolCallId === toolCallId ? { ...a, status: decision } : a)
    )

    // Forward decision to handler's outgoing strategy
    if (CHAT_CP1_ENABLED && handler?.outgoing.sendApproval) {
      handler.outgoing.sendApproval(toolCallId, decision).catch(err => {
        console.error('[useChatHandler] sendApproval failed:', err)
      })
    }
  }, [handler])

  const approveToolCall = useCallback((toolCallId: string) => {
    resolveApproval(toolCallId, 'approved')
  }, [resolveApproval])

  const rejectToolCall = useCallback((toolCallId: string) => {
    resolveApproval(toolCallId, 'rejected')
  }, [resolveApproval])

  // ============================================
  // Cleanup
  // ============================================

  useEffect(() => {
    return () => {
      handlerRef.current?.dispose()
      // Clear all approval timers
      for (const timer of approvalTimersRef.current.values()) {
        clearTimeout(timer)
      }
      approvalTimersRef.current.clear()
    }
  }, [])
  
  // ============================================
  // Return
  // ============================================
  
  const isLoading = chatLoading || contactLoading || agentLoading || messagesLoading
  const caps = handler?.capabilities
  
  return {
    // State
    isLoading,
    isStreaming,
    error,
    
    // Data
    chat,
    contact,
    agent,
    messages,
    
    // Streaming
    streamingContent,
    streamingThought,
    
    // Capabilities
    canSend: caps?.canSend ?? false,
    canReceive: caps?.canReceive ?? false,
    hasStreaming: caps?.hasStreaming ?? false,
    hasThinking: caps?.hasThinking ?? false,
    isArchive: caps?.isArchive ?? false,
    
    // Actions
    sendMessage,
    stop,

    // CP1: Tool approval flow
    pendingApprovals,
    approveToolCall,
    rejectToolCall,

    // Handler
    handler,
  }
}

// ============================================
// Helpers
// ============================================

function extractId(uri: string): string {
  if (!uri) return ''
  
  // Handle fragment URIs: ...#id
  const hashIndex = uri.indexOf('#')
  if (hashIndex !== -1) {
    return uri.slice(hashIndex + 1)
  }
  
  // Handle document URIs: .../id.ttl
  const lastSlash = uri.lastIndexOf('/')
  if (lastSlash !== -1) {
    let filename = uri.slice(lastSlash + 1)
    const dotIndex = filename.lastIndexOf('.')
    if (dotIndex !== -1) {
      filename = filename.slice(0, dotIndex)
    }
    return filename
  }
  
  return uri
}
