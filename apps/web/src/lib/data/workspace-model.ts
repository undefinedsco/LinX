export {
  getWorkspaceContainerPath,
  parseWorkspaceIdFromContainerUri,
  resolveWorkspaceContainerUri,
  workspaceResource,
  workspaceTable,
  type WorkspaceInsert,
  type WorkspaceKind,
  type WorkspaceRow,
  type WorkspaceType,
} from '@undefineds.co/models'

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

function encodePathname(pathname: string): string {
  return pathname.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function decodePathname(pathname: string): string {
  return pathname.split('/').map((segment) => decodeURIComponent(segment)).join('/')
}
