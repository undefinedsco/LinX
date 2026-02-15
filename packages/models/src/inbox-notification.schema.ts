import { podTable, uri, timestamp, id } from 'drizzle-solid'
import { AS, DCTerms } from './namespaces'

// Solid inbox notifications (protocol channel)
export const inboxNotificationTable = podTable(
  'inbox_notification',
  {
    id: id('id'),

    // Standard ActivityStreams envelope
    actor: uri('actor').predicate(AS.actor),
    object: uri('object').predicate(AS.object).notNull(),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
  },
  {
    base: '/inbox/',
    sparqlEndpoint: '/inbox/-/sparql',
    type: AS.Announce,
    namespace: AS,
    subjectTemplate: '{id}.ttl',
  },
)

export type InboxNotificationRow = typeof inboxNotificationTable.$inferSelect
export type InboxNotificationInsert = typeof inboxNotificationTable.$inferInsert
export type InboxNotificationUpdate = typeof inboxNotificationTable.$inferUpdate
