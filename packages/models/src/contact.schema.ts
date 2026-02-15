import { podTable, string, text, timestamp, uri, boolean, id } from 'drizzle-solid'
import { UDFS, DCTerms, VCARD, AS, FOAF } from './namespaces'

/**
 * Contact Table - Unified contact index for all contact types.
 */
export const contactTable = podTable(
  'contact',
  {
    id: id('id'),

    // Display information (cached for search/display)
    name: string('name').predicate(VCARD.fn).notNull(),
    avatarUrl: uri('avatarUrl').predicate(VCARD.hasPhoto),

    // The actual entity this contact represents
    entityUri: uri('entityUri').predicate(FOAF.primaryTopic).notNull(),

    // Contact type: 'solid' | 'external' | 'agent' | 'group'
    contactType: string('contactType').predicate(UDFS.contactType).notNull(),

    // Visibility (Solid social graph)
    isPublic: boolean('isPublic').predicate(AS.audience).default(false),

    // External platform users
    externalPlatform: string('externalPlatform').predicate(UDFS.externalPlatform),
    externalId: string('externalId').predicate(UDFS.externalId),

    // User's private metadata
    alias: string('alias').predicate(UDFS.alias),
    starred: boolean('starred').predicate(UDFS.favorite).default(false),
    note: text('note').predicate(VCARD.note),
    sortKey: string('sortKey').predicate(UDFS.sortKey),

    // Demographics
    gender: string('gender').predicate(VCARD.hasGender),
    province: string('province').predicate(VCARD.region),
    city: string('city').predicate(VCARD.locality),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
    deletedAt: timestamp('deletedAt').predicate(UDFS.deletedAt),
    lastSyncedAt: timestamp('lastSyncedAt').predicate(UDFS.lastSyncedAt),
  },
  {
    base: '/.data/contacts/',
    sparqlEndpoint: '/.data/contacts/-/sparql',
    type: VCARD.Individual,
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)

export type ContactRow = typeof contactTable.$inferSelect
export type ContactInsert = typeof contactTable.$inferInsert
export type ContactUpdate = typeof contactTable.$inferUpdate

// Contact type constants
export const ContactType = {
  SOLID: 'solid',
  EXTERNAL: 'external',
  AGENT: 'agent',
  GROUP: 'group',
} as const

export type ContactTypeValue = typeof ContactType[keyof typeof ContactType]
