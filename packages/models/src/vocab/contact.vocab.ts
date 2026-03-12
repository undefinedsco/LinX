import { AS, DCTerms, FOAF, RDF, UDFS, VCARD } from '../namespaces'

export const ContactVocab = {
  name: VCARD.fn,
  avatarUrl: VCARD.hasPhoto,
  entityUri: FOAF.primaryTopic,
  rdfType: RDF.type,
  contactType: UDFS.contactType,
  isPublic: AS.audience,
  externalPlatform: UDFS.externalPlatform,
  externalId: UDFS.externalId,
  alias: UDFS.alias,
  starred: UDFS.favorite,
  note: VCARD.note,
  sortKey: UDFS.sortKey,
  gender: VCARD.hasGender,
  province: VCARD.region,
  city: VCARD.locality,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
  deletedAt: UDFS.deletedAt,
  lastSyncedAt: UDFS.lastSyncedAt,
} as const
