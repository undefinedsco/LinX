import { DCTerms, SCHEMA, UDFS, WF } from '../namespaces.js'

/** Chat channel vocab (thin place/container). */
export const ChatBaseVocab = {
  // Display
  title: DCTerms.title,
  description: DCTerms.description,
  avatarUrl: SCHEMA.image,

  // Participants (protocol-aligned)
  participants: WF.participant,
  metadata: UDFS.metadata,

  // State
  starred: UDFS.favorite,
  muted: UDFS.muted,
  unreadCount: UDFS.unreadCount,

  // Activity
  lastActiveAt: UDFS.lastActiveAt,
  lastMessageId: WF.message,
  lastMessagePreview: SCHEMA.text,

  // Timestamps
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
} as const
