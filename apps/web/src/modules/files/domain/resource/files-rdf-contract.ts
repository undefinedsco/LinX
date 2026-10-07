// Temporary Files-local RDF/path contract. Keep new Files proposal/ingest/vocab
// paths here until these shared semantics move into @undefineds.co/models.
export const FILES_VOCAB_NS = 'https://undefineds.co/vocab/'

export type FilesVocabRegistryKind = 'terms' | 'shapes' | 'namespaces'

export function ensureFilesContainerUri(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeFilesContainerUri(value: string): string {
  try {
    return ensureFilesContainerUri(new URL(value).href)
  } catch {
    return ensureFilesContainerUri(value)
  }
}

function normalizeFilesResourceUri(value: string): string {
  try {
    return new URL(value).href
  } catch {
    return value
  }
}

export function resolveFilesPodRootUri(
  resourceUri: string,
  options: { inferLocalPathPod?: boolean; currentPodRootUri?: string | null } = {},
): string {
  if (options.currentPodRootUri) {
    const currentPodRoot = normalizeFilesContainerUri(options.currentPodRootUri)
    const normalizedResourceUri = normalizeFilesResourceUri(resourceUri)
    if (normalizedResourceUri === currentPodRoot.slice(0, -1) || normalizedResourceUri.startsWith(currentPodRoot)) {
      return currentPodRoot
    }
  }
  const markerIndex = resourceUri.search(/\/\.(?:data|vocab)\//)
  if (markerIndex >= 0) return resourceUri.slice(0, markerIndex + 1)
  try {
    const url = new URL(resourceUri)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    if (
      options.inferLocalPathPod &&
      pathSegments.length > 0 &&
      (url.hostname.startsWith('node-') || url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return `${url.origin}/${pathSegments[0]}/`
    }
    return `${url.origin}/`
  } catch {
    return ensureFilesContainerUri(resourceUri)
  }
}

export function filesDataResourceUri(podRootUri: string, relativePath: string): string {
  return `${ensureFilesContainerUri(podRootUri)}.data/${relativePath.replace(/^\/+/, '')}`
}

export function filesVocabRegistryUri(podRootUri: string, kind: FilesVocabRegistryKind): string {
  return `${ensureFilesContainerUri(podRootUri)}.vocab/${kind}.ttl`
}

function stripUrlLocatorParts(value: URL): URL {
  const normalized = new URL(value.href)
  normalized.hash = ''
  normalized.search = ''
  return normalized
}

export function filesAppMetaResourceUri(
  ownerUri: string,
  options: { currentPodRootUri?: string | null } = {},
): string {
  resolveFilesPodRootUri(ownerUri, {
    currentPodRootUri: options.currentPodRootUri,
    inferLocalPathPod: true,
  })

  try {
    const ownerUrl = stripUrlLocatorParts(new URL(ownerUri))
    if (ownerUrl.pathname.endsWith('/')) {
      return new URL('.meta', ownerUrl.href).href
    }
    ownerUrl.pathname = `${ownerUrl.pathname}.meta`
    return ownerUrl.href
  } catch {
    const owner = normalizeFilesResourceUri(ownerUri)
    return owner.endsWith('/') ? `${owner}.meta` : `${owner}.meta`
  }
}

export function resolveFilesAppMetaOwnerUri(metaUri: string): string | null {
  try {
    const url = stripUrlLocatorParts(new URL(metaUri))
    if (url.pathname.endsWith('/.meta')) {
      url.pathname = url.pathname.slice(0, -'.meta'.length)
      return ensureFilesContainerUri(url.href)
    }
    if (url.pathname.endsWith('.meta')) {
      url.pathname = url.pathname.slice(0, -'.meta'.length)
      return url.href
    }

    const marker = '/.meta/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0 || !url.pathname.endsWith('.ttl')) return null

    const rootUrl = new URL(url.href)
    rootUrl.pathname = url.pathname.slice(0, markerIndex + 1)
    rootUrl.hash = ''
    rootUrl.search = ''

    const encodedOwnerKey = url.pathname.slice(markerIndex + marker.length, -'.ttl'.length)
    const ownerKey = decodeURIComponent(encodedOwnerKey)
    return new URL(ownerKey === '.' ? './' : ownerKey, rootUrl.href).href
  } catch {
    return null
  }
}

export function isFilesReservedResourceUri(resourceUri: string): boolean {
  const normalized = normalizeFilesResourceUri(resourceUri)
  let pathname = normalized
  try {
    pathname = new URL(normalized).pathname
  } catch {
    // Keep the raw value for non-URL test fixtures.
  }
  return (
    /\/\.vocab\//.test(pathname) ||
    /\/\.meta(?:\/|$)/.test(pathname) ||
    /\/\.data\/(?:proposals|ingest|index|approvals)\//.test(pathname) ||
    pathname.endsWith('.meta') ||
    pathname.endsWith('.acl') ||
    pathname.endsWith('.acr')
  )
}

export function filesProposalInstanceSuffix(parts: readonly unknown[]): string {
  const value = parts.map((part) => {
    if (Array.isArray(part)) return part.join('\u001f')
    return part == null ? '' : String(part)
  }).join('\u001e')
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7)
}

export function filesMetaInsertDataPatch(metaUri: string, turtleSource: string): string {
  const prefixes: string[] = []
  const triples: string[] = []

  for (const rawLine of turtleSource.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const prefixMatch = line.match(/^@prefix\s+([A-Za-z][\w-]*:)\s+<([^>]+)>\s*\.\s*$/)
    if (prefixMatch) {
      prefixes.push(`PREFIX ${prefixMatch[1]} <${prefixMatch[2]}>`)
      continue
    }
    triples.push(rawLine.trimEnd())
  }

  return [
    `BASE <${metaUri}>`,
    ...prefixes,
    '',
    'INSERT DATA {',
    ...triples.map((line) => `  ${line}`),
    '}',
  ].join('\n')
}

export function turtleString(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`
}
