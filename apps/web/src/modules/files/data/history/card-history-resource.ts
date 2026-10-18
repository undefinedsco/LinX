import type { SolidDatabase } from '@undefineds.co/models'

import { PodRequestError, withPodRequestBoundary } from '../pod-adapter/pod-request-boundary'
import { getAuthenticatedFetch } from '../pod-adapter/pod-runtime'

/**
 * Pod I/O for card version history sidecars (see domain/history/card-history.ts).
 * Writes are conditional on the ETag that was read so two devices appending
 * versions do not overwrite each other.
 */

export class CardHistoryRequestError extends Error {
  constructor(readonly kind: 'offline' | 'forbidden' | 'conflict' | 'failed', message: string) {
    super(message)
    this.name = 'CardHistoryRequestError'
  }
}

export type CardHistoryResource =
  | { state: 'exists'; content: string; etag: string | null }
  | { state: 'missing'; content: null; etag: null }

function toError(error: unknown, action: string): CardHistoryRequestError {
  if (error instanceof CardHistoryRequestError) return error
  if (error instanceof PodRequestError && (error.kind === 'offline' || error.kind === 'timeout')) {
    return new CardHistoryRequestError('offline', `${action}: ${error.message}`)
  }
  return new CardHistoryRequestError('failed', `${action}: ${error instanceof Error ? error.message : String(error)}`)
}

export async function readCardHistoryResource(db: SolidDatabase, uri: string): Promise<CardHistoryResource> {
  try {
    return await withPodRequestBoundary(async (signal) => {
      const response = await getAuthenticatedFetch(db)(uri, { method: 'GET', cache: 'no-store', signal })
      if (response.status === 404 || response.status === 410) return { state: 'missing', content: null, etag: null } as const
      if (response.status === 401 || response.status === 403) throw new CardHistoryRequestError('forbidden', `HTTP ${response.status}`)
      if (!response.ok) throw new CardHistoryRequestError('failed', `HTTP ${response.status}`)
      return { state: 'exists', content: await response.text(), etag: response.headers.get('etag') } as const
    })
  } catch (error) {
    throw toError(error, '读取版本记录失败')
  }
}

export async function writeCardHistoryResource(
  db: SolidDatabase,
  { uri, content, etag }: { uri: string; content: string; etag: string | null | 'absent' },
): Promise<void> {
  try {
    await withPodRequestBoundary(async (signal) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (etag === 'absent') headers['If-None-Match'] = '*'
      else if (etag) headers['If-Match'] = etag
      const response = await getAuthenticatedFetch(db)(uri, { method: 'PUT', signal, headers, body: content })
      if (response.status === 412) throw new CardHistoryRequestError('conflict', 'HTTP 412')
      if (!response.ok) throw new CardHistoryRequestError('failed', `HTTP ${response.status}`)
    })
  } catch (error) {
    throw toError(error, '保存版本记录失败')
  }
}
