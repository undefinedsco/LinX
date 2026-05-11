import { podTable, uri, timestamp, id } from '@undefineds.co/drizzle-solid'
import { AS, DCTerms, RDF } from './namespaces'

// Solid inbox notifications (protocol channel)
export const inboxNotificationTable = podTable(
  'inbox_notification',
  {
    id: id('id'),

    // Protocol inbox messages are not always Announce. Keep rdf:type writable so
    // app notifications can use as:Announce while other Solid inbox payloads keep their own type.
    rdfType: uri('rdfType').array().predicate(RDF.type).notNull().default([AS.Announce]),

    // Standard ActivityStreams envelope
    actor: uri('actor').predicate(AS.actor),
    object: uri('object').predicate(AS.object).notNull(),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
  },
  {
    base: '/inbox/',
    sparqlEndpoint: '/inbox/-/sparql',
    type: AS.Activity,
    namespace: AS,
    subjectTemplate: '{id}.ttl',
  },
)

export type InboxNotificationRow = typeof inboxNotificationTable.$inferSelect
export type InboxNotificationInsert = typeof inboxNotificationTable.$inferInsert
export type InboxNotificationUpdate = typeof inboxNotificationTable.$inferUpdate
