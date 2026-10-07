import type { StructuredViewMetadata } from '../structured/structured-view-metadata'
import type {
  FilesEntryKind,
  FilesEntrySemanticKind,
} from './resource-semantics'

export type {
  FilesEntryKind,
  FilesEntrySemanticKind,
  FilesOpenMode,
  FilesResourceAction,
  FilesResourceSidecars,
  FilesSidecarPlacement,
} from './resource-semantics'

export const ALL_FILES_NODE_ID = 'all'
export const RECENT_FILES_NODE_ID = 'smart-root:recent'
export const POD_ROOT_NODE_ID = 'pod-root'
export const AGENTS_ROOT_NODE_ID = 'smart-root:agents'
export const WORKSPACES_ROOT_NODE_ID = 'smart-root:workspaces'
export const REPOSITORIES_ROOT_NODE_ID = 'smart-root:repositories'

export type FilesTreeNodeType =
  | 'all'
  | 'recent'
  | 'workspace'
  | 'local-workspace'
  | 'agents-root'
  | 'workspaces-root'
  | 'repositories-root'
  | 'container'
  | 'resource'

export type FilesResourceReadErrorKind = 'unauthorized' | 'forbidden' | 'missing' | 'network' | 'unknown'

export interface FilesTreeNode {
  id: string
  label: string
  type: FilesTreeNodeType
  uri?: string
  parentId?: string
  count?: number
}

export interface FilesEntry {
  id: string
  uri: string
  name: string
  kind: FilesEntryKind
  semanticKind: FilesEntrySemanticKind
  parentUri: string
  mimeType: string | null
  size: number | null
  modifiedAt: string | null
  metadataState?: 'available' | 'unavailable'
  metadataErrorKind?: FilesResourceReadErrorKind
  metadataError?: string
  sourceLabel?: string
  summary?: string
  tags?: string[]
}

export interface FilesDetail extends FilesEntry {
  headers: Record<string, string>
  previewText: string | null
  childEntries?: FilesEntry[]
  previewUnavailableReason?: string
}

export interface FilesRawTextResource {
  uri: string
  content: string
  mimeType: string
  etag: string | null
  headers: Record<string, string>
}

export interface FilesBlobResource {
  uri: string
  blob: Blob
  mimeType: string
  headers: Record<string, string>
}

export class FilesSaveConflictError extends Error {
  constructor(uri: string, options?: { reason?: 'modified' | 'exists' }) {
    super(options?.reason === 'exists'
      ? `同名资源已存在：${uri}。`
      : `保存冲突：${uri} 已被其他客户端修改。`)
    this.name = 'FilesSaveConflictError'
  }
}

export class FilesResourceReadError extends Error {
  readonly uri: string
  readonly status?: number
  readonly kind: FilesResourceReadErrorKind

  constructor(uri: string, options: { status?: number; cause?: unknown }) {
    const kind = getResourceReadErrorKind(options.status)
    const reason = options.status
      ? `HTTP ${options.status}`
      : options.cause instanceof Error
        ? options.cause.message
        : options.cause
          ? String(options.cause)
          : 'unknown'

    super(`读取资源失败: ${uri} (${reason})`)
    this.name = 'FilesResourceReadError'
    this.uri = uri
    this.status = options.status
    this.kind = kind
  }
}

export type FilesAccessSourceProbeState = 'exists' | 'missing' | 'inaccessible' | 'unknown'

export interface FilesAccessSourceProbe {
  uri: string
  state: FilesAccessSourceProbeState
  status?: number
}

export interface FilesMetaSidecar {
  ownerUri: string
  metaUri: string
  state: FilesAccessSourceProbeState
  status?: number
  content: string | null
  mimeType: string | null
  etag: string | null
  size: number | null
}

export interface FilesStructuredViewMetadataSidecar extends FilesMetaSidecar {
  metadata: Required<StructuredViewMetadata> | null
}

export interface FilesAccessBasics {
  ownerUri: string
  activeSource: {
    provider: 'acl' | 'acr' | 'unknown'
    uri: string
    confidence: 'linked' | 'unknown'
    inheritance: 'direct' | 'inherited-or-candidate'
  } | null
  effectiveAccess: {
    user: {
      read: boolean
      append: boolean
      write: boolean
      control?: boolean
    }
    public?: {
      read: boolean
      append: boolean
      write: boolean
      control?: boolean
    }
  } | null
  policySummary: FilesAccessPolicySummary | null
  candidates: Array<{
    provider: 'acr' | 'acl'
    uri: string
    existence: FilesAccessSourceProbe
  }>
}

export type FilesEffectiveAccess = NonNullable<FilesAccessBasics['effectiveAccess']>

export type FilesAccessAudienceKind = 'public' | 'authenticated' | 'agent'

export interface FilesAccessPolicyGrant {
  audience: FilesAccessAudienceKind
  audienceRef: string
  modes: {
    read: boolean
    append: boolean
    write: boolean
    control: boolean
  }
}

export interface FilesAccessPolicySummary {
  uri: string
  provider: 'acl'
  state: FilesAccessSourceProbeState
  status?: number
  grants: FilesAccessPolicyGrant[]
}

export interface FilesRootData {
  nodes: FilesTreeNode[]
  podRootUri: string
  entries?: FilesEntry[]
}

export interface FilesResourceTransferInput {
  sourceUri: string
  destinationUri: string
}

export interface FilesFolderCreateInput {
  containerUri: string
  name: string
}

function getResourceReadErrorKind(status?: number): FilesResourceReadErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'missing'
  if (status == null) return 'network'
  return 'unknown'
}
