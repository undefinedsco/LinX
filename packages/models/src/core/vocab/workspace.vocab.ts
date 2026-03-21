import { DCTerms, UDFS } from '../namespaces.js'

export const WorkspaceVocab = {
  title: DCTerms.title,
  workspaceType: UDFS.workspaceType,
  kind: UDFS.workspaceKind,
  rootUri: UDFS.rootUri,
  repoRootUri: UDFS.repoRootUri,
  baseRef: UDFS.baseRef,
  branch: UDFS.branch,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
  type: UDFS.Workspace,
} as const
