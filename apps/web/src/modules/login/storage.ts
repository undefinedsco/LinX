import { ISSUER_STORAGE_KEY } from './constants'
import type { StoredIssuer } from './types'

const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export const loadStoredIssuers = (): StoredIssuer[] => {
  const parsed = safeParse<StoredIssuer[]>(typeof window !== 'undefined' ? localStorage.getItem(ISSUER_STORAGE_KEY) : null)
  if (!parsed || !Array.isArray(parsed)) return []
  return parsed
}

export const saveStoredIssuers = (issuers: StoredIssuer[]) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(ISSUER_STORAGE_KEY, JSON.stringify(issuers.slice(0, 10)))
}

export const upsertStoredIssuer = (url: string, label?: string, logoUrl?: string) => {
  if (typeof window === 'undefined') return
  const existing = loadStoredIssuers()
  const next: StoredIssuer[] = [
    { url, label, logoUrl, updatedAt: new Date().toISOString() },
    ...existing.filter((item) => item.url !== url),
  ]
  saveStoredIssuers(next)
}

export const removeStoredIssuer = (url: string) => {
  if (typeof window === 'undefined') return
  const existing = loadStoredIssuers()
  const next = existing.filter((item) => item.url !== url)
  saveStoredIssuers(next)
}
