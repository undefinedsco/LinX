import { boolean, podTable, string, text, timestamp, uri, id, integer } from 'drizzle-solid'
import { LINQ, DCTerms, SCHEMA, MEETING, WF } from './namespaces'

/**
 * Chat schema for unified chat experience.
 * 
 * A Chat represents a conversation with a Contact (which can be a person, AI, or group).
 * The Contact determines the chat type and behavior:
 * - contactType='agent': AI chat with streaming, thinking, tool calls
 * - contactType='solid': Real-time chat with Solid user
 * - contactType='external': Read-only archive from imported platforms
 * - contactType='group': Group chat with multiple participants
 */
export const chatTable = podTable(
  'chats',
  {
    id: id('id'),
    
    // Display
    title: string('title').predicate(DCTerms.title).notNull(),
    description: string('description').predicate(DCTerms.description),
    avatarUrl: uri('avatarUrl').predicate(SCHEMA.image),
    
    // Primary contact (who this chat is with)
    // For 1-on-1 chats, this is the other party
    // For group chats, this is the group contact
    contact: uri('contact').predicate(LINQ.hasContact).notNull(),
    
    // Chat state
    starred: boolean('starred').predicate(LINQ.favorite).default(false),
    muted: boolean('muted').predicate(LINQ.muted).default(false),
    unreadCount: integer('unreadCount').predicate(LINQ.unreadCount).default(0),
    
    // Group chat: additional participants (for groups only)
    participants: uri('participants')
      .array()
      .predicate(SCHEMA.participant),
    
    // Last activity
    lastActiveAt: timestamp('lastActiveAt').predicate(LINQ.lastActiveAt),
    lastMessageId: uri('lastMessageId').predicate(WF.message),
    lastMessagePreview: text('lastMessagePreview').predicate(SCHEMA.text),
    
    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/chats/',
    sparqlEndpoint: '/.data/chats/-/sparql',
    type: MEETING.LongChat,
    namespace: LINQ,
    subjectTemplate: '{id}.ttl',
  },
)

export type ChatRow = typeof chatTable.$inferSelect
export type ChatInsert = typeof chatTable.$inferInsert
export type ChatUpdate = typeof chatTable.$inferUpdate
