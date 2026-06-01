import {
  id,
  podTable,
  string,
  timestamp,
  uri,
  type InferInsertData,
  type InferTableData,
} from '@undefineds.co/drizzle-solid'
import { DCTerms, UDFS } from '@undefineds.co/models'

export type WorkspaceKind = 'folder' | 'git' | 'worktree'
export type WorkspaceType = 'pod'

export const workspaceTable = podTable('workspace', {
  id: id('id'),
  title: string('title').predicate(DCTerms.title).notNull(),
  workspaceType: string('workspaceType').predicate(UDFS.term('workspaceType')).notNull().default('pod'),
  kind: string('kind').predicate(UDFS.term('workspaceKind')).notNull().default('folder'),
  root: uri('root').predicate(UDFS.term('root')).notNull(),
  repoRoot: uri('repoRoot').predicate(UDFS.term('repoRoot')),
  baseRef: string('baseRef').predicate(UDFS.term('baseRef')),
  branch: string('branch').predicate(UDFS.term('branch')),
  createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
}, {
  base: '/.data/workspaces/',
  sparqlEndpoint: '/.data/workspaces/-/sparql',
  type: UDFS.term('Workspace'),
  namespace: UDFS,
  subjectTemplate: '{id}/index.ttl#this',
})

export type WorkspaceRow = InferTableData<typeof workspaceTable> & {
  workspaceType: WorkspaceType
  kind: WorkspaceKind
}
export type WorkspaceInsert = InferInsertData<typeof workspaceTable> & {
  workspaceType?: WorkspaceType
  kind?: WorkspaceKind
}

export function resolveWorkspaceContainerUri(podBaseUrl: string, workspaceId: string): string {
  return new URL(getWorkspaceContainerPath(workspaceId), normalizeContainerBase(podBaseUrl)).toString()
}

export function getWorkspaceContainerPath(workspaceId: string): string {
  return `/.data/workspaces/${encodeURIComponent(workspaceId)}/`
}

export function parseWorkspaceIdFromContainerUri(uri?: string | null): string | null {
  if (!uri) {
    return null
  }

  try {
    const parsed = new URL(uri)
    const match = parsed.pathname.match(/\/\.data\/workspaces\/([^/]+)\/?/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    const match = uri.match(/\/\.data\/workspaces\/([^/]+)\/?/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }
}

export function normalizeLocalWorkspacePath(path?: string | null): string {
  const trimmed = path?.trim()
  if (!trimmed) {
    return ''
  }

  let normalized = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/')
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function buildLocalWorkspaceUri(nodeId: string, path: string): string {
  const normalizedNodeId = nodeId.trim()
  const normalizedPath = normalizeLocalWorkspacePath(path)
  if (!normalizedNodeId || !normalizedPath) {
    throw new Error('nodeId and path are required to build a local workspace URI.')
  }

  const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  return `linx://${encodeURIComponent(normalizedNodeId)}${encodePathname(absolutePath)}`
}

export function isLocalWorkspaceUri(uri?: string | null): boolean {
  return typeof uri === 'string' && uri.startsWith('linx://')
}

export function parseLocalWorkspaceUri(uri?: string | null): { nodeId: string; path: string } | null {
  if (!isLocalWorkspaceUri(uri)) {
    return null
  }

  const match = uri?.match(/^linx:\/\/([^/]+)(\/.*)?$/)
  if (!match?.[1]) {
    return null
  }

  return {
    nodeId: decodeURIComponent(match[1]),
    path: normalizeLocalWorkspacePath(decodePathname(match[2] ?? '/')),
  }
}

function normalizeContainerBase(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function encodePathname(pathname: string): string {
  return pathname.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function decodePathname(pathname: string): string {
  return pathname.split('/').map((segment) => decodeURIComponent(segment)).join('/')
}
