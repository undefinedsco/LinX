import { boolean, podTable, string, text, timestamp, uri, id, integer } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms, SCHEMA, MEETING, WF } from './namespaces'

/**
 * Chat schema (channel/place).
 *
 * CP0 baseline (alignment):
 * - Chat is a container for messages/widgets regardless of counterpart type.
 * - Do not encode counterpart-specific behavior in Chat (no chatType/subtype).
 * - Participants use Solid chat-aligned flow vocabulary (wf/flow).
 *
 * Storage structure (aligned with xpod):
 * - Chat metadata stored as #this in index.ttl
 * - Location: /.data/chat/{id}/index.ttl#this
 * - Threads stored as fragments in same file: /.data/chat/{id}/index.ttl#{threadId}
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
    contact: uri('contact').predicate(UDFS.hasContact).notNull(),

    // Chat state
    starred: boolean('starred').predicate(UDFS.favorite).default(false),
    muted: boolean('muted').predicate(UDFS.muted).default(false),
    unreadCount: integer('unreadCount').predicate(UDFS.unreadCount).default(0),

    // Group chat: additional participants (for groups only)
    participants: uri('participants')
      .array()
      .predicate(SCHEMA.participant),


    // Last activity
    lastActiveAt: timestamp('lastActiveAt').predicate(UDFS.lastActiveAt),
    lastMessageId: uri('lastMessageId').predicate(WF.message),
    lastMessagePreview: text('lastMessagePreview').predicate(SCHEMA.text),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/chat/',
    sparqlEndpoint: '/.data/chat/-/sparql',
    type: MEETING.LongChat,
    namespace: UDFS,
    subjectTemplate: '{id}/index.ttl#this',
  },
)

export type ChatRow = typeof chatTable.$inferSelect
export type ChatInsert = typeof chatTable.$inferInsert
export type ChatUpdate = typeof chatTable.$inferUpdate
