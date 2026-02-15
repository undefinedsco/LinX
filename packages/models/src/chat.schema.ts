import { boolean, id, integer, podTable, string, text, timestamp, uri } from 'drizzle-solid'
import { DCTerms, MEETING, SCHEMA, UDFS, WF } from './namespaces'

/**
 * Chat schema (channel/place).
 *
 * CP0 baseline (alignment):
 * - Chat is a container for messages/widgets regardless of counterpart type.
 * - Do not encode counterpart-specific behavior in Chat (no chatType/subtype).
 * - Participants use Solid chat-aligned flow vocabulary (wf/flow).
 */
export const chatTable = podTable(
  'chats',
  {
    id: id('id'),

    // Display
    title: string('title').predicate(DCTerms.title).notNull(),
    description: string('description').predicate(DCTerms.description),
    avatarUrl: uri('avatarUrl').predicate(SCHEMA.image),

    // Participants (protocol-aligned)
    participants: uri('participants').array().predicate(WF.participant),

    // Chat state
    starred: boolean('starred').predicate(UDFS.favorite).default(false),
    muted: boolean('muted').predicate(UDFS.muted).default(false),
    unreadCount: integer('unreadCount').predicate(UDFS.unreadCount).default(0),

    // Last activity
    lastActiveAt: timestamp('lastActiveAt').predicate(UDFS.lastActiveAt),
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
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)

export type ChatRow = typeof chatTable.$inferSelect
export type ChatInsert = typeof chatTable.$inferInsert
export type ChatUpdate = typeof chatTable.$inferUpdate
