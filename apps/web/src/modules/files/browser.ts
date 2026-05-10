import {
  isLocalWorkspaceUri,
  parseLocalWorkspaceUri,
  type SolidDatabase,
} from '@undefineds.co/models'

export const ALL_FILES_NODE_ID = 'all'
export const POD_ROOT_NODE_ID = 'pod-root'

export type FilesTreeNodeType = 'all' | 'workspace' | 'local-workspace' | 'container'
export type FilesEntryKind = 'container' | 'resource'

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
  parentUri: string
  mimeType: string | null
  size: number | null
  modifiedAt: string | null
  sourceLabel?: string
}

export interface FilesDetail extends FilesEntry {
  headers: Record<string, string>
  previewText: string | null
  previewUnavailableReason?: string
}

export interface FilesRootData {
  nodes: FilesTreeNode[]
  podRootUri: string
}

interface ResourceMetadata {
  headers: Record<string, string>
  mimeType: string | null
  size: number | null
  modifiedAt: string | null
}

type PodDialectLike = {
  getPodUrl?: () => string
  getAuthenticatedFetch?: () => typeof fetch
  listContainerResources?: (containerUrl: string) => Promise<string[]>
}

const TEXT_MIME_PREFIXES = ['text/']
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
])

const MIME_BY_EXTENSION: Record<string, string> = {
  css: 'text/css',
  csv: 'text/csv',
  html: 'text/html',
  js: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mjs: 'application/javascript',
  sh: 'application/x-sh',
  svg: 'image/svg+xml',
  ts: 'application/typescript',
  tsx: 'application/typescript',
  ttl: 'text/turtle',
  txt: 'text/plain',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
}

function getDialect(db: SolidDatabase | null | undefined): PodDialectLike | null {
  return (db as any)?.getDialect?.() ?? null
}

export function getPodRootUri(db: SolidDatabase): string {
  const podUrl = getDialect(db)?.getPodUrl?.()
  if (typeof podUrl !== 'string' || podUrl.trim().length === 0) {
    throw new Error('Pod 根路径不可用。')
  }
  return normalizeContainerUri(podUrl)
}

function getAuthenticatedFetch(db: SolidDatabase): typeof fetch {
  const authFetch = getDialect(db)?.getAuthenticatedFetch?.()
  if (typeof authFetch !== 'function') {
    throw new Error('认证 fetch 不可用。')
  }
  return authFetch
}

function getContainerLister(db: SolidDatabase): (containerUrl: string) => Promise<string[]> {
  const listContainerResources = getDialect(db)?.listContainerResources
  if (typeof listContainerResources !== 'function') {
    throw new Error('drizzle-solid 当前未暴露容器列举能力。')
  }
  return listContainerResources.bind(getDialect(db))
}

export function normalizeContainerUri(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`
}

export function createContainerNodeId(uri: string): string {
  return `container:${normalizeContainerUri(uri)}`
}

export function createWorkspaceNodeId(workspaceUri: string): string {
  return `workspace:${workspaceUri}`
}

export function createLocalWorkspaceNodeId(workspaceUri: string): string {
  return `local-workspace:${workspaceUri}`
}

export function parseTreeNodeId(nodeId?: string | null): {
  kind: FilesTreeNodeType
  uri?: string
} | null {
  if (!nodeId) return null
  if (nodeId === ALL_FILES_NODE_ID) return { kind: 'all' }
  if (nodeId === POD_ROOT_NODE_ID) return { kind: 'container' }
  if (nodeId.startsWith('workspace:')) {
    return { kind: 'workspace', uri: nodeId.slice('workspace:'.length) }
  }
  if (nodeId.startsWith('local-workspace:')) {
    return { kind: 'local-workspace', uri: nodeId.slice('local-workspace:'.length) }
  }
  if (nodeId.startsWith('container:')) {
    return { kind: 'container', uri: nodeId.slice('container:'.length) }
  }
  return null
}

export function getEntryName(uri: string): string {
  try {
    const normalized = uri.endsWith('/') ? uri.slice(0, -1) : uri
    const url = new URL(normalized)
    const pathname = url.pathname.split('/').filter(Boolean)
    const tail = pathname[pathname.length - 1]
    return decodeURIComponent(tail ?? normalized)
  } catch {
    const normalized = uri.endsWith('/') ? uri.slice(0, -1) : uri
    return decodeURIComponent(normalized.split('/').filter(Boolean).pop() ?? normalized)
  }
}

export function getContainerLabel(uri: string, podRootUri?: string | null): string {
  if (podRootUri && normalizeContainerUri(uri) === normalizeContainerUri(podRootUri)) {
    return 'Pod 根目录'
  }
  return getEntryName(uri)
}

export function getParentContainerUri(uri: string): string | null {
  try {
    const url = new URL(uri)
    const normalizedPath = uri.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
    const segments = normalizedPath.split('/').filter(Boolean)
    if (segments.length === 0) return null
    const parentSegments = uri.endsWith('/')
      ? segments.slice(0, -1)
      : segments.slice(0, -1)
    url.pathname = parentSegments.length > 0 ? `/${parentSegments.join('/')}/` : '/'
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return null
  }
}

function guessMimeType(uri: string, isContainer: boolean): string | null {
  if (isContainer) return 'inode/container'
  const extension = uri.split('.').pop()?.toLowerCase()
  if (!extension) return null
  return MIME_BY_EXTENSION[extension] ?? null
}

function isTextLikeMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false
  return TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || TEXT_MIME_TYPES.has(mimeType)
}

function toIsoString(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

async function readMetadata(db: SolidDatabase, uri: string): Promise<ResourceMetadata> {
  const authFetch = getAuthenticatedFetch(db)
  let response: Response | null = null

  try {
    response = await authFetch(uri, { method: 'HEAD' })
    if (response.status === 405) {
      response = await authFetch(uri, { method: 'GET' })
      try {
        await response.body?.cancel?.()
      } catch {
        // ignore
      }
    }
  } catch (error) {
    throw new Error(`读取资源头信息失败: ${uri} (${error instanceof Error ? error.message : String(error)})`)
  }

  const headers = Object.fromEntries(response.headers.entries())
  const mimeType = headers['content-type']?.split(';')[0]?.trim() ?? guessMimeType(uri, uri.endsWith('/'))
  const sizeHeader = headers['content-length']
  const parsedSize = sizeHeader ? Number.parseInt(sizeHeader, 10) : Number.NaN

  return {
    headers,
    mimeType,
    size: Number.isFinite(parsedSize) ? parsedSize : null,
    modifiedAt: toIsoString(headers['last-modified'] ?? null),
  }
}

function sortEntries(entries: FilesEntry[]): FilesEntry[] {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'container' ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

export async function listContainerEntries(
  db: SolidDatabase,
  containerUri: string,
  sourceLabel?: string,
): Promise<FilesEntry[]> {
  const normalizedContainerUri = normalizeContainerUri(containerUri)
  const listContainerResources = getContainerLister(db)
  const resourceUris = await listContainerResources(normalizedContainerUri)

  const entries = await Promise.all(resourceUris.map(async (uri) => {
    const normalizedUri = uri.endsWith('/') ? normalizeContainerUri(uri) : uri
    const kind: FilesEntryKind = normalizedUri.endsWith('/') ? 'container' : 'resource'
    const metadata = await readMetadata(db, normalizedUri)

    return {
      id: normalizedUri,
      uri: normalizedUri,
      name: getEntryName(normalizedUri),
      kind,
      parentUri: normalizedContainerUri,
      mimeType: metadata.mimeType,
      size: metadata.size,
      modifiedAt: metadata.modifiedAt,
      sourceLabel,
    } satisfies FilesEntry
  }))

  return sortEntries(entries)
}

export async function listAllBrowsableEntries(
  db: SolidDatabase,
  workspaceUri?: string | null,
): Promise<FilesEntry[]> {
  const podRootUri = getPodRootUri(db)
  const sources: Array<{ uri: string; label: string }> = []

  if (workspaceUri && !isLocalWorkspaceUri(workspaceUri)) {
    sources.push({ uri: normalizeContainerUri(workspaceUri), label: '当前话题' })
  }
  sources.push({ uri: podRootUri, label: 'Pod 根目录' })

  const entriesByUri = new Map<string, FilesEntry>()

  for (const source of sources) {
    const entries = await listContainerEntries(db, source.uri, source.label)
    for (const entry of entries) {
      if (!entriesByUri.has(entry.uri)) {
        entriesByUri.set(entry.uri, entry)
      }
    }
  }

  return sortEntries(Array.from(entriesByUri.values()))
}

export async function buildRootNodes(
  db: SolidDatabase,
  workspaceUri?: string | null,
): Promise<FilesRootData> {
  const podRootUri = getPodRootUri(db)
  const podRootEntries = await listContainerEntries(db, podRootUri, 'Pod 根目录')

  let workspaceNode: FilesTreeNode | null = null
  let workspaceEntries: FilesEntry[] = []
  let workspaceCount = 0

  if (workspaceUri) {
    if (isLocalWorkspaceUri(workspaceUri)) {
      const localWorkspace = parseLocalWorkspaceUri(workspaceUri)
      workspaceNode = {
        id: createLocalWorkspaceNodeId(workspaceUri),
        label: localWorkspace?.path || '当前话题目录',
        type: 'local-workspace',
        uri: workspaceUri,
      }
    } else {
      workspaceEntries = await listContainerEntries(db, workspaceUri, '当前话题')
      workspaceCount = workspaceEntries.length
      workspaceNode = {
        id: createWorkspaceNodeId(workspaceUri),
        label: '当前话题容器',
        type: 'workspace',
        uri: normalizeContainerUri(workspaceUri),
        count: workspaceCount,
      }
    }
  }

  const allCount = workspaceNode?.type === 'workspace'
    ? new Set([
      ...podRootEntries.map((entry) => entry.uri),
      ...workspaceEntries.map((entry) => entry.uri),
    ]).size
    : podRootEntries.length

  const nodes: FilesTreeNode[] = [
    {
      id: ALL_FILES_NODE_ID,
      label: '全部可浏览资源',
      type: 'all',
      count: allCount,
    },
  ]

  if (workspaceNode) {
    nodes.push(workspaceNode)
  }

  nodes.push({
    id: POD_ROOT_NODE_ID,
    label: 'Pod 根目录',
    type: 'container',
    uri: podRootUri,
    count: podRootEntries.length,
  })

  return { nodes, podRootUri }
}

export async function listContainerChildNodes(
  db: SolidDatabase,
  containerUri: string,
  parentId: string,
  podRootUri?: string | null,
): Promise<FilesTreeNode[]> {
  const entries = await listContainerEntries(db, containerUri)
  return entries
    .filter((entry) => entry.kind === 'container')
    .map((entry) => ({
      id: createContainerNodeId(entry.uri),
      label: getContainerLabel(entry.uri, podRootUri),
      type: 'container' as const,
      uri: entry.uri,
      parentId,
    }))
}

export async function readFileDetail(db: SolidDatabase, resourceUri: string): Promise<FilesDetail> {
  const normalizedUri = resourceUri.endsWith('/') ? normalizeContainerUri(resourceUri) : resourceUri
  const kind: FilesEntryKind = normalizedUri.endsWith('/') ? 'container' : 'resource'
  const metadata = await readMetadata(db, normalizedUri)
  const parentUri = getParentContainerUri(normalizedUri) ?? getPodRootUri(db)

  let previewText: string | null = null
  let previewUnavailableReason: string | undefined

  if (kind === 'resource' && isTextLikeMimeType(metadata.mimeType)) {
    try {
      const response = await getAuthenticatedFetch(db)(normalizedUri, {
        method: 'GET',
        headers: {
          Accept: `${metadata.mimeType ?? 'text/plain'}, text/plain;q=0.9, */*;q=0.1`,
        },
      })
      if (response.ok) {
        const text = await response.text()
        previewText = text.length > 12000 ? `${text.slice(0, 12000)}\n\n…` : text
      } else {
        previewUnavailableReason = `读取预览失败：HTTP ${response.status}`
      }
    } catch (error) {
      previewUnavailableReason = error instanceof Error ? error.message : String(error)
    }
  } else if (kind === 'container') {
    previewUnavailableReason = '容器不提供文本预览，可双击进入继续浏览。'
  } else if (metadata.mimeType?.startsWith('image/')) {
    previewUnavailableReason = '图像资源暂不内联预览，请直接打开原始 URI。'
  } else {
    previewUnavailableReason = '当前文件类型暂不提供内联预览。'
  }

  return {
    id: normalizedUri,
    uri: normalizedUri,
    name: getEntryName(normalizedUri),
    kind,
    parentUri,
    mimeType: metadata.mimeType,
    size: metadata.size,
    modifiedAt: metadata.modifiedAt,
    headers: metadata.headers,
    previewText,
    previewUnavailableReason,
  }
}
