import { podTable, uri, string, text, timestamp, id } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms, FOAF, LINX_MSG, MEETING, SCHEMA, SIOC, WF } from './namespaces'
import { threadTable } from './thread.schema'


/**
 * Message schema (aligned with xpod).
 *
 * Storage structure:
 * - Location: /.data/chat/{chat}/{yyyy}/{MM}/{dd}/messages.ttl#{id}
 * - Date-based path for efficient time-range queries
 * - chat/thread are RDF URI relations. Short ids remain accepted at API/query call sites via ORM URI template resolution.
 */
export const messageTable = podTable(
  'chat_message',
  {
    id: id('id'),

    // Chat relation. In RDF this is an inverse Solid Chat link: <chat> wf:message <message>.
    chat: uri('chat').predicate(WF.message).inverse().notNull().link('chats'),

    // Thread relation. In RDF this is an inverse Solid Chat/SIOC link: <thread> sioc:has_member <message>.
    thread: uri('thread').predicate(SIOC.has_member).inverse().notNull().link(threadTable),

    // maker is the entity URI of the message author:
    // - User: their WebID (https://user.pod/profile/card#me)
    // - AI: Agent URI (/.data/agents/{id}.ttl#this)
    // - External: Contact URI (/.data/contacts/{id}.ttl#this)
    // No reference() constraint - accepts any valid URI.
    maker: uri('maker').predicate(FOAF.maker).notNull(),

    role: string('role').predicate(UDFS.messageType).notNull().default('user'),
    content: text('content').predicate(SIOC.content).notNull(),
    richContent: text('richContent').predicate(SIOC.richContent),


    status: string('status').predicate(UDFS.messageStatus).notNull().default('sent'),
    replacedBy: string('replacedBy').predicate(DCTerms.isReplacedBy),
    deletedAt: timestamp('deletedAt').predicate(SCHEMA.dateDeleted),

    // Group message extensions
    senderName: string('senderName').predicate(LINX_MSG.senderName),
    senderAvatarUrl: uri('senderAvatarUrl').predicate(LINX_MSG.senderAvatarUrl),
    mentions: uri('mentions').array().predicate(LINX_MSG.mentions),
    replyTo: uri('replyTo').predicate(LINX_MSG.replyTo),

    // Multi-AI routing
    routedBy: uri('routedBy').predicate(LINX_MSG.routedBy),
    routeTargetAgentId: string('routeTargetAgentId').predicate(LINX_MSG.routeTargetAgentId),
    coordinationId: string('coordinationId').predicate(LINX_MSG.coordinationId),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified),
  },
  {
    base: '/.data/chat/',
    sparqlEndpoint: '/.data/chat/-/sparql',
    type: MEETING.Message,
    namespace: UDFS,
    subjectTemplate: '{chat}/{yyyy}/{MM}/{dd}/messages.ttl#{id}',
  },
)

export type MessageRow = typeof messageTable.$inferSelect
export type MessageInsert = typeof messageTable.$inferInsert
export type MessageUpdate = typeof messageTable.$inferUpdate
