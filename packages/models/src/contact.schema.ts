import { podTable, string, text, timestamp, uri, boolean, id } from 'drizzle-solid'
import { LINQ, DCTerms, VCARD, AS, FOAF } from './namespaces'

/**
 * Contact Table - Unified contact index for all contact types
 * 
 * This table serves as a local index for:
 * - Solid users (with WebID)
 * - External platform users (WeChat, Telegram, etc.)
 * - AI agents
 * 
 * For Solid users, the social graph (foaf:knows) is stored in the Profile.
 * This table stores private metadata (alias, starred, notes) and provides
 * unified search/display capabilities.
 * 
 * entityUri points to the actual entity:
 * - Solid user: their WebID (https://alice.pod/profile/card#me)
 * - External user: this contact's own URI (self-referential)
 * - AI agent: the Agent record URI (/.data/agents/xxx.ttl#this)
 */
export const contactTable = podTable(
  'contact',
  {
    id: id('id'),
    
    // Display information (cached for search/display)
    name: string('name').predicate(VCARD.fn).notNull(),
    avatarUrl: uri('avatarUrl').predicate(VCARD.hasPhoto),
    
    // The actual entity this contact represents
    // - Solid: WebID (https://alice.pod/profile/card#me)
    // - External: self URI (/.data/contacts/{id}.ttl#this)
    // - Agent: Agent URI (/.data/agents/{id}.ttl#this)
    entityUri: uri('entityUri').predicate(FOAF.primaryTopic).notNull(),
    
    // Contact type: 'solid' | 'external' | 'agent'
    contactType: string('contactType').predicate(LINQ.contactType).notNull(),
    
    // Whether to add to Profile's foaf:knows (Solid social graph)
    // Uses Activity Streams vocabulary for visibility
    // true = as:Public (visible in foaf:knows)
    // false = private (only in this table)
    isPublic: boolean('isPublic').predicate(AS.audience).default(false),
    
    // External platform users
    externalPlatform: string('externalPlatform').predicate(LINQ.externalPlatform),
    externalId: string('externalId').predicate(LINQ.externalId),
    
    // User's private metadata
    alias: string('alias').predicate(LINQ.alias),
    starred: boolean('starred').predicate(LINQ.favorite).default(false),
    note: text('note').predicate(VCARD.note),
    sortKey: string('sortKey').predicate(LINQ.sortKey),
    
    // Demographics
    gender: string('gender').predicate(VCARD.hasGender),
    province: string('province').predicate(VCARD.region),
    city: string('city').predicate(VCARD.locality),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
    deletedAt: timestamp('deletedAt').predicate(LINQ.deletedAt),
    lastSyncedAt: timestamp('lastSyncedAt').predicate(LINQ.lastSyncedAt),
  },
  {
    base: '/.data/contacts/',
    sparqlEndpoint: '/.data/contacts/-/sparql',
    type: VCARD.Individual,
    namespace: LINQ,
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
} as const

export type ContactTypeValue = typeof ContactType[keyof typeof ContactType]
