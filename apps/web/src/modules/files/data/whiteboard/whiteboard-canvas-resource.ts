import type { SolidDatabase } from '@undefineds.co/models'

import { WHITEBOARD_CANVAS_MIME_TYPE } from '../../domain/structured/structured-whiteboard-canvas'
import { PodRequestError, withPodRequestBoundary } from '../pod-adapter/pod-request-boundary'
import { getAuthenticatedFetch } from '../pod-adapter/pod-runtime'

/**
 * Pod I/O for whiteboard layouts (JSON Canvas files). Writes are conditional on
 * the ETag that was read, so two devices editing the same board never silently
 * overwrite each other.
 */

export type WhiteboardCanvasRequestErrorKind = 'offline' | 'forbidden' | 'conflict' | 'failed'

export class WhiteboardCanvasRequestError extends Error {
  constructor(
    readonly kind: WhiteboardCanvasRequestErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = 'WhiteboardCanvasRequestError'
  }
}

export type WhiteboardCanvasResource =
  | { uri: string; state: 'exists'; content: string; etag: string | null }
  | { uri: string; state: 'missing'; content: null; etag: null }

/**
 * What the writer expects to find on the server:
 * - `absent`: create only, fail if another device created it first;
 * - `etag`: replace only the version that was read;
 * - `any`: the server gave no ETag to compare with, so replace whatever is there.
 */
export type WhiteboardCanvasWriteExpectation =
  | { kind: 'absent' }
  | { kind: 'etag'; etag: string }
  | { kind: 'any' }

function errorFromStatus(status: number, action: string): WhiteboardCanvasRequestError {
  if (status === 401 || status === 403) {
    return new WhiteboardCanvasRequestError('forbidden', `${action}: HTTP ${status}`, status)
  }
  if (status === 412) {
    return new WhiteboardCanvasRequestError('conflict', `${action}: HTTP ${status}`, status)
  }
  return new WhiteboardCanvasRequestError('failed', `${action}: HTTP ${status}`, status)
}

function toWhiteboardCanvasError(error: unknown, action: string): WhiteboardCanvasRequestError {
  if (error instanceof WhiteboardCanvasRequestError) return error
  if (error instanceof PodRequestError) {
    if (error.kind === 'offline' || error.kind === 'timeout') {
      return new WhiteboardCanvasRequestError('offline', `${action}: ${error.message}`)
    }
    if (error.kind === 'forbidden' || error.kind === 'unauthorized') {
      return new WhiteboardCanvasRequestError('forbidden', `${action}: ${error.message}`, error.status ?? null)
    }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new WhiteboardCanvasRequestError('offline', `${action}: offline`)
  }
  return new WhiteboardCanvasRequestError('failed', `${action}: ${error instanceof Error ? error.message : String(error)}`)
}

export async function readWhiteboardCanvasResource(
  db: SolidDatabase,
  uri: string,
): Promise<WhiteboardCanvasResource> {
  try {
    return await withPodRequestBoundary(async (signal) => {
      const response = await getAuthenticatedFetch(db)(uri, {
        method: 'GET',
        cache: 'no-store',
        signal,
        headers: { Accept: 'application/json, text/plain;q=0.8, */*;q=0.1' },
      })
      if (response.status === 404 || response.status === 410) {
        return { uri, state: 'missing', content: null, etag: null } as const
      }
      if (!response.ok) throw errorFromStatus(response.status, '读取白板失败')
      return {
        uri,
        state: 'exists',
        content: await response.text(),
        etag: response.headers.get('etag'),
      } as const
    })
  } catch (error) {
    throw toWhiteboardCanvasError(error, '读取白板失败')
  }
}

async function readWhiteboardCanvasEtag(db: SolidDatabase, uri: string): Promise<string | null> {
  try {
    const response = await getAuthenticatedFetch(db)(uri, { method: 'HEAD', cache: 'no-store' })
    return response.ok ? response.headers.get('etag') : null
  } catch {
    return null
  }
}

export async function writeWhiteboardCanvasResource(
  db: SolidDatabase,
  {
    uri,
    content,
    expect,
  }: {
    uri: string
    content: string
    expect: WhiteboardCanvasWriteExpectation
  },
): Promise<{ etag: string | null }> {
  try {
    return await withPodRequestBoundary(async (signal) => {
      const headers: Record<string, string> = { 'Content-Type': WHITEBOARD_CANVAS_MIME_TYPE }
      if (expect.kind === 'absent') headers['If-None-Match'] = '*'
      if (expect.kind === 'etag') headers['If-Match'] = expect.etag
      const response = await getAuthenticatedFetch(db)(uri, {
        method: 'PUT',
        signal,
        headers,
        body: content,
      })
      if (!response.ok) throw errorFromStatus(response.status, '保存白板失败')
      return { etag: response.headers.get('etag') ?? await readWhiteboardCanvasEtag(db, uri) }
    })
  } catch (error) {
    throw toWhiteboardCanvasError(error, '保存白板失败')
  }
}
