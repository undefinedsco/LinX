import type { SolidDatabase } from '@undefineds.co/models'

export function resolveCurrentPodBaseUrl(db: SolidDatabase): string | null {
  const podUrl = (db as any).getDialect?.()?.getPodUrl?.() ?? (db as any).getPodUrl?.()
  return normalizePodBaseUrl(podUrl)
}

export function isResourceWithinCurrentPod(db: SolidDatabase, resourceId: unknown): boolean {
  if (typeof resourceId !== 'string' || !resourceId.trim()) return true
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(resourceId)) return true

  const podBase = resolveCurrentPodBaseUrl(db)
  if (!podBase) return true

  try {
    const resource = new URL(resourceId)
    const pod = new URL(`${podBase}/`)
    const podPath = pod.pathname.endsWith('/') ? pod.pathname : `${pod.pathname}/`
    return originsMatch(resource, pod)
      && (resource.pathname === pod.pathname.replace(/\/$/, '') || resource.pathname.startsWith(podPath))
  } catch {
    return false
  }
}

function originsMatch(resource: URL, pod: URL): boolean {
  if (resource.origin === pod.origin) return true

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  return resource.protocol === pod.protocol
    && resource.port === pod.port
    && loopbackHosts.has(resource.hostname)
    && loopbackHosts.has(pod.hostname)
}

export function filterRowsToCurrentPod<T extends { id?: unknown; '@id'?: unknown }>(
  db: SolidDatabase,
  rows: T[],
): T[] {
  return rows.filter((row) => isResourceWithinCurrentPod(db, row['@id'] ?? row.id))
}

function normalizePodBaseUrl(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null
  }

  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/\/+$/, '')
}
