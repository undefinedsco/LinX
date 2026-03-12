import { DCTerms, LINX_CHAT, SIOC, UDFS } from '../namespaces'

export const ThreadVocab = {
  chatId: SIOC.has_parent,
  title: DCTerms.title,
  starred: UDFS.favorite,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,

  // Execution context: workspace container (Agent@workspace)
  workspace: LINX_CHAT.workspace,

  // Type marker (for SPARQL convenience)
  type: SIOC.Thread,
} as const
