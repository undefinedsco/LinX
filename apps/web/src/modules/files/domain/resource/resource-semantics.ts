import {
  filesAppMetaResourceUri,
  resolveFilesAppMetaOwnerUri,
} from './files-rdf-contract'

export type FilesEntryKind = 'container' | 'resource'
export type FilesEntrySemanticKind =
  | 'container'
  | 'file'
  | 'structured-data'
  | 'source-linked-card'
  | 'vocab-terms'
  | 'vocab-shapes'
  | 'vocab-namespaces'
  | 'meta-sidecar'
  | 'access-policy-sidecar'
export type FilesOpenMode =
  | 'browse-container'
  | 'structured-data-table'
  | 'source-linked-card-preview'
  | 'locked-vocab-table'
  | 'editable-file-sheet'
  | 'readonly-preview'
  | 'sidecar-detail'
export type FilesResourceAction =
  | {
    id: 'download'
    label: string
    href: string
    downloadName: string
  }
  | {
    id: 'system-open'
    label: string
    href: string
  }

export interface FilesSidecarPlacement {
  kind: 'meta' | 'access-policy'
  sidecarUri: string
  ownerUri: string
  provider?: 'acl' | 'acr'
}

export interface FilesResourceSidecars {
  ownerUri: string
  metaUri: string
  accessPolicyUris: {
    acr: string
    acl: string
  }
}

const TEXT_MIME_PREFIXES = ['text/']
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/rdf+xml',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
])

const RDF_MIME_TYPES = new Set([
  'text/turtle',
  'application/ld+json',
  'application/rdf+xml',
  'application/n-triples',
  'application/trig',
])

const RDF_EXTENSIONS = ['.ttl', '.jsonld', '.rdf', '.nt', '.trig'] as const

function isRdfResource(uri: string, mimeType?: string | null): boolean {
  const normalizedMimeType = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (RDF_MIME_TYPES.has(normalizedMimeType)) return true

  const pathname = (() => {
    try {
      return new URL(uri).pathname.toLowerCase()
    } catch {
      return uri.toLowerCase()
    }
  })()

  return RDF_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

export function isTextLikeMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false
  return TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || TEXT_MIME_TYPES.has(mimeType)
}

export function normalizeContainerUri(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`
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

export function getParentContainerUri(uri: string): string | null {
  try {
    const url = new URL(uri)
    const normalizedPath = uri.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
    const segments = normalizedPath.split('/').filter(Boolean)
    if (segments.length === 0) return null
    url.pathname = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}/` : '/'
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return null
  }
}

function getPodRelativePath(uri: string, podRootUri: string): string {
  try {
    const resourceUrl = new URL(uri)
    const rootUrl = new URL(normalizeContainerUri(podRootUri))
    if (resourceUrl.origin !== rootUrl.origin) return resourceUrl.pathname
    const rootPath = rootUrl.pathname.endsWith('/') ? rootUrl.pathname : `${rootUrl.pathname}/`
    return resourceUrl.pathname.startsWith(rootPath)
      ? `/${resourceUrl.pathname.slice(rootPath.length)}`
      : resourceUrl.pathname
  } catch {
    return uri
  }
}

export function classifyFilesEntry(uri: string, isContainer: boolean, podRootUri: string, mimeType?: string | null): FilesEntrySemanticKind {
  const relativePath = getPodRelativePath(uri, podRootUri)
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  const fileName = getEntryName(uri)

  if (
    fileName === '.meta' ||
    normalizedPath.endsWith('.meta') ||
    normalizedPath.includes('/.meta/')
  ) return 'meta-sidecar'
  if (
    fileName === '.acl' ||
    fileName === '.acr' ||
    normalizedPath.endsWith('.acl') ||
    normalizedPath.endsWith('.acr') ||
    normalizedPath.includes('/.acl/') ||
    normalizedPath.includes('/.acr/')
  ) {
    return 'access-policy-sidecar'
  }

  if (isContainer) return 'container'

  if (normalizedPath === '/.vocab/terms.ttl') return 'vocab-terms'
  if (normalizedPath === '/.vocab/shapes.ttl') return 'vocab-shapes'
  if (normalizedPath === '/.vocab/namespaces.ttl') return 'vocab-namespaces'

  if (normalizedPath.endsWith('.card.ttl') && isRdfResource(uri, mimeType)) return 'source-linked-card'
  if (normalizedPath.startsWith('/.data/') && isRdfResource(uri, mimeType)) return 'structured-data'
  if (isRdfResource(uri, mimeType)) return 'structured-data'

  return 'file'
}

export function getFilesEntrySemanticLabel(semanticKind: FilesEntrySemanticKind): string {
  switch (semanticKind) {
    case 'container': return '目录'
    case 'structured-data': return '.data 表'
    case 'source-linked-card': return 'source-linked card'
    case 'vocab-terms': return 'vocab terms'
    case 'vocab-shapes': return 'vocab shapes'
    case 'vocab-namespaces': return 'vocab ns'
    case 'meta-sidecar': return '.meta'
    case 'access-policy-sidecar': return 'ACL/ACR'
    case 'file': return '文件'
  }
}

export function isFilesSidecarSemanticKind(semanticKind: FilesEntrySemanticKind): boolean {
  return semanticKind === 'meta-sidecar' || semanticKind === 'access-policy-sidecar'
}

export function isLockedVocabRegistry(semanticKind: FilesEntrySemanticKind): boolean {
  return semanticKind === 'vocab-terms' || semanticKind === 'vocab-shapes' || semanticKind === 'vocab-namespaces'
}

export function getFilesEntryOpenMode(entry: {
  kind: FilesEntryKind
  semanticKind: FilesEntrySemanticKind
  mimeType?: string | null
}): FilesOpenMode {
  if (entry.kind === 'container') return 'browse-container'
  if (isLockedVocabRegistry(entry.semanticKind)) return 'locked-vocab-table'
  if (entry.semanticKind === 'source-linked-card') return 'source-linked-card-preview'
  if (entry.semanticKind === 'structured-data') return 'structured-data-table'
  if (entry.semanticKind === 'meta-sidecar' || entry.semanticKind === 'access-policy-sidecar') return 'sidecar-detail'
  if (isRdfResource('', entry.mimeType)) return 'structured-data-table'

  if (isTextLikeMimeType(entry.mimeType)) {
    return 'editable-file-sheet'
  }

  return 'readonly-preview'
}

export function shouldRequestEditableSheetForStructuredSubjectTarget(targetUri: string): boolean {
  return !isRdfResource(targetUri)
}

export function getFilesResourceActions(
  entry: { uri: string; name: string; kind: FilesEntryKind },
  capabilities: { systemOpen?: boolean } = {},
): FilesResourceAction[] {
  if (entry.kind !== 'resource') return []
  if (!/^https?:\/\//.test(entry.uri)) return []

  const actions: FilesResourceAction[] = [
    {
      id: 'download',
      label: '下载',
      href: entry.uri,
      downloadName: entry.name || 'resource',
    },
  ]

  if (capabilities.systemOpen) {
    actions.push({
      id: 'system-open',
      label: '系统打开',
      href: entry.uri,
    })
  }

  return actions
}

export function getFilesOpenModeLabel(openMode: FilesOpenMode): string {
  switch (openMode) {
    case 'browse-container': return '浏览容器'
    case 'structured-data-table': return '结构化表格'
    case 'source-linked-card-preview': return 'source-linked card'
    case 'locked-vocab-table': return '只读 vocab 表'
    case 'editable-file-sheet': return '预览 sheet'
    case 'readonly-preview': return '只读预览'
    case 'sidecar-detail': return 'sidecar 详情'
  }
}

export function resolveFilesSidecarPlacement(entry: { uri: string; semanticKind: FilesEntrySemanticKind }): FilesSidecarPlacement | null {
  const isMeta = entry.semanticKind === 'meta-sidecar'
  const isAccess = entry.semanticKind === 'access-policy-sidecar'
  if (!isMeta && !isAccess) return null

  const name = getEntryName(entry.uri)
  const parentUri = getParentContainerUri(entry.uri) ?? entry.uri
  const suffix = isMeta ? '.meta' : name.endsWith('.acr') ? '.acr' : '.acl'
  const provider = isAccess ? (suffix === '.acr' ? 'acr' : 'acl') : undefined
  const appMetaOwnerUri = isMeta ? resolveFilesAppMetaOwnerUri(entry.uri) : null
  const ownerUri = name === suffix
    ? normalizeContainerUri(parentUri)
    : appMetaOwnerUri
      ? appMetaOwnerUri
      : entry.uri.endsWith(suffix)
      ? entry.uri.slice(0, -suffix.length)
      : parentUri

  return {
    kind: isMeta ? 'meta' : 'access-policy',
    sidecarUri: entry.uri,
    ownerUri,
    provider,
  }
}

export function resolveFilesResourceSidecars(
  entry: { uri: string; kind: FilesEntryKind },
  options: { currentPodRootUri?: string | null } = {},
): FilesResourceSidecars {
  const ownerUri = entry.kind === 'container' ? normalizeContainerUri(entry.uri) : entry.uri
  const metaUri = filesAppMetaResourceUri(ownerUri, { currentPodRootUri: options.currentPodRootUri })

  return {
    ownerUri,
    metaUri,
    accessPolicyUris: {
      acr: `${ownerUri}.acr`,
      acl: `${ownerUri}.acl`,
    },
  }
}

export function resolveFilesSidecarOwnerTarget(
  entry: { uri: string; kind: FilesEntryKind; semanticKind: FilesEntrySemanticKind },
): { uri: string; kind: FilesEntryKind } {
  const placement = resolveFilesSidecarPlacement(entry)
  if (!placement) return entry

  return {
    uri: placement.ownerUri,
    kind: placement.ownerUri.endsWith('/') ? 'container' : 'resource',
  }
}
