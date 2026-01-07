/**
 * Archive Chat Handler
 * 
 * Handles read-only archived chats (imported from external platforms):
 * - Outgoing: Disabled (read-only)
 * - Incoming: Disabled (no new messages)
 */

import type {
  ChatHandler,
  ChatHandlerContext,
  ChatCapabilities,
  OutgoingStrategy,
  IncomingStrategy,
  OutgoingMessage,
  SendResult,
} from '../types'

// ============================================
// Outgoing Strategy (Disabled)
// ============================================

class ArchiveOutgoingStrategy implements OutgoingStrategy {
  canSend(): boolean {
    return false
  }
  
  async send(_message: OutgoingMessage): Promise<SendResult> {
    return { 
      success: false, 
      error: 'Archive chats are read-only',
    }
  }
}

// ============================================
// Incoming Strategy (Disabled)
// ============================================

class ArchiveIncomingStrategy implements IncomingStrategy {
  canReceive(): boolean {
    return false
  }
  
  subscribe(): () => void {
    // No subscription needed for archives
    return () => {}
  }
}

// ============================================
// Archive Chat Handler
// ============================================

export class ArchiveChatHandler implements ChatHandler {
  type = 'archive' as const
  
  capabilities: ChatCapabilities = {
    canSend: false,
    canReceive: false,
    hasStreaming: false,
    hasThinking: false,
    hasToolCalls: false,
    hasPresence: false,
    hasReadReceipt: false,
    hasTypingIndicator: false,
    hasMembers: false,
    isArchive: true,
  }
  
  outgoing: ArchiveOutgoingStrategy
  incoming: ArchiveIncomingStrategy
  
  constructor(_ctx: ChatHandlerContext) {
    this.outgoing = new ArchiveOutgoingStrategy()
    this.incoming = new ArchiveIncomingStrategy()
  }
  
  dispose(): void {
    // Nothing to clean up
  }
}

export function createArchiveHandler(ctx: ChatHandlerContext): ArchiveChatHandler {
  return new ArchiveChatHandler(ctx)
}
