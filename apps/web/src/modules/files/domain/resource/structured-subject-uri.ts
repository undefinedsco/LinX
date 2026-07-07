export function resolveStructuredSubjectResourceUri(documentUri: string, subject: string): string | null {
  const trimmed = subject.trim()
  if (!trimmed) return documentUri
  if (trimmed.startsWith('#')) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin !== new URL(documentUri).origin) return null
    if (url.hash) return null
    return url.toString()
  } catch {
    // Continue with document-relative resolution for explicit resource paths only.
  }

  if (!trimmed.startsWith('./') && !trimmed.startsWith('../') && !trimmed.startsWith('/')) {
    return null
  }

  try {
    const url = new URL(trimmed, documentUri)
    if (url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

export function resolveStructuredSubjectContainingResourceUri(documentUri: string, subject: string): string | null {
  const trimmed = subject.trim()
  if (!trimmed) return documentUri

  if (trimmed.startsWith('#')) return documentUri

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin !== new URL(documentUri).origin) return null
    if (!url.hash) return null
    url.hash = ''
    return url.toString()
  } catch {
    // Continue with document-relative resolution for explicit fragment paths.
  }

  if (!trimmed.startsWith('./') && !trimmed.startsWith('../') && !trimmed.startsWith('/')) {
    return null
  }

  try {
    const url = new URL(trimmed, documentUri)
    if (!url.hash) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function resolveStructuredSubjectExternalUri(documentUri: string, subject: string): string | null {
  const trimmed = subject.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin === new URL(documentUri).origin) return null
    return url.toString()
  } catch {
    return null
  }
}
