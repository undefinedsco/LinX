import { podTable, uri, string, text, timestamp, id } from 'drizzle-solid'
import { LINQ, DCTerms, FOAF, MEETING, SCHEMA, SIOC, WF } from './namespaces'

export const messageTable = podTable(
  'chat_message',
  {
    id: id('id'),
    threadId: uri('threadId').predicate(SIOC.has_member).inverse().notNull().reference(SIOC.Thread),
    chatId: uri('chatId').predicate(WF.message).inverse().notNull().reference(MEETING.LongChat),
    // maker is the entity URI of the message author:
    // - User: their WebID (https://user.pod/profile/card#me)
    // - AI: Agent URI (/.data/agents/{id}.ttl#this)
    // - External: Contact URI (/.data/contacts/{id}.ttl#this)
    // No reference() constraint - accepts any valid URI
    maker: uri('maker').predicate(FOAF.maker).notNull(),
    role: string('role').predicate(LINQ.messageType).notNull().default('user'),
    content: text('content').predicate(SIOC.content).notNull(),
    richContent: text('richContent').predicate(SIOC.richContent),
    status: string('status').predicate(LINQ.messageStatus).notNull().default('sent'),
    replacedBy: string('replacedBy').predicate(DCTerms.isReplacedBy),
    deletedAt: timestamp('deletedAt').predicate(SCHEMA.dateDeleted),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified),
  },
  {
    base: '/.data/messages/',
    sparqlEndpoint: '/.data/messages/-/sparql',
    type: MEETING.Message,
    namespace: LINQ,
    // Document mode: one file per message
    subjectTemplate: '{id}.ttl',
  },
)

export type MessageRow = typeof messageTable.$inferSelect
export type MessageInsert = typeof messageTable.$inferInsert
export type MessageUpdate = typeof messageTable.$inferUpdate
