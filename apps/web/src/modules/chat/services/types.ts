/**
 * Chat Handler Types
 * 
 * Abstracts the differences between chat types (AI, Solid, Group, Archive)
 * using Incoming/Outgoing strategies for message flow.
 */

import type { SolidDatabase, ContactRow, ChatRow, AgentRow } from '@linx/models'

// ============================================
// Message Types
// ============================================

export interface OutgoingMessage {
  content: string
  attachments?: string[]  // File URIs
}

export interface IncomingMessage {
  id: string
  maker: string           // Sender URI
  content: string
  role: 'user' | 'assistant' | 'system'
  createdAt: Date
  richContent?: string    // JSON for thinking, tool calls, etc.
}

export type SendStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================
// Strategy Interfaces
// ============================================

/**
 * Outgoing Strategy - handles sending messages
 */
export interface OutgoingStrategy {
  /** Whether this handler can send messages */
  canSend(): boolean
  
  /** Send a message */
  send(message: OutgoingMessage): Promise<SendResult>
  
  /** Optional: callback for send status changes */
  onSendStatusChange?: (status: SendStatus) => void
}

/**
 * Incoming Strategy - handles receiving messages
 */
export interface IncomingStrategy {
  /** Whether this handler can receive messages */
  canReceive(): boolean
  
  /** 
   * Subscribe to incoming messages
   * @returns Unsubscribe function
   */
  subscribe(): () => void
  
  /** Callback when a complete message arrives */
  onMessage?: (message: IncomingMessage) => void
  
  /** Optional: callback for streaming content (AI) */
  onStreamingChunk?: (chunk: string, messageId?: string) => void
  
  /** Optional: callback for streaming thinking content (AI reasoning) */
  onStreamingThought?: (chunk: string, messageId?: string) => void
  
  /** Optional: callback when streaming completes */
  onStreamingComplete?: (messageId: string) => void
}

// ============================================
// Handler Capabilities
// ============================================

export interface ChatCapabilities {
  canSend: boolean
  canReceive: boolean
  hasStreaming: boolean       // AI: streaming responses
  hasThinking: boolean        // AI: reasoning/thinking display
  hasToolCalls: boolean       // AI: tool invocations
  hasPresence: boolean        // Solid: online status
  hasReadReceipt: boolean     // Solid: read receipts
  hasTypingIndicator: boolean // Solid: typing indicator
  hasMembers: boolean         // Group: member list
  isArchive: boolean          // Archive: read-only mode
}

// ============================================
// Chat Handler
// ============================================

export interface ChatHandler {
  /** Handler type identifier */
  type: 'agent' | 'solid' | 'group' | 'archive'
  
  /** Capabilities of this handler */
  capabilities: ChatCapabilities
  
  /** Outgoing message strategy */
  outgoing: OutgoingStrategy
  
  /** Incoming message strategy */
  incoming: IncomingStrategy
  
  /** Clean up resources */
  dispose(): void
}

// ============================================
// Handler Context
// ============================================

export interface ChatHandlerContext {
  db: SolidDatabase
  chatId: string
  chat: ChatRow
  contact: ContactRow
  agent?: AgentRow          // Only for agent type
  session: {
    webId: string
    podUrl: string
  }
  
  /** Query client for cache invalidation */
  invalidateQueries: (keys: string[][]) => void
}

// ============================================
// Handler Factory
// ============================================

export type ChatHandlerFactory = (context: ChatHandlerContext) => ChatHandler
