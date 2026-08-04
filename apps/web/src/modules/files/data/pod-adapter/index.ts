import type { SolidDatabase } from '@undefineds.co/models'
import { getEffectiveAccess, getLinkedResourceUrlAll, responseToResourceInfo, type WithServerResourceInfo } from '@inrupt/solid-client'
import { isLocalWorkspaceUri, parseLocalWorkspaceUri } from '@/lib/data/workspace-uri'
export {
  resolveStructuredSubjectContainingResourceUri,
  resolveStructuredSubjectExternalUri,
  resolveStructuredSubjectResourceUri,
} from '../../domain/resource/structured-subject-uri'
import { summarizeWacAclPolicy } from '../../domain/resource/access-policy-model'
import {
  classifyFilesEntry,
  getEntryName,
  getParentContainerUri,
  isFilesSidecarSemanticKind,
  isTextLikeMimeType,
  normalizeContainerUri,
  resolveFilesResourceSidecars,
} from '../../domain/resource/resource-semantics'
import { filesAppMetaResourceUri } from '../../domain/resource/files-rdf-contract'
import { buildMetaSidecarCopyPatch } from '../../domain/sidecar/meta-sidecar-transfer-model'
import {
  AGENTS_ROOT_NODE_ID,
  ALL_FILES_NODE_ID,
  FilesResourceReadError,
  FilesSaveConflictError,
  POD_ROOT_NODE_ID,
  RECENT_FILES_NODE_ID,
  REPOSITORIES_ROOT_NODE_ID,
  WORKSPACES_ROOT_NODE_ID,
  type FilesAccessBasics,
  type FilesAccessPolicySummary,
  type FilesAccessSourceProbe,
  type FilesBlobResource,
  type FilesDetail,
  type FilesEffectiveAccess,
  type FilesEntry,
  type FilesEntryKind,
  type FilesFolderCreateInput,
  type FilesMetaSidecar,
  type FilesRawTextResource,
  type FilesResourceTransferInput,
  type FilesRootData,
  type FilesTreeNode,
} from '../../domain/resource/resource-model'
import {
  getAuthenticatedFetch,
  getContainerLister,
  getPodRootUri,
} from './pod-runtime'
import {
  createContainerNodeId,
  createLocalWorkspaceNodeId,
  createResourceNodeId,
  createWorkspaceNodeId,
  getContainerLabel,
  getPodRootLabel,
  parseTreeNodeId,
} from '../../domain/resource/tree-model'

export {
  AGENTS_ROOT_NODE_ID,
  ALL_FILES_NODE_ID,
  FilesResourceReadError,
  FilesSaveConflictError,
  createContainerNodeId,
  createLocalWorkspaceNodeId,
  createResourceNodeId,
  createWorkspaceNodeId,
  getContainerLabel,
  getPodRootUri,
  parseTreeNodeId,
  POD_ROOT_NODE_ID,
  RECENT_FILES_NODE_ID,
  REPOSITORIES_ROOT_NODE_ID,
  WORKSPACES_ROOT_NODE_ID,
  summarizeWacAclPolicy,
}
export {
  classifyFilesEntry,
  getEntryName,
  getFilesEntryOpenMode,
  getFilesEntrySemanticLabel,
  getFilesOpenModeLabel,
  getFilesResourceActions,
  getParentContainerUri,
  isFilesSidecarSemanticKind,
  isLockedVocabRegistry,
  isTextLikeMimeType,
  normalizeContainerUri,
  resolveFilesResourceSidecars,
  resolveFilesSidecarOwnerTarget,
  resolveFilesSidecarPlacement,
} from '../../domain/resource/resource-semantics'
export type {
  FilesAccessAudienceKind,
  FilesAccessBasics,
  FilesAccessPolicyGrant,
  FilesAccessPolicySummary,
  FilesAccessSourceProbe,
  FilesAccessSourceProbeState,
  FilesBlobResource,
  FilesDetail,
  FilesEntry,
  FilesEntryKind,
  FilesEntrySemanticKind,
  FilesFolderCreateInput,
  FilesMetaSidecar,
  FilesOpenMode,
  FilesRawTextResource,
  FilesResourceAction,
  FilesResourceReadErrorKind,
  FilesResourceSidecars,
  FilesResourceTransferInput,
  FilesRootData,
  FilesSidecarPlacement,
  FilesStructuredViewMetadataSidecar,
  FilesTreeNode,
  FilesTreeNodeType,
} from '../../domain/resource/resource-model'

const FILE_PREVIEW_ERROR_MESSAGE = '预览加载失败。请检查网络后重试，或直接打开文件。'
const ALL_BROWSABLE_MAX_DEPTH = 4
const ALL_BROWSABLE_MAX_ENTRIES = 200

interface ReadFilesMetaSidecarOptions {
  discoverLinked?: boolean
}

interface ResourceMetadata {
  headers: Record<string, string>
  mimeType: string | null
  size: number | null
  modifiedAt: string | null
  bodyText?: string
}

const MIME_BY_EXTENSION: Record<string, string> = {
  css: 'text/css',
  csv: 'text/csv',
  html: 'text/html',
  js: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mjs: 'application/javascript',
  rdf: 'application/rdf+xml',
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

function guessMimeType(uri: string, isContainer: boolean): string | null {
  if (isContainer) return 'inode/container'
  const extension = uri.split('.').pop()?.toLowerCase()
  if (!extension) return null
  return MIME_BY_EXTENSION[extension] ?? null
}

export async function probeFilesAccessSource(db: SolidDatabase, uri: string): Promise<FilesAccessSourceProbe> {
  const authFetch = getAuthenticatedFetch(db)

  try {
    const response = await authFetch(uri, { method: 'HEAD' })
    if (response.ok) {
      return { uri, state: 'exists', status: response.status }
    }
    if (response.status === 404 || response.status === 410) {
      return { uri, state: 'missing', status: response.status }
    }
    if (response.status === 401 || response.status === 403) {
      return { uri, state: 'inaccessible', status: response.status }
    }
    return { uri, state: 'unknown', status: response.status }
  } catch {
    return { uri, state: 'unknown' }
  }
}

export async function readFilesMetaSidecar(
  db: SolidDatabase,
  entry: Pick<FilesEntry, 'uri' | 'kind'>,
  options: ReadFilesMetaSidecarOptions = {},
): Promise<FilesMetaSidecar> {
  const authFetch = getAuthenticatedFetch(db)
  const sidecars = resolveFilesResourceSidecars(entry, { currentPodRootUri: getPodRootUri(db) })
  const pathSidecar = await readMetaSidecarUri(authFetch, sidecars.ownerUri, sidecars.metaUri)

  if (pathSidecar.state !== 'missing') return pathSidecar
  if (options.discoverLinked === false) return pathSidecar

  const linkedMetaUri = await discoverLinkedMetaSidecarUri(authFetch, sidecars.ownerUri)
  if (!linkedMetaUri || linkedMetaUri === sidecars.metaUri) return pathSidecar
  return readMetaSidecarUri(authFetch, sidecars.ownerUri, linkedMetaUri)
}

async function readMetaSidecarUri(
  authFetch: typeof fetch,
  ownerUri: string,
  metaUri: string,
): Promise<FilesMetaSidecar> {
  try {
    const response = await authFetch(metaUri, {
      method: 'GET',
      headers: {
        Accept: 'text/turtle, text/plain;q=0.9, application/ld+json;q=0.8, application/json;q=0.7, */*;q=0.1',
      },
    })
    if (response.ok) {
      const headers = Object.fromEntries(response.headers.entries())
      const content = await response.text()
      return {
        ownerUri,
        metaUri,
        state: 'exists',
        status: response.status,
        content,
        mimeType: getMimeTypeFromHeaders(headers, guessMimeType(metaUri, false)),
        etag: headers.etag ?? null,
        size: content.length,
      }
    }
    if (response.status === 404 || response.status === 410) {
      return {
        ownerUri,
        metaUri,
        state: 'missing',
        status: response.status,
        content: null,
        mimeType: null,
        etag: null,
        size: null,
      }
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ownerUri,
        metaUri,
        state: 'inaccessible',
        status: response.status,
        content: null,
        mimeType: null,
        etag: null,
        size: null,
      }
    }
    return {
      ownerUri,
      metaUri,
      state: 'unknown',
      status: response.status,
      content: null,
      mimeType: null,
      etag: null,
      size: null,
    }
  } catch {
    return {
      ownerUri,
      metaUri,
      state: 'unknown',
      content: null,
      mimeType: null,
      etag: null,
      size: null,
    }
  }
}

async function discoverLinkedMetaSidecarUri(authFetch: typeof fetch, ownerUri: string): Promise<string | null> {
  let response: Response | null = null
  try {
    response = await authFetch(ownerUri, { method: 'HEAD' })
    if (response.status === 405) {
      response = await authFetch(ownerUri, { method: 'GET' })
      try {
        await response.body?.cancel?.()
      } catch {
        // ignore
      }
    }
  } catch {
    return null
  }

  if (!response.ok) return null
  const linksByRel = parseLinkHeader(response.headers.get('Link'), ownerUri)
  for (const [rel, uris] of Object.entries(linksByRel)) {
    const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.some((token) => token === 'describedby' || token === 'metadata')) continue
    const linkedMetaUri = uris.find((uri) => uri !== ownerUri && isSameOriginUri(uri, ownerUri))
    if (linkedMetaUri) return linkedMetaUri
  }
  return null
}

function isSameOriginUri(candidateUri: string, ownerUri: string): boolean {
  try {
    return new URL(candidateUri).origin === new URL(ownerUri).origin
  } catch {
    return false
  }
}


function parseLinkHeader(linkHeader: string | null, baseUri: string): Record<string, string[]> {
  if (!linkHeader) return {}

  return linkHeader.split(',').reduce<Record<string, string[]>>((linksByRel, part) => {
    const uriMatch = part.match(/<([^>]+)>/)
    const relMatch = part.match(/rel="?([^";,]+)"?/)
    if (!uriMatch || !relMatch) return linksByRel

    try {
      const linkedUri = new URL(uriMatch[1], baseUri).toString()
      linksByRel[relMatch[1]] ??= []
      linksByRel[relMatch[1]].push(linkedUri)
    } catch {
      // Ignore malformed link header entries.
    }
    return linksByRel
  }, {})
}

function parseWacAllowModes(wacAllowHeader: string | null): {
  user: { read: boolean; append: boolean; write: boolean; control: boolean }
  public: { read: boolean; append: boolean; write: boolean; control: boolean }
} | undefined {
  if (!wacAllowHeader) return undefined
  const parseModes = (scope: 'user' | 'public') => {
    const match = wacAllowHeader.match(new RegExp(`${scope}="([^"]*)"`))
    const modes = new Set((match?.[1] ?? '').split(/\s+/).filter(Boolean))
    return {
      read: modes.has('read'),
      append: modes.has('append'),
      write: modes.has('write'),
      control: modes.has('control'),
    }
  }

  return {
    user: parseModes('user'),
    public: parseModes('public'),
  }
}

function mergeControlAccess(
  effectiveAccess: FilesAccessBasics['effectiveAccess'],
  wacAllowHeader: string | null,
): FilesAccessBasics['effectiveAccess'] {
  const parsedModes = parseWacAllowModes(wacAllowHeader)
  if (!parsedModes) return effectiveAccess

  const base: FilesEffectiveAccess = effectiveAccess ?? {
    user: { read: false, append: false, write: false },
    public: { read: false, append: false, write: false },
  }

  return {
    user: {
      ...base.user,
      control: parsedModes.user.control,
    },
    public: base.public
      ? {
          ...base.public,
          control: parsedModes.public.control,
        }
      : {
          read: parsedModes.public.read,
          append: parsedModes.public.append,
          write: parsedModes.public.write,
          control: parsedModes.public.control,
        },
  }
}

function responseToFilesResourceInfo(response: Response, ownerUri: string): WithServerResourceInfo {
  try {
    return responseToResourceInfo(response, { ignoreAuthenticationErrors: true })
  } catch {
    const linkHeader = response.headers.get('Link')
    const wacAllowHeader = response.headers.get('WAC-Allow')
    return {
      internal_resourceInfo: {
        sourceIri: ownerUri,
        isRawData: true,
        contentType: response.headers.get('Content-Type') ?? undefined,
        linkedResources: parseLinkHeader(linkHeader, ownerUri),
        permissions: parseWacAllowModes(wacAllowHeader),
      },
    }
  }
}

function getAccessProviderFromUri(uri: string): 'acl' | 'acr' | 'unknown' {
  const pathname = (() => {
    try {
      return new URL(uri).pathname
    } catch {
      return uri
    }
  })()

  if (pathname.endsWith('.acl')) return 'acl'
  if (pathname.endsWith('.acr')) return 'acr'
  return 'unknown'
}

async function readWacAclPolicySummary(db: SolidDatabase, uri: string | null): Promise<FilesAccessPolicySummary | null> {
  if (!uri || getAccessProviderFromUri(uri) !== 'acl') return null
  const authFetch = getAuthenticatedFetch(db)
  try {
    const response = await authFetch(uri, {
      method: 'GET',
      headers: {
        Accept: 'text/turtle, text/plain;q=0.9, */*;q=0.1',
      },
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return { uri, provider: 'acl', state: 'inaccessible', grants: [] }
      if (response.status === 404 || response.status === 410) return { uri, provider: 'acl', state: 'missing', grants: [] }
      return { uri, provider: 'acl', state: 'unknown', status: response.status, grants: [] }
    }
    return summarizeWacAclPolicy(uri, await response.text())
  } catch {
    return { uri, provider: 'acl', state: 'unknown', grants: [] }
  }
}

type OwnerAccessMetadata = {
  linkedAccessUri: string | null
  effectiveAccess: FilesAccessBasics['effectiveAccess']
}

function emptyOwnerAccessMetadata(): OwnerAccessMetadata {
  return {
    linkedAccessUri: null,
    effectiveAccess: null,
  }
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel?.()
  } catch {
    // ignore
  }
}

function readOwnerAccessMetadataFromResponse(ownerResponse: Response, ownerUri: string): OwnerAccessMetadata {
  const resourceInfo = responseToFilesResourceInfo(ownerResponse, ownerUri)
  const linkedResources = getLinkedResourceUrlAll(resourceInfo)
  const effectiveAccess = getEffectiveAccess(resourceInfo)
  return {
    linkedAccessUri: linkedResources.acl?.[0] ?? linkedResources['http://www.w3.org/ns/auth/acl#accessControl']?.[0] ?? null,
    effectiveAccess: mergeControlAccess(effectiveAccess, ownerResponse.headers.get('WAC-Allow')),
  }
}

async function readOwnerAccessMetadata(authFetch: typeof fetch, ownerUri: string): Promise<OwnerAccessMetadata> {
  let ownerResponse: Response
  try {
    ownerResponse = await authFetch(ownerUri, { method: 'HEAD' })
  } catch {
    try {
      ownerResponse = await authFetch(ownerUri, { method: 'GET' })
      await discardResponseBody(ownerResponse)
    } catch {
      return emptyOwnerAccessMetadata()
    }
    return readOwnerAccessMetadataFromResponse(ownerResponse, ownerUri)
  }

  if (ownerResponse.status === 405) {
    try {
      ownerResponse = await authFetch(ownerUri, { method: 'GET' })
      await discardResponseBody(ownerResponse)
    } catch {
      return emptyOwnerAccessMetadata()
    }
  }

  return readOwnerAccessMetadataFromResponse(ownerResponse, ownerUri)
}

export async function readFilesAccessBasics(
  db: SolidDatabase,
  entry: Pick<FilesEntry, 'uri' | 'kind'>,
): Promise<FilesAccessBasics> {
  const authFetch = getAuthenticatedFetch(db)
  const sidecars = resolveFilesResourceSidecars(entry, { currentPodRootUri: getPodRootUri(db) })
  const ownerMetadata = await readOwnerAccessMetadata(authFetch, sidecars.ownerUri)
  const candidates = await Promise.all([
    probeFilesAccessSource(db, sidecars.accessPolicyUris.acr).then((existence) => ({
      provider: 'acr' as const,
      uri: sidecars.accessPolicyUris.acr,
      existence,
    })),
    probeFilesAccessSource(db, sidecars.accessPolicyUris.acl).then((existence) => ({
      provider: 'acl' as const,
      uri: sidecars.accessPolicyUris.acl,
      existence,
    })),
  ])
  const policySummary = await readWacAclPolicySummary(db, ownerMetadata.linkedAccessUri)

  return {
    ownerUri: sidecars.ownerUri,
    activeSource: ownerMetadata.linkedAccessUri
      ? {
          provider: getAccessProviderFromUri(ownerMetadata.linkedAccessUri),
          uri: ownerMetadata.linkedAccessUri,
          confidence: 'linked',
          inheritance: ownerMetadata.linkedAccessUri === sidecars.accessPolicyUris.acl || ownerMetadata.linkedAccessUri === sidecars.accessPolicyUris.acr
            ? 'direct'
            : 'inherited-or-candidate',
        }
      : null,
    effectiveAccess: ownerMetadata.effectiveAccess,
    policySummary,
    candidates,
  }
}

function getMimeTypeFromHeaders(headers: Record<string, string>, fallback?: string | null): string | null {
  const headerMimeType = headers['content-type']?.split(';')[0]?.trim()
  if (!headerMimeType || headerMimeType === 'application/octet-stream') return fallback ?? headerMimeType ?? null
  return headerMimeType
}

function assertRawTextIsSaveable(mimeType: string, content: string): void {
  if (mimeType === 'application/json' || mimeType === 'application/ld+json') {
    try {
      JSON.parse(content)
    } catch (error) {
      throw new Error(`JSON 校验失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function toIsoString(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

async function readMetadata(
  db: SolidDatabase,
  uri: string,
  options: { includeBody?: boolean } = {},
): Promise<ResourceMetadata> {
  const authFetch = getAuthenticatedFetch(db)
  let response: Response | null = null
  let bodyText: string | undefined

  try {
    response = await authFetch(uri, options.includeBody ? {
      method: 'GET',
      headers: {
        Accept: `${guessMimeType(uri, false) ?? 'text/plain'}, text/plain;q=0.9, */*;q=0.1`,
      },
    } : { method: 'HEAD' })
    if (options.includeBody && response.ok) {
      try {
        bodyText = await response.text()
      } catch {
        // Keep metadata usable when the body stream cannot be read.
      }
    } else if (response.status === 405 || response.status >= 500) {
      response = await authFetch(uri, { method: 'GET' })
      if (response.ok) {
        try {
          bodyText = await response.text()
        } catch {
          // Keep metadata usable when the fallback body stream cannot be read.
        }
      }
    }
  } catch (error) {
    throw new FilesResourceReadError(uri, { cause: error })
  }

  if (!response.ok) {
    throw new FilesResourceReadError(uri, { status: response.status })
  }

  const isContainer = uri.endsWith('/')
  const headers = Object.fromEntries(response.headers.entries())
  const mimeType = isContainer ? 'inode/container' : getMimeTypeFromHeaders(headers, guessMimeType(uri, false))
  const sizeHeader = headers['content-length']
  const parsedSize = sizeHeader ? Number.parseInt(sizeHeader, 10) : Number.NaN

  return {
    headers,
    mimeType,
    size: Number.isFinite(parsedSize) ? parsedSize : null,
    modifiedAt: toIsoString(headers['last-modified'] ?? null),
    bodyText,
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

const inFlightContainerListings = new WeakMap<object, Map<string, Promise<string[]>>>()

function listContainerResourceUris(db: SolidDatabase, containerUri: string): Promise<string[]> {
  const dbKey = db as object
  const normalizedContainerUri = normalizeContainerUri(containerUri)
  let listingsByUri = inFlightContainerListings.get(dbKey)
  if (!listingsByUri) {
    listingsByUri = new Map()
    inFlightContainerListings.set(dbKey, listingsByUri)
  }

  const existing = listingsByUri.get(normalizedContainerUri)
  if (existing) return existing

  const request = getContainerLister(db)(normalizedContainerUri)
  listingsByUri.set(normalizedContainerUri, request)
  const release = () => {
    if (listingsByUri?.get(normalizedContainerUri) === request) {
      listingsByUri.delete(normalizedContainerUri)
    }
  }
  void request.then(release, release)
  return request
}

async function listContainerEntryStubs(
  db: SolidDatabase,
  containerUri: string,
  sourceLabel?: string,
): Promise<FilesEntry[]> {
  const normalizedContainerUri = normalizeContainerUri(containerUri)
  const podRootUri = getPodRootUri(db)
  const resourceUris = await listContainerResourceUris(db, normalizedContainerUri)
  const entries = resourceUris.flatMap((uri): FilesEntry[] => {
    const normalizedUri = uri.endsWith('/') ? normalizeContainerUri(uri) : uri
    const kind: FilesEntryKind = normalizedUri.endsWith('/') ? 'container' : 'resource'
    const semanticKind = classifyFilesEntry(normalizedUri, kind === 'container', podRootUri)
    if (isFilesSidecarSemanticKind(semanticKind)) return []
    return [{
      id: normalizedUri,
      uri: normalizedUri,
      name: getEntryName(normalizedUri),
      kind,
      semanticKind,
      parentUri: normalizedContainerUri,
      mimeType: guessMimeType(normalizedUri, kind === 'container'),
      size: null,
      modifiedAt: null,
      sourceLabel,
    }]
  })
  return sortEntries(entries)
}

const CONTAINER_METADATA_ENRICH_MAX_ENTRIES = 100

async function enrichEntryWithMetadata(db: SolidDatabase, entry: FilesEntry): Promise<FilesEntry> {
  try {
    const metadata = await readMetadata(db, entry.uri)
    return {
      ...entry,
      mimeType: entry.kind === 'container' ? entry.mimeType : (metadata.mimeType ?? entry.mimeType),
      size: entry.kind === 'container' ? null : metadata.size,
      modifiedAt: metadata.modifiedAt,
      metadataState: 'available',
    }
  } catch {
    return { ...entry, metadataState: 'unavailable' }
  }
}

export async function listContainerEntries(
  db: SolidDatabase,
  containerUri: string,
  sourceLabel?: string,
  options: { enrichMetadata?: boolean } = {},
): Promise<FilesEntry[]> {
  const entries = await listContainerEntryStubs(db, containerUri, sourceLabel)
  if (!options.enrichMetadata) return entries
  if (entries.length === 0 || entries.length > CONTAINER_METADATA_ENRICH_MAX_ENTRIES) return entries
  return Promise.all(entries.map((entry) => enrichEntryWithMetadata(db, entry)))
}

export async function listAllBrowsableEntries(
  db: SolidDatabase,
  workspaceUri?: string | null,
  options: { recursive?: boolean } = {},
): Promise<FilesEntry[]> {
  const podRootUri = getPodRootUri(db)
  const sources: Array<{ uri: string; label: string }> = []

  if (workspaceUri && !isLocalWorkspaceUri(workspaceUri)) {
    sources.push({ uri: normalizeContainerUri(workspaceUri), label: '当前话题' })
  }
  sources.push({ uri: podRootUri, label: getPodRootLabel(podRootUri) })

  const entriesByUri = new Map<string, FilesEntry>()

  if (options.recursive) {
    await collectBrowsableEntries(db, sources, entriesByUri)
    return sortEntries(Array.from(entriesByUri.values()))
  }

  const listings = await Promise.all(
    sources.map((source) => listContainerEntries(db, source.uri, source.label)),
  )
  for (const entries of listings) {
    for (const entry of entries) {
      if (!entriesByUri.has(entry.uri)) {
        entriesByUri.set(entry.uri, entry)
      }
    }
  }

  return sortEntries(Array.from(entriesByUri.values()))
}

const ALL_BROWSABLE_LISTING_CONCURRENCY = 4

type BrowsableListingSource = { uri: string; label: string; depth: number }

async function collectBrowsableEntries(
  db: SolidDatabase,
  sources: Array<{ uri: string; label: string }>,
  entriesByUri: Map<string, FilesEntry>,
): Promise<void> {
  const visitedContainers = new Set<string>()
  const queue: BrowsableListingSource[] = sources.map((source) => ({ ...source, depth: 0 }))

  const worker = async (): Promise<void> => {
    for (;;) {
      if (entriesByUri.size >= ALL_BROWSABLE_MAX_ENTRIES) return
      const source = queue.shift()
      if (!source) return

      const containerUri = normalizeContainerUri(source.uri)
      if (visitedContainers.has(containerUri)) continue
      if (source.depth > ALL_BROWSABLE_MAX_DEPTH) continue
      visitedContainers.add(containerUri)

      let entries: FilesEntry[]
      try {
        entries = await listContainerEntries(db, containerUri, source.label, { enrichMetadata: false })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (!entriesByUri.has(entry.uri)) {
          entriesByUri.set(entry.uri, entry)
        }
        if (entry.kind === 'container' && source.depth < ALL_BROWSABLE_MAX_DEPTH) {
          queue.push({ uri: entry.uri, label: source.label, depth: source.depth + 1 })
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: ALL_BROWSABLE_LISTING_CONCURRENCY }, () => worker()),
  )
}

export async function buildRootNodes(
  db: SolidDatabase,
  workspaceUri?: string | null,
): Promise<FilesRootData> {
  const podRootUri = getPodRootUri(db)
  const podRootEntriesPromise = listContainerEntryStubs(db, podRootUri, getPodRootLabel(podRootUri))

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
      workspaceEntries = await listContainerEntryStubs(db, workspaceUri, '当前话题')
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

  const podRootEntries = await podRootEntriesPromise
  const allEntries = workspaceNode?.type === 'workspace'
    ? Array.from(new Map([
      ...podRootEntries.map((entry) => [entry.uri, entry] as const),
      ...workspaceEntries.map((entry) => [entry.uri, entry] as const),
    ]).values())
    : podRootEntries
  const allCount = allEntries.length

  const nodes: FilesTreeNode[] = [
    {
      id: ALL_FILES_NODE_ID,
      label: '全部可浏览资源',
      type: 'all',
      count: allCount,
    },
    {
      id: RECENT_FILES_NODE_ID,
      label: '最近文件',
      type: 'recent',
    },
  ]

  if (workspaceNode) {
    nodes.push(workspaceNode)
  }

  nodes.push({
    id: POD_ROOT_NODE_ID,
    label: getPodRootLabel(podRootUri),
    type: 'container',
    uri: podRootUri,
    count: podRootEntries.length,
  })

  return { nodes, podRootUri, entries: sortEntries(allEntries) }
}

export function projectContainerEntriesToTreeNodes(
  entries: FilesEntry[],
  parentId: string,
  podRootUri?: string | null,
): FilesTreeNode[] {
  return entries
    .filter((entry) => !isFilesSidecarSemanticKind(entry.semanticKind))
    .map((entry) => ({
      id: entry.kind === 'container' ? createContainerNodeId(entry.uri) : createResourceNodeId(entry.uri),
      label: entry.kind === 'container' ? getContainerLabel(entry.uri, podRootUri) : getEntryName(entry.uri),
      type: entry.kind === 'container' ? 'container' as const : 'resource' as const,
      uri: entry.uri,
      parentId,
    }))
}

export async function listContainerChildNodes(
  db: SolidDatabase,
  containerUri: string,
  parentId: string,
  podRootUri?: string | null,
): Promise<FilesTreeNode[]> {
  const entries = await listContainerEntries(db, containerUri)
  return projectContainerEntriesToTreeNodes(entries, parentId, podRootUri)
}

export async function readFileDetail(
  db: SolidDatabase,
  resourceUri: string,
  options: { includeContainerEntries?: boolean } = {},
): Promise<FilesDetail> {
  const normalizedUri = resourceUri.endsWith('/') ? normalizeContainerUri(resourceUri) : resourceUri
  const kind: FilesEntryKind = normalizedUri.endsWith('/') ? 'container' : 'resource'
  const podRootUri = getPodRootUri(db)
  const inferredMimeType = guessMimeType(normalizedUri, kind === 'container')
  const metadata = await readMetadata(db, normalizedUri, {
    includeBody: kind === 'resource' && isTextLikeMimeType(inferredMimeType),
  })
  const semanticKind = classifyFilesEntry(normalizedUri, kind === 'container', podRootUri, metadata.mimeType)
  const parentUri = getParentContainerUri(normalizedUri) ?? podRootUri

  let previewText: string | null = null
  let childEntries: FilesEntry[] | undefined
  let previewUnavailableReason: string | undefined

  if (kind === 'resource' && isTextLikeMimeType(metadata.mimeType)) {
    if (metadata.bodyText !== undefined) {
      previewText = metadata.bodyText.length > 12000 ? `${metadata.bodyText.slice(0, 12000)}\n\n…` : metadata.bodyText
    } else {
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
          previewUnavailableReason = FILE_PREVIEW_ERROR_MESSAGE
        }
      } catch (error) {
        console.warn('[Files] Preview load failed:', error)
        previewUnavailableReason = FILE_PREVIEW_ERROR_MESSAGE
      }
    }
  } else if (kind === 'container') {
    if (options.includeContainerEntries ?? true) {
      childEntries = await listContainerEntries(db, normalizedUri)
    }
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
    semanticKind,
    parentUri,
    mimeType: metadata.mimeType,
    size: metadata.size,
    modifiedAt: metadata.modifiedAt,
    headers: metadata.headers,
    previewText,
    childEntries,
    previewUnavailableReason,
  }
}

export async function readRawTextResource(db: SolidDatabase, resourceUri: string): Promise<FilesRawTextResource> {
  const normalizedUri = resourceUri.endsWith('/') ? normalizeContainerUri(resourceUri) : resourceUri
  const response = await getAuthenticatedFetch(db)(normalizedUri, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'text/*, application/json;q=0.9, application/ld+json;q=0.9, application/xml;q=0.8, */*;q=0.1',
    },
  })

  if (!response.ok) {
    throw new Error(`读取完整文件失败: HTTP ${response.status}`)
  }

  const headers = Object.fromEntries(response.headers.entries())
  const mimeType = getMimeTypeFromHeaders(headers, guessMimeType(normalizedUri, false))
  if (!mimeType || !isTextLikeMimeType(mimeType)) {
    throw new Error('当前文件类型不支持原始内容保存。')
  }

  const etag = headers.etag ?? null
  return {
    uri: normalizedUri,
    content: await response.text(),
    mimeType,
    etag,
    headers,
  }
}

export async function readBlobResource(db: SolidDatabase, resourceUri: string): Promise<FilesBlobResource> {
  const normalizedUri = resourceUri.endsWith('/') ? normalizeContainerUri(resourceUri) : resourceUri
  const response = await getAuthenticatedFetch(db)(normalizedUri, {
    method: 'GET',
    headers: {
      Accept: 'image/*, application/pdf, audio/*, video/*, application/octet-stream;q=0.8, */*;q=0.1',
    },
  })

  if (!response.ok) {
    throw new Error(`读取二进制预览失败: HTTP ${response.status}`)
  }

  const headers = Object.fromEntries(response.headers.entries())
  const mimeType = getMimeTypeFromHeaders(headers, guessMimeType(normalizedUri, false)) ?? 'application/octet-stream'

  return {
    uri: normalizedUri,
    blob: await response.blob(),
    mimeType,
    headers,
  }
}

export async function saveRawTextResource(
  db: SolidDatabase,
  resource: Pick<FilesRawTextResource, 'uri' | 'mimeType' | 'etag'>,
  content: string,
): Promise<FilesRawTextResource> {
  assertRawTextIsSaveable(resource.mimeType, content)
  if (!resource.etag) {
    throw new Error('当前资源缺少 ETag，不能安全保存。')
  }

  const response = await getAuthenticatedFetch(db)(resource.uri, {
    method: 'PUT',
    headers: {
      'Content-Type': resource.mimeType,
      'If-Match': resource.etag,
    },
    body: content,
  })

  if (response.status === 412) {
    throw new FilesSaveConflictError(resource.uri)
  }

  if (!response.ok) {
    throw new Error(`保存文件失败: HTTP ${response.status}`)
  }

  return readRawTextResource(db, resource.uri)
}

export async function createRawTextResource(
  db: SolidDatabase,
  resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>,
  content: string,
): Promise<FilesRawTextResource> {
  assertRawTextIsSaveable(resource.mimeType, content)

  const response = await getAuthenticatedFetch(db)(resource.uri, {
    method: 'PUT',
    headers: {
      'Content-Type': resource.mimeType,
      'If-None-Match': '*',
    },
    body: content,
  })

  if (response.status === 412) {
    throw new FilesSaveConflictError(resource.uri, { reason: 'exists' })
  }

  if (!response.ok) {
    throw new Error(`创建文件失败: HTTP ${response.status}`)
  }

  try {
    return await readRawTextResource(db, resource.uri)
  } catch (error) {
    console.warn('[files] 创建成功但回读失败，使用 PUT 响应兜底', resource.uri, error)
    return {
      uri: resource.uri,
      mimeType: resource.mimeType,
      content,
      etag: response.headers.get('etag'),
      headers: {},
    }
  }
}

export async function createBlobResource(
  db: SolidDatabase,
  resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>,
  content: Blob,
): Promise<FilesDetail> {
  const response = await getAuthenticatedFetch(db)(resource.uri, {
    method: 'PUT',
    headers: {
      'Content-Type': resource.mimeType,
      'If-None-Match': '*',
    },
    body: content,
  })

  if (response.status === 412) {
    throw new FilesSaveConflictError(resource.uri)
  }

  if (!response.ok) {
    throw new Error(`创建文件失败: HTTP ${response.status}`)
  }

  return readFileDetail(db, resource.uri)
}

function assertSingleChildFolderName(name: string) {
  if (!name) {
    throw new Error('文件夹名称不能为空。')
  }
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error('文件夹名称不能包含路径。')
  }

  try {
    const decodedName = decodeURIComponent(name)
    if (
      decodedName === '.'
      || decodedName === '..'
      || decodedName.includes('/')
      || decodedName.includes('\\')
    ) {
      throw new Error('文件夹名称不能包含路径。')
    }
  } catch (error) {
    if (error instanceof URIError) {
      throw new Error('文件夹名称不能包含无效转义。')
    }
    throw error
  }
}

function normalizeFileResourceDestination(destinationUri: string) {
  try {
    return new URL(destinationUri).href
  } catch {
    return destinationUri
  }
}

function isUnsupportedTransferResponse(response: Response) {
  return response.status === 405 || response.status === 501
}

function sidecarMetaUriForResource(db: SolidDatabase, resourceUri: string) {
  return filesAppMetaResourceUri(resourceUri, { currentPodRootUri: getPodRootUri(db) })
}

function deleteSucceededOrResourceMissing(response: Response) {
  return response.ok || response.status === 404 || response.status === 410
}

async function rollbackFallbackMoveDestination(
  authFetch: typeof fetch,
  destinationUri: string,
  destinationMetaUri: string,
  copiedMetaSidecar: boolean,
) {
  const cleanupUris = copiedMetaSidecar
    ? [destinationMetaUri, destinationUri]
    : [destinationUri]

  for (const cleanupUri of cleanupUris) {
    try {
      await authFetch(cleanupUri, { method: 'DELETE' })
    } catch {
      // Keep the original move failure as the surfaced error.
    }
  }
}

async function copyMetaSidecarViaPatchFallback(
  db: SolidDatabase,
  sourceUri: string,
  destinationUri: string,
) {
  const authFetch = getAuthenticatedFetch(db)
  const sourceMetaUri = sidecarMetaUriForResource(db, sourceUri)
  const destinationMetaUri = sidecarMetaUriForResource(db, destinationUri)
  const sourceResponse = await authFetch(sourceMetaUri, {
    method: 'GET',
    headers: {
      Accept: 'text/turtle, text/plain;q=0.9, application/ld+json;q=0.8, application/json;q=0.7, */*;q=0.1',
    },
  })

  if (sourceResponse.status === 404 || sourceResponse.status === 410) return false
  if (!sourceResponse.ok) {
    throw new Error(`复制元数据失败: HTTP ${sourceResponse.status}`)
  }

  const patch = buildMetaSidecarCopyPatch(
    sourceMetaUri,
    sourceUri,
    destinationMetaUri,
    destinationUri,
    await sourceResponse.text(),
  )
  if (!patch) return false

  const writeResponse = await authFetch(destinationMetaUri, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/sparql-update',
    },
    body: patch,
  })

  if (writeResponse.status === 409 || writeResponse.status === 412) {
    throw new FilesSaveConflictError(destinationMetaUri)
  }
  if (!writeResponse.ok) {
    throw new Error(`复制元数据失败: HTTP ${writeResponse.status}`)
  }

  return true
}

async function transferFileResource(
  db: SolidDatabase,
  method: 'COPY' | 'MOVE',
  input: FilesResourceTransferInput,
): Promise<FilesDetail> {
  const destinationUri = normalizeFileResourceDestination(input.destinationUri)
  const authFetch = getAuthenticatedFetch(db)
  let response: Response
  try {
    response = await authFetch(input.sourceUri, {
      method,
      headers: {
        Destination: destinationUri,
        Overwrite: 'F',
      },
    })
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return transferFileResourceViaReadWriteFallback(db, method, input.sourceUri, destinationUri)
  }

  if (response.status === 409 || response.status === 412) {
    throw new FilesSaveConflictError(destinationUri)
  }

  if (isUnsupportedTransferResponse(response)) {
    return transferFileResourceViaReadWriteFallback(db, method, input.sourceUri, destinationUri)
  }

  if (!response.ok) {
    throw new Error(`${method === 'COPY' ? '复制' : '移动'}文件失败: HTTP ${response.status}`)
  }

  return readFileDetail(db, destinationUri)
}

async function transferFileResourceViaReadWriteFallback(
  db: SolidDatabase,
  method: 'COPY' | 'MOVE',
  sourceUri: string,
  destinationUri: string,
): Promise<FilesDetail> {
  const authFetch = getAuthenticatedFetch(db)
  const sourceResponse = await authFetch(sourceUri)
  if (!sourceResponse.ok) {
    throw new Error(`${method === 'COPY' ? '复制' : '移动'}文件失败: HTTP ${sourceResponse.status}`)
  }

  const sourceBlob = await sourceResponse.blob()
  const contentType = sourceResponse.headers.get('content-type') ?? sourceBlob.type
  const writeResponse = await authFetch(destinationUri, {
    method: 'PUT',
    headers: {
      ...(contentType ? { 'Content-Type': contentType } : {}),
      'If-None-Match': '*',
    },
    body: sourceBlob,
  })

  if (writeResponse.status === 409 || writeResponse.status === 412) {
    throw new FilesSaveConflictError(destinationUri)
  }

  if (!writeResponse.ok) {
    throw new Error(`${method === 'COPY' ? '复制' : '移动'}文件失败: HTTP ${writeResponse.status}`)
  }

  const copiedMetaSidecar = await copyMetaSidecarViaPatchFallback(db, sourceUri, destinationUri)
  const destinationMetaUri = sidecarMetaUriForResource(db, destinationUri)

  if (method === 'MOVE') {
    const deleteResponse = await authFetch(sourceUri, { method: 'DELETE' })
    if (!deleteSucceededOrResourceMissing(deleteResponse)) {
      await rollbackFallbackMoveDestination(authFetch, destinationUri, destinationMetaUri, copiedMetaSidecar)
      throw new Error(`移动文件失败: HTTP ${deleteResponse.status}`)
    }
    if (copiedMetaSidecar) {
      const deleteMetaResponse = await authFetch(sidecarMetaUriForResource(db, sourceUri), { method: 'DELETE' })
      if (!deleteSucceededOrResourceMissing(deleteMetaResponse)) {
        throw new Error(`移动元数据失败: HTTP ${deleteMetaResponse.status}`)
      }
    }
  }

  return readFileDetail(db, destinationUri)
}

export function copyFileResource(db: SolidDatabase, input: FilesResourceTransferInput): Promise<FilesDetail> {
  return transferFileResource(db, 'COPY', input)
}

export function moveFileResource(db: SolidDatabase, input: FilesResourceTransferInput): Promise<FilesDetail> {
  return transferFileResource(db, 'MOVE', input)
}

export async function deleteFileResource(db: SolidDatabase, resourceUri: string): Promise<void> {
  const authFetch = getAuthenticatedFetch(db)
  const response = await authFetch(resourceUri, {
    method: 'DELETE',
  })

  if (response.status === 404) {
    throw new Error(`删除文件失败: HTTP ${response.status}`)
  }

  if (!response.ok) {
    throw new Error(`删除文件失败: HTTP ${response.status}`)
  }

  const metaResponse = await authFetch(sidecarMetaUriForResource(db, resourceUri), {
    method: 'DELETE',
  })
  if (!deleteSucceededOrResourceMissing(metaResponse)) {
    throw new Error(`删除元数据失败: HTTP ${metaResponse.status}`)
  }
}

export async function createFolderResource(db: SolidDatabase, input: FilesFolderCreateInput): Promise<FilesDetail> {
  const folderName = input.name.trim()
  assertSingleChildFolderName(folderName)
  const containerUri = normalizeContainerUri(input.containerUri)
  const destination = new URL(`${encodeURIComponent(folderName)}/`, containerUri)
  const folderUri = destination.href
  const authFetch = getAuthenticatedFetch(db)
  let response: Response | null = null
  try {
    response = await authFetch(folderUri, {
      method: 'MKCOL',
    })
  } catch {
    response = null
  }

  if (!response || response.status === 405 || response.status === 501) {
    const fallback = await authFetch(containerUri, {
      method: 'POST',
      headers: {
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
        Slug: folderName,
      },
    })
    if (fallback.status === 409 || fallback.status === 412) {
      throw new FilesSaveConflictError(folderUri)
    }
    if (!fallback.ok) {
      throw new Error(`创建文件夹失败: HTTP ${fallback.status}`)
    }
    return readFileDetail(db, folderUri)
  }

  if (response.status === 409 || response.status === 412) {
    throw new FilesSaveConflictError(folderUri)
  }

  if (!response.ok) {
    throw new Error(`创建文件夹失败: HTTP ${response.status}`)
  }

  return readFileDetail(db, folderUri)
}
