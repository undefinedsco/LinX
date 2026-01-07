/**
 * Chat Handler Registry
 * 
 * Factory for creating the appropriate chat handler based on contact type.
 */

import type { ChatHandler, ChatHandlerContext } from './types'
import { createAgentHandler } from './handlers/agent-handler'
import { createArchiveHandler } from './handlers/archive-handler'

/**
 * Create a chat handler based on the contact type
 */
export function createChatHandler(ctx: ChatHandlerContext): ChatHandler {
  const contactType = ctx.contact.contactType
  
  switch (contactType) {
    case 'agent':
      return createAgentHandler(ctx)
    
    case 'external':
      // External contacts (imported from WeChat, Telegram, etc.) are read-only
      return createArchiveHandler(ctx)
    
    case 'solid':
      // TODO: Implement Solid chat handler
      // For now, fall back to archive (read-only)
      console.warn('Solid chat handler not implemented, using archive handler')
      return createArchiveHandler(ctx)
    
    case 'group':
      // TODO: Implement group chat handler
      console.warn('Group chat handler not implemented, using archive handler')
      return createArchiveHandler(ctx)
    
    default:
      console.warn(`Unknown contact type: ${contactType}, using archive handler`)
      return createArchiveHandler(ctx)
  }
}

/**
 * Check if a contact type supports real-time messaging
 */
export function isRealtimeType(contactType: string): boolean {
  return contactType === 'agent' || contactType === 'solid'
}

/**
 * Check if a contact type is read-only
 */
export function isReadOnlyType(contactType: string): boolean {
  return contactType === 'external'
}
