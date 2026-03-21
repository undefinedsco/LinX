import { DCTerms, FOAF, LINX_MSG, SCHEMA, SIOC, UDFS, WF } from '../namespaces.js'

export const MessageVocab = {
  // Existing
  thread: SIOC.hasContainer,
  chat: WF.message,
  maker: FOAF.maker,
  role: UDFS.messageType,
  content: SIOC.content,
  richContent: SIOC.richContent,
  status: UDFS.messageStatus,
  replacedBy: DCTerms.isReplacedBy,
  deletedAt: SCHEMA.dateDeleted,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,

  // Group message extensions
  senderName: LINX_MSG.senderName,
  senderAvatarUrl: LINX_MSG.senderAvatarUrl,
  mentions: LINX_MSG.mentions,
  replyTo: LINX_MSG.replyTo,

  // Multi-AI routing
  routedBy: LINX_MSG.routedBy,
  routeTargetAgentId: LINX_MSG.routeTargetAgentId,
  coordinationId: LINX_MSG.coordinationId,
} as const
