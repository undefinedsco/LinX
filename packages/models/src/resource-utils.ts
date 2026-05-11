export function normalizePodBaseUrl(podBaseUrl: string): string {
  return podBaseUrl.replace(/\/+$/, '')
}

export function extractPodResourceId(uri: string | null | undefined): string | null {
  if (!uri) return null

  const hashIndex = uri.indexOf('#')
  if (hashIndex >= 0) {
    const fragment = uri.slice(hashIndex + 1)
    if (fragment && fragment !== 'this') {
      return decodeURIComponent(fragment)
    }
  }

  const path = hashIndex >= 0 ? uri.slice(0, hashIndex) : uri
  const match = path.match(/\/([^/]+?)(?:\.ttl)?\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function buildFragmentResourceIri(
  podBaseUrl: string,
  subjectPath: string,
): string {
  const normalizedBase = normalizePodBaseUrl(podBaseUrl)
  return `${normalizedBase}${subjectPath.startsWith('/') ? subjectPath : `/${subjectPath}`}`
}
