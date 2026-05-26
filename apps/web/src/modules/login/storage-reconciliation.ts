export interface StorageConflictDetectionInput {
  webId: string
  storageProviderUrl?: string
  storageProviderPublicUrl?: string | null
}

export interface StorageConflict {
  expectedStorageUrl: string
  actualStorageUrl: string | null
  storageProviderUrl: string | null
  managementUrl: string | null
}

const SOLID_STORAGE_IRI = 'http://www.w3.org/ns/solid/terms#storage'

export async function detectStorageConflict(
  input: StorageConflictDetectionInput,
): Promise<StorageConflict | null> {
  const expectedStorageUrl = resolveExpectedStorageUrl(input.webId, input.storageProviderPublicUrl)
  if (!expectedStorageUrl) {
    return null
  }

  const actualStorageUrl = await fetchProfileStorageUrl(input.webId)
  if (actualStorageUrl && normalizeUrl(expectedStorageUrl) === normalizeUrl(actualStorageUrl)) {
    return null
  }

  return {
    expectedStorageUrl,
    actualStorageUrl,
    storageProviderUrl: input.storageProviderUrl ?? null,
    managementUrl: buildAccountManagementUrl(input.storageProviderUrl),
  }
}

export function resolveExpectedStorageUrl(
  webId: string,
  storageProviderPublicUrl?: string | null,
): string | null {
  const baseUrl = normalizeBaseUrl(storageProviderPublicUrl)
  const podSlug = derivePodSlugFromWebId(webId)
  if (!baseUrl || !podSlug) {
    return null
  }
  return `${baseUrl}${podSlug}/`
}

export function derivePodSlugFromWebId(webId: string): string | null {
  try {
    const parsed = new URL(webId)
    const [podSlug] = parsed.pathname.split('/').filter(Boolean)
    return podSlug || null
  } catch {
    return null
  }
}

export function buildAccountManagementUrl(storageProviderUrl?: string | null): string | null {
  const baseUrl = normalizeBaseUrl(storageProviderUrl)
  if (!baseUrl) {
    return null
  }
  return `${baseUrl}.account/account/`
}

async function fetchProfileStorageUrl(webId: string): Promise<string | null> {
  const response = await fetch(webId, {
    headers: {
      Accept: 'application/ld+json, application/json;q=0.9, text/turtle;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`读取 WebID Profile 失败：HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const body = await response.text()

  if (contentType.includes('json')) {
    return extractStorageUrlFromJsonText(body) ?? extractStorageUrlFromTurtle(body)
  }

  return extractStorageUrlFromTurtle(body) ?? extractStorageUrlFromJsonText(body)
}

function extractStorageUrlFromJsonText(body: string): string | null {
  try {
    return findStorageUrl(JSON.parse(body))
  } catch {
    return null
  }
}

function findStorageUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStorageUrl(item)
      if (found) {
        return found
      }
    }
    return null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  for (const key of ['solid:storage', SOLID_STORAGE_IRI]) {
    const direct = record[key]
    if (direct) {
      const resolved = unwrapStorageValue(direct)
      if (resolved) {
        return resolved
      }
    }
  }

  for (const nested of Object.values(record)) {
    const found = findStorageUrl(nested)
    if (found) {
      return found
    }
  }

  return null
}

function unwrapStorageValue(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = unwrapStorageValue(item)
      if (found) {
        return found
      }
    }
    return null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record['@id'] === 'string') {
      return record['@id']
    }
    if (typeof record.id === 'string') {
      return record.id
    }
  }

  return null
}

function extractStorageUrlFromTurtle(body: string): string | null {
  const match = body.match(
    /(?:solid:storage|<http:\/\/www\.w3\.org\/ns\/solid\/terms#storage>)\s+<([^>]+)>/i,
  )
  return match?.[1] ?? null
}

function normalizeBaseUrl(url?: string | null): string | null {
  if (!url) {
    return null
  }

  try {
    return `${new URL(url).toString().replace(/\/+$/, '')}/`
  } catch {
    return null
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}
