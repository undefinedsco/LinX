import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  countWhiteboardCanvasMovedNodes,
  createEmptyWhiteboardCanvas,
  isWhiteboardCanvasEmpty,
  migrateLegacyWhiteboardToCanvas,
  parseWhiteboardCanvas,
  serializeWhiteboardCanvas,
  whiteboardCanvasResourceUri,
  whiteboardCanvasSignature,
  type WhiteboardCanvas,
} from '../../../domain/structured/structured-whiteboard-canvas'
import type { StructuredWhiteboardVisualRelation } from '../../../domain/structured/structured-projections'
import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from '../../../domain/structured/structured-view-metadata'
import {
  useWhiteboardCanvasPodAccess,
  WhiteboardCanvasRequestError,
  type WhiteboardCanvasPodAccess,
  type WhiteboardCanvasWriteExpectation,
} from '../../../data/queries/whiteboard-canvas-queries'

export type WhiteboardSaveStatus =
  | 'loading'
  | 'local' // not connected to a space: edits stay on this screen
  | 'saved'
  | 'saving'
  | 'offline'
  | 'readonly'
  | 'conflict'
  | 'unreadable'

export interface WhiteboardLegacyInput {
  selectedSubjects: readonly string[]
  positions?: Record<string, StructuredWhiteboardPosition>
  snapshot?: StructuredWhiteboardSnapshotV1 | null
  visualRelations?: readonly StructuredWhiteboardVisualRelation[]
}

const SAVE_DELAY_MS = 600

export function useWhiteboardCanvasState({
  documentUri,
  legacy,
  access: accessOverride,
  saveDelayMs = SAVE_DELAY_MS,
}: {
  documentUri: string
  legacy: WhiteboardLegacyInput
  access?: WhiteboardCanvasPodAccess
  saveDelayMs?: number
}) {
  const podAccess = useWhiteboardCanvasPodAccess()
  const access = accessOverride ?? podAccess
  const [canvas, setCanvasState] = useState<WhiteboardCanvas>(createEmptyWhiteboardCanvas)
  const [status, setStatus] = useState<WhiteboardSaveStatus>('loading')
  const [conflict, setConflict] = useState<{ remote: WhiteboardCanvas; etag: string | null; moved: number; otherChanges: boolean } | null>(null)
  const canvasRef = useRef(canvas)
  const etagRef = useRef<string | null>(null)
  const expectRef = useRef<WhiteboardCanvasWriteExpectation>({ kind: 'absent' })
  const savedSignatureRef = useRef(whiteboardCanvasSignature(canvas))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)
  const blockedRef = useRef(false)
  const legacyRef = useRef(legacy)
  legacyRef.current = legacy
  const accessRef = useRef(access)
  accessRef.current = access

  const podRootUri = access.podRootUri
  const resourceUri = useMemo(
    () => (podRootUri ? whiteboardCanvasResourceUri(podRootUri, documentUri) : null),
    [documentUri, podRootUri],
  )
  const resourceUriRef = useRef(resourceUri)
  resourceUriRef.current = resourceUri

  const applyLoaded = useCallback((next: WhiteboardCanvas, signature: string) => {
    canvasRef.current = next
    savedSignatureRef.current = signature
    setCanvasState(next)
  }, [])

  const flush = useCallback(async () => {
    const uri = resourceUriRef.current
    if (!uri || !loadedRef.current || blockedRef.current) return
    const current = canvasRef.current
    const signature = whiteboardCanvasSignature(current)
    if (signature === savedSignatureRef.current) return
    setStatus('saving')
    try {
      const result = await accessRef.current.write({
        uri,
        content: serializeWhiteboardCanvas(current, { viewOf: documentUri }),
        expect: expectRef.current,
      })
      etagRef.current = result.etag
      expectRef.current = result.etag ? { kind: 'etag', etag: result.etag } : { kind: 'any' }
      savedSignatureRef.current = signature
      setStatus(whiteboardCanvasSignature(canvasRef.current) === signature ? 'saved' : 'saving')
    } catch (error) {
      const kind = error instanceof WhiteboardCanvasRequestError ? error.kind : 'failed'
      if (kind === 'offline') setStatus('offline')
      else if (kind === 'forbidden') {
        blockedRef.current = true
        setStatus('readonly')
      } else if (kind === 'conflict') {
        try {
          const remote = await accessRef.current.read(uri)
          const parsed = remote.state === 'exists' ? parseWhiteboardCanvas(remote.content) : null
          const remoteCanvas = parsed?.canvas ?? createEmptyWhiteboardCanvas()
          const { moved, otherChanges } = countWhiteboardCanvasMovedNodes(current, remoteCanvas)
          setConflict({ remote: remoteCanvas, etag: remote.etag, moved, otherChanges })
          setStatus('conflict')
        } catch {
          setStatus('offline')
        }
      } else setStatus('offline')
    }
  }, [documentUri])

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush() }, saveDelayMs)
  }, [flush, saveDelayMs])

  // Load once the Pod is reachable; migrate the earlier browser-only layout.
  useEffect(() => {
    loadedRef.current = false
    blockedRef.current = false
    if (!resourceUri || !access.ready) {
      setStatus('local')
      loadedRef.current = false
      return
    }
    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const resource = await accessRef.current.read(resourceUri)
        if (cancelled) return
        if (resource.state === 'exists') {
          const parsed = parseWhiteboardCanvas(resource.content)
          if (!parsed) {
            blockedRef.current = true
            loadedRef.current = true
            setStatus('unreadable')
            return
          }
          etagRef.current = resource.etag
          expectRef.current = resource.etag ? { kind: 'etag', etag: resource.etag } : { kind: 'any' }
          applyLoaded(parsed.canvas, whiteboardCanvasSignature(parsed.canvas))
          loadedRef.current = true
          setStatus('saved')
          return
        }
        const input = legacyRef.current
        const migrated = migrateLegacyWhiteboardToCanvas({
          documentUri,
          podRootUri,
          selectedSubjects: input.selectedSubjects,
          positions: input.positions,
          snapshot: input.snapshot,
          visualRelations: input.visualRelations,
        })
        expectRef.current = { kind: 'absent' }
        // Leave the saved signature empty so a migrated board is written once.
        canvasRef.current = migrated
        savedSignatureRef.current = whiteboardCanvasSignature(createEmptyWhiteboardCanvas())
        setCanvasState(migrated)
        loadedRef.current = true
        setStatus('saved')
        if (!isWhiteboardCanvasEmpty(migrated)) schedule()
      } catch (error) {
        if (cancelled) return
        const kind = error instanceof WhiteboardCanvasRequestError ? error.kind : 'failed'
        loadedRef.current = false
        setStatus(kind === 'forbidden' ? 'readonly' : 'offline')
      }
    })()
    return () => { cancelled = true }
  }, [access.ready, applyLoaded, documentUri, podRootUri, resourceUri, schedule])

  // Save what is pending when leaving, and retry when the network is back.
  useEffect(() => {
    const retry = () => { if (loadedRef.current) void flush() }
    window.addEventListener('online', retry)
    return () => {
      window.removeEventListener('online', retry)
      if (timerRef.current) clearTimeout(timerRef.current)
      void flush()
    }
  }, [flush])

  const updateCanvas = useCallback((update: (current: WhiteboardCanvas) => WhiteboardCanvas) => {
    const next = update(canvasRef.current)
    if (next === canvasRef.current) return
    canvasRef.current = next
    setCanvasState(next)
    if (loadedRef.current) schedule()
  }, [schedule])

  const takeLatest = useCallback(() => {
    if (!conflict) return
    etagRef.current = conflict.etag
    expectRef.current = conflict.etag ? { kind: 'etag', etag: conflict.etag } : { kind: 'any' }
    applyLoaded(conflict.remote, whiteboardCanvasSignature(conflict.remote))
    setConflict(null)
    setStatus('saved')
  }, [applyLoaded, conflict])

  const keepMine = useCallback(() => {
    if (!conflict) return
    expectRef.current = conflict.etag ? { kind: 'etag', etag: conflict.etag } : { kind: 'any' }
    setConflict(null)
    void flush()
  }, [conflict, flush])

  return { canvas, updateCanvas, status, conflict, takeLatest, keepMine, podRootUri }
}
