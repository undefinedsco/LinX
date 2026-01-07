/**
 * useChatHandler Hook
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
} from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useSession } from '@inrupt/solid-ui-react'
import { createChatHandler, type ChatHandler, type AgentChatHandler } from '../services'

// ============================================
// Types
// ============================================

export interface UseChatHandlerOptions {
  chatId: string | null
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
  
  // State
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingThought, setStreamingThought] = useState('')
  const [error, setError] = useState<Error | null>(null)
  
  // Handler ref (to persist across renders)
  const handlerRef = useRef<ChatHandler | null>(null)
  
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
    
    // Extract pod URL from webId
    const podUrl = extractPodUrl(session.info.webId)
    
    const ctx = {
      db,
      chatId: chatId!,
      chat,
      contact,
      agent: agent ?? undefined,
      session: {
        webId: session.info.webId,
        podUrl,
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
    }
    
    return newHandler
  }, [db, chat, contact, agent, session?.info?.webId, chatId, queryClient])
  
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
  // Cleanup
  // ============================================
  
  useEffect(() => {
    return () => {
      handlerRef.current?.dispose()
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

function extractPodUrl(webId: string): string {
  try {
    const url = new URL(webId)
    const pathParts = url.pathname.split('/')
    const profileIndex = pathParts.indexOf('profile')
    if (profileIndex > 0) {
      const podPath = pathParts.slice(0, profileIndex).join('/')
      return `${url.origin}${podPath}`
    }
    return url.origin
  } catch {
    return ''
  }
}
