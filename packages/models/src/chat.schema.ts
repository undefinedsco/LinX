import { boolean, object, podTable, string, text, timestamp, uri, id, integer } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms, SCHEMA, MEETING, WF } from './namespaces'

export type ChatMemberRole = 'owner' | 'admin' | 'member'

export interface ChatMetadata {
  memberRoles?: Record<string, ChatMemberRole>
}

/**
 * Chat resource.
 *
 * Product semantics:
 * - Chat means "who/what the user is talking with": a person, group, AI agent, or
 *   default AI secretary. It is the counterpart/conversation object, not the place
 *   where a runtime executes.
 * - Runtime/workspace/place/session context belongs on Thread.
 * - Direct LinX CLI entry should use a chat representing the AI secretary.
 * - Watch entry should use a chat representing the watched agent/tool, such as
 *   Codex, Claude Code, or a concrete AI identity when available.
 *
 * Storage structure (aligned with xpod):
 * - Chat metadata stored as #this in index.ttl
 * - Location: /.data/chat/{id}/index.ttl#this
 * - Threads stored as fragments in same file: /.data/chat/{id}/index.ttl#{threadId}
 */
export const chatResource = podTable(
  'chats',
  {
    id: id('id'),

    // Display
    title: string('title').predicate(DCTerms.title).notNull(),
    description: string('description').predicate(DCTerms.description),
    avatarUrl: uri('avatarUrl').predicate(SCHEMA.image),

    // Chat state
    starred: boolean('starred').predicate(UDFS.favorite).default(false),
    muted: boolean('muted').predicate(UDFS.muted).default(false),
    unreadCount: integer('unreadCount').predicate(UDFS.unreadCount).default(0),

    // Optional counterpart/contact represented by this channel. Stored as RDF URI; callers may pass a short contact id.
    contact: uri('contact').predicate(UDFS.term('contact')).link('contact'),

    // Explicit membership for group chats.
    participants: uri('participants')
      .array()
      .predicate(WF.participant),

    // Structured chat metadata.
    metadata: object('metadata').predicate(UDFS.metadata),


    // Last activity
    lastActiveAt: timestamp('lastActiveAt').predicate(UDFS.lastActiveAt),
    // Latest-message pointer. Do not reuse WF.message here: WF.message is the
    // Solid Chat containment relation used by message.chat inverse links.
    lastMessageId: uri('lastMessageId').predicate(UDFS.lastMessage),
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

// Compatibility alias. New model code should prefer `chatResource`.
export const chatTable = chatResource

export type ChatRow = typeof chatResource.$inferSelect
export type ChatInsert = typeof chatResource.$inferInsert
export type ChatUpdate = typeof chatResource.$inferUpdate
