import type { SolidDatabase } from '@undefineds.co/models'

export function resolveCurrentPodBaseUrl(db: SolidDatabase): string | null {
  const podUrl = (db as any).getDialect?.()?.getPodUrl?.() ?? (db as any).getPodUrl?.()
  return normalizePodBaseUrl(podUrl)
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
