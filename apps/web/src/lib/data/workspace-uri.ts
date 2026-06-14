export type WorkspaceKind = 'folder' | 'worktree'
export type WorkspaceType = 'pod' | 'local'
const LOCAL_WORKSPACE_URI_PATTERN = /^linx:\/\/(device-[^/]+)(\/.*)$/

// Workspace is a container URI. This metadata is an optional display/cache
// projection for UI summaries; it is not a standalone Pod resource model.
export interface WorkspaceContainerMetadata {
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
  return new URL(getWorkspaceContainerPath(workspaceId).replace(/^\/+/u, ''), normalizeContainerBase(podBaseUrl)).toString()
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
    return buildLocalWorkspaceId(localWorkspace.deviceId, localWorkspace.path)
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

export function buildLocalWorkspaceUri(deviceId: string, path: string): string {
  return buildLocalContainer(deviceId, path)
}

export function buildLocalContainer(deviceId: string, path: string): string {
  const normalizedDeviceId = deviceId.trim()
  const normalizedPath = normalizeLocalWorkspacePath(path)
  if (!normalizedDeviceId || !normalizedPath) {
    throw new Error('deviceId and path are required to build a local workspace URI.')
  }

  const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  return `linx://${encodeURIComponent(normalizedDeviceId)}${encodePathname(absolutePath)}`
}

export function buildLocalWorkspaceId(deviceId: string, path: string): string {
  const normalizedDeviceId = deviceId.trim()
  const normalizedPath = normalizeLocalWorkspacePath(path)
  if (!normalizedDeviceId || !normalizedPath) {
    throw new Error('deviceId and path are required to build a local workspace id.')
  }

  return `local-${sanitizeWorkspaceIdSegment(normalizedDeviceId)}-${stableWorkspaceHash(normalizedPath)}`
}

export function isLocalWorkspaceUri(uri?: string | null): boolean {
  return typeof uri === 'string' && LOCAL_WORKSPACE_URI_PATTERN.test(uri)
}

export function parseLocalWorkspaceUri(uri?: string | null): { deviceId: string; path: string } | null {
  if (!isLocalWorkspaceUri(uri)) {
    return null
  }

  const match = uri?.match(LOCAL_WORKSPACE_URI_PATTERN)
  if (!match?.[1]) {
    return null
  }

  return {
    deviceId: decodeURIComponent(match[1]),
    path: normalizeLocalWorkspacePath(decodePathname(match[2])),
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

  return buildLocalWorkspaceUri(localWorkspace.deviceId, repoPath)
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
    || 'device'
}

function stableWorkspaceHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
