export type WorkspaceKind = 'folder' | 'worktree'
export type WorkspaceType = 'pod' | 'local'

export interface WorkspaceRow {
  id: string
  title: string
  workspaceType: WorkspaceType
  kind: WorkspaceKind
  rootUri: string
  repoRootUri?: string
  baseRef?: string
  branch?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}

export type WorkspaceInsert = Partial<WorkspaceRow> & Pick<WorkspaceRow, 'id' | 'title' | 'rootUri'>

export function normalizeWorkspaceType(value: unknown): WorkspaceType {
  return value === 'local' ? 'local' : 'pod'
}

export function normalizeWorkspaceKind(value: unknown): WorkspaceKind {
  if (value === 'worktree' || value === 'git') {
    return 'worktree'
  }
  return 'folder'
}

export function inferWorkspaceKind(input: {
  repoPath?: string | null
  folderPath?: string | null
}): WorkspaceKind {
  const repoPath = normalizeLocalWorkspacePath(input.repoPath)

  if (repoPath) {
    return 'worktree'
  }
  return 'folder'
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

export function resolveWorkspaceIdFromUri(uri?: string | null): string | null {
  const podWorkspaceId = parseWorkspaceIdFromContainerUri(uri)
  if (podWorkspaceId) {
    return podWorkspaceId
  }

  const localWorkspace = parseLocalWorkspaceUri(uri)
  if (localWorkspace) {
    return buildLocalWorkspaceId(localWorkspace.nodeId, localWorkspace.path)
  }

  return null
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

export function buildLocalWorkspaceId(nodeId: string, path: string): string {
  const normalizedNodeId = nodeId.trim()
  const normalizedPath = normalizeLocalWorkspacePath(path)
  if (!normalizedNodeId || !normalizedPath) {
    throw new Error('nodeId and path are required to build a local workspace id.')
  }

  return `local-${sanitizeWorkspaceIdSegment(normalizedNodeId)}-${stableWorkspaceHash(normalizedPath)}`
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

export function resolveLocalRepoRootUri(input: {
  workspaceUri?: string | null
  repoPath?: string | null
}): string | undefined {
  const localWorkspace = parseLocalWorkspaceUri(input.workspaceUri)
  const repoPath = normalizeLocalWorkspacePath(input.repoPath)
  if (!localWorkspace || !repoPath) {
    return undefined
  }

  return buildLocalWorkspaceUri(localWorkspace.nodeId, repoPath)
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

function sanitizeWorkspaceIdSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'node'
}

function stableWorkspaceHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
