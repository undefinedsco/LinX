import { useCallback, useMemo } from 'react'

import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  readWhiteboardCanvasResource,
  writeWhiteboardCanvasResource,
  WhiteboardCanvasRequestError,
  type WhiteboardCanvasResource,
  type WhiteboardCanvasWriteExpectation,
} from '../whiteboard/whiteboard-canvas-resource'
import { useFilesCurrentPodRootUri } from './resource-queries'

export {
  WhiteboardCanvasRequestError,
  type WhiteboardCanvasResource,
  type WhiteboardCanvasWriteExpectation,
}

export interface WhiteboardCanvasPodAccess {
  podRootUri: string | null
  ready: boolean
  read: (uri: string) => Promise<WhiteboardCanvasResource>
  write: (input: { uri: string; content: string; expect: WhiteboardCanvasWriteExpectation }) => Promise<{ etag: string | null }>
}

/**
 * Pod access for whiteboard layouts. The board keeps its own working copy and
 * ETag (it saves continuously while the user drags), so this exposes plain
 * read/write calls bound to the signed-in Pod instead of a cached query.
 */
export function useWhiteboardCanvasPodAccess(): WhiteboardCanvasPodAccess {
  const { db } = useSolidDatabase()
  const podRootUri = useFilesCurrentPodRootUri()
  const read = useCallback(async (uri: string) => {
    if (!db) throw new WhiteboardCanvasRequestError('offline', '还没有连上你的空间')
    return readWhiteboardCanvasResource(db, uri)
  }, [db])
  const write = useCallback(async (input: { uri: string; content: string; expect: WhiteboardCanvasWriteExpectation }) => {
    if (!db) throw new WhiteboardCanvasRequestError('offline', '还没有连上你的空间')
    return writeWhiteboardCanvasResource(db, input)
  }, [db])
  return useMemo(() => ({
    podRootUri,
    ready: Boolean(db && podRootUri),
    read,
    write,
  }), [db, podRootUri, read, write])
}
