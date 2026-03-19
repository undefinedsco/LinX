import { id, podTable, string, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms } from './namespaces'

export const WORKSPACE_TYPES = ['pod', 'local'] as const
export type WorkspaceType = typeof WORKSPACE_TYPES[number]

export const WORKSPACE_KINDS = ['folder', 'git', 'worktree'] as const
export type WorkspaceKind = typeof WORKSPACE_KINDS[number]

const URI_WITH_SLASHES = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//
const WINDOWS_PATH_PREFIX = /^[a-zA-Z]:[\\/]/

/**
 * Workspace schema.
 *
 * Only Pod-backed workspace metadata is persisted here.
 * Local workspaces are addressed directly via `linx://{node-id}/path/to/root`.
 */
export const workspaceTable = podTable(
  'workspace',
  {
    id: id('id'),
    title: string('title').predicate(DCTerms.title),
    workspaceType: string('workspaceType').predicate(UDFS.workspaceType).notNull().default('pod'),
    kind: string('kind').predicate(UDFS.workspaceKind).notNull().default('folder'),
    rootUri: uri('rootUri').predicate(UDFS.rootUri),
    repoRootUri: uri('repoRootUri').predicate(UDFS.repoRootUri),
    baseRef: string('baseRef').predicate(UDFS.baseRef),
    branch: string('branch').predicate(UDFS.branch),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/workspaces/',
    sparqlEndpoint: '/.data/workspaces/-/sparql',
    type: UDFS.Workspace,
    namespace: UDFS,
    subjectTemplate: '{id}/index.ttl#this',
  },
)

export type WorkspaceRow = typeof workspaceTable.$inferSelect
export type WorkspaceInsert = typeof workspaceTable.$inferInsert
export type WorkspaceUpdate = typeof workspaceTable.$inferUpdate

export function getWorkspaceContainerPath(workspaceId: string): string {
  return `/.data/workspaces/${workspaceId}/`
}

export function resolveWorkspaceContainerUri(podBaseUrl: string, workspaceId: string): string {
  return `${podBaseUrl.replace(/\/$/, '')}${getWorkspaceContainerPath(workspaceId)}`
}

export function parseWorkspaceIdFromContainerUri(workspaceUri?: string | null): string | null {
  if (!workspaceUri) return null
  const match = workspaceUri.match(/\/\.data\/workspaces\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

export function normalizeLocalWorkspacePath(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('file://')) {
    try {
      const url = new URL(trimmed)
      const normalized = decodeURIComponent(url.pathname || '').replace(/\/{2,}/g, '/')
      return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized
    } catch {
      return trimmed
    }
  }

  if (trimmed.startsWith('linx://')) {
    return parseLocalWorkspaceUri(trimmed)?.path
  }

  if (URI_WITH_SLASHES.test(trimmed)) {
    return trimmed
  }

  if (WINDOWS_PATH_PREFIX.test(trimmed)) {
    return `/${trimmed.replace(/\\/g, '/')}`.replace(/\/{2,}/g, '/')
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  if (normalized.startsWith('/')) {
    return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized
  }

  return `/${normalized.replace(/^\/+/, '')}`.replace(/\/$/, '')
}

export function buildLocalWorkspaceUri(nodeId: string, rootPath: string): string {
  const normalizedNodeId = nodeId.trim()
  const normalizedPath = normalizeLocalWorkspacePath(rootPath)
  if (!normalizedNodeId) {
    throw new Error('nodeId is required for local workspace URIs.')
  }
  if (!normalizedPath) {
    throw new Error('rootPath is required for local workspace URIs.')
  }

  const encodedPath = normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `linx://${encodeURIComponent(normalizedNodeId)}/${encodedPath}`
}

export function isLocalWorkspaceUri(workspaceUri?: string | null): boolean {
  return typeof workspaceUri === 'string' && workspaceUri.startsWith('linx://')
}

export function parseLocalWorkspaceUri(workspaceUri?: string | null): { nodeId: string; path: string } | null {
  if (!workspaceUri || !isLocalWorkspaceUri(workspaceUri)) return null

  try {
    const url = new URL(workspaceUri)
    const nodeId = decodeURIComponent(url.host)
    const path = decodeURIComponent(url.pathname || '').replace(/\/{2,}/g, '/')
    return {
      nodeId,
      path: path.length > 1 ? path.replace(/\/$/, '') : path,
    }
  } catch {
    return null
  }
}
