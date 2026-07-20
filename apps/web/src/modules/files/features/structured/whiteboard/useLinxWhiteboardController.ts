import { useCallback, useEffect, useMemo, useRef } from 'react'

import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from '../../../domain/structured/structured-view-metadata'
import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import {
  createLinxSubjectShapeId,
  createLinxGroupShapeId,
  projectLinxWhiteboardSnapshot,
  reconcileLinxWhiteboardRecords,
  type LinxWhiteboardRecord,
} from './linx-whiteboard-adapter'

type TldrawEditorLike = {
  alignShapes?: (ids: string[], operation: WhiteboardAlignment) => void
  bringToFront?: (ids: string[]) => void
  createShapes?: (shapes: LinxWhiteboardRecord[]) => void
  deleteShapes?: (ids: string[]) => void
  distributeShapes?: (ids: string[], operation: WhiteboardDistribution) => void
  duplicateShapes?: (ids: string[], offset?: { x: number; y: number }) => void
  redo?: () => void
  select?: (...ids: string[]) => void
  sendToBack?: (ids: string[]) => void
  updateShapes?: (shapes: LinxWhiteboardRecord[]) => void
  zoomToSelection?: () => void
  zoomIn?: () => void
  zoomOut?: () => void
  zoomToFit?: () => void
  resetZoom?: () => void
  screenToPage?: (point: { x: number; y: number }) => { x: number; y: number }
  getCurrentPageShapes?: () => unknown[]
  getCamera?: () => { x: number; y: number; z: number }
  getSelectedShapeIds?: () => string[]
  groupShapes?: (ids: string[]) => void
  getShapePageBounds?: (id: string) => { x: number; y: number; w: number; h: number } | undefined
  reparentShapes?: (ids: string[], parentId: string) => void
  setCamera?: (camera: { x: number; y: number; z: number }) => void
  setCurrentTool?: (toolId: string) => void
  undo?: () => void
  store?: {
    listen?: (listener: () => void) => () => void
  }
}

export type WhiteboardAlignment = 'bottom' | 'center-horizontal' | 'center-vertical' | 'left' | 'right' | 'top'
export type WhiteboardDistribution = 'horizontal' | 'vertical'

function isLinxWhiteboardRecord(shape: unknown): shape is LinxWhiteboardRecord {
  if (!shape || typeof shape !== 'object') return false
  const record = shape as { id?: unknown; type?: unknown }
  return typeof record.id === 'string' && typeof record.type === 'string'
}

function isManagedWhiteboardRecord(shape: LinxWhiteboardRecord) {
  return shape.type === 'linx-subject'
    || shape.type === 'linx-group'
    || (shape.type === 'arrow' && typeof shape.meta?.linxRelationId === 'string')
}

export function syncLinxWhiteboardSnapshot(editor: TldrawEditorLike, snapshot: ReturnType<typeof projectLinxWhiteboardSnapshot>) {
  const currentRecords = Object.fromEntries(
    (editor.getCurrentPageShapes?.() ?? [])
      .filter(isLinxWhiteboardRecord)
      .map((shape) => [shape.id, shape]),
  )
  const nextRecords = reconcileLinxWhiteboardRecords(currentRecords, snapshot)
  const snapshotRecords = [...snapshot.groupRecords, ...snapshot.subjectShapes, ...snapshot.arrowRecords]
  const snapshotRecordIds = new Set(snapshotRecords.map((shape) => shape.id))
  const currentManagedIds = new Set(
    Object.values(currentRecords).filter(isManagedWhiteboardRecord).map((shape) => shape.id),
  )

  const shapesToCreate = snapshotRecords.filter((shape) => !currentManagedIds.has(shape.id))
  const shapesToUpdate = snapshotRecords
    .filter((shape) => currentManagedIds.has(shape.id))
    .map((shape) => nextRecords[shape.id])
  const shapesToDelete = Object.values(currentRecords)
    .filter((shape) => isManagedWhiteboardRecord(shape) && !snapshotRecordIds.has(shape.id))
    .map((shape) => shape.id)

  editor.createShapes?.(shapesToCreate)
  editor.updateShapes?.(shapesToUpdate)
  editor.deleteShapes?.(shapesToDelete)
}

export function useLinxWhiteboardController({
  model,
  snapshot: persistedSnapshot,
  onNodePositionChange,
  onRemoveSubject,
  onRestoreSubject,
  onSnapshotChange,
}: {
  model: StructuredWhiteboardViewModel
  snapshot?: StructuredWhiteboardSnapshotV1
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onRemoveSubject?: (subject: string) => void
  onRestoreSubject?: (subject: string) => void
  onSnapshotChange?: (snapshot: StructuredWhiteboardSnapshotV1) => void
}) {
  const editorRef = useRef<TldrawEditorLike | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const editorSubjectUrisRef = useRef(new Set<string>())
  const lastReportedSubjectPositionRef = useRef(new Map<string, string>())
  const clipboardShapeIdsRef = useRef<string[]>([])
  const hasObservedHydratedSubjectShapesRef = useRef(false)
  const lastSnapshotSignatureRef = useRef(persistedSnapshot ? JSON.stringify(persistedSnapshot) : '')
  const latestRef = useRef({
    model,
    onNodePositionChange,
    onRemoveSubject,
    onRestoreSubject,
    onSnapshotChange,
    persistedSnapshot,
  })
  latestRef.current = {
    model,
    onNodePositionChange,
    onRemoveSubject,
    onRestoreSubject,
    onSnapshotChange,
    persistedSnapshot,
  }
  const snapshot = useMemo(
    () => projectLinxWhiteboardSnapshot(model, persistedSnapshot),
    [model, persistedSnapshot],
  )

  const persistCurrentGeometry = useCallback(() => {
    const editor = editorRef.current
    if (!editor?.getCurrentPageShapes) return
    const latest = latestRef.current
    const currentShapes = editor.getCurrentPageShapes()
    const currentSubjectUris = new Set(
      currentShapes
        .filter(isLinxWhiteboardRecord)
        .filter((shape) => shape.type === 'linx-subject' && typeof shape.props?.resourceUri === 'string')
        .map((shape) => shape.props!.resourceUri!),
    )
    const liveModelSubjects = new Set(latest.model.nodes.map((node) => node.subject))
    if (currentSubjectUris.size > 0) hasObservedHydratedSubjectShapesRef.current = true
    if (
      currentSubjectUris.size === 0
      && liveModelSubjects.size > 0
      && !hasObservedHydratedSubjectShapesRef.current
    ) return
    for (const subject of editorSubjectUrisRef.current) {
      if (!currentSubjectUris.has(subject) && liveModelSubjects.has(subject)) latest.onRemoveSubject?.(subject)
    }
    for (const subject of currentSubjectUris) {
      if (!liveModelSubjects.has(subject)) latest.onRestoreSubject?.(subject)
    }
    editorSubjectUrisRef.current = currentSubjectUris
    for (const subject of lastReportedSubjectPositionRef.current.keys()) {
      if (!currentSubjectUris.has(subject)) lastReportedSubjectPositionRef.current.delete(subject)
    }
    const groups: StructuredWhiteboardSnapshotV1['groups'] = currentShapes
      .filter(isLinxWhiteboardRecord)
      .filter((shape) => shape.type === 'linx-group')
      .map((shape) => ({
        id: shape.id,
        title: typeof shape.props?.title === 'string' ? shape.props.title : 'Section',
        color: typeof shape.props?.color === 'string' ? shape.props.color : 'blue',
      }))
    const groupIds = new Set(groups.map((group) => group.id))
    const nodes: StructuredWhiteboardSnapshotV1['nodes'] = []
    for (const shape of currentShapes) {
      if (!isLinxWhiteboardRecord(shape)) continue
      if (shape.type === 'linx-group' && typeof shape.x === 'number' && typeof shape.y === 'number') {
        nodes.push({
          resourceUri: shape.id,
          x: Math.round(shape.x),
          y: Math.round(shape.y),
          w: typeof shape.props?.w === 'number' ? Math.round(shape.props.w) : 640,
          h: typeof shape.props?.h === 'number' ? Math.round(shape.props.h) : 420,
          z: nodes.length,
          shapeId: shape.id,
          kind: 'group',
        })
        continue
      }
      if (shape.type !== 'linx-subject' || !shape.props?.resourceUri) continue
      if (typeof shape.x !== 'number' || typeof shape.y !== 'number') continue
      const pageBounds = editor.getShapePageBounds?.(shape.id)
      const pagePosition = {
        x: Math.round(pageBounds?.x ?? shape.x),
        y: Math.round(pageBounds?.y ?? shape.y),
      }
      const positionSignature = `${pagePosition.x}:${pagePosition.y}`
      if (
        !latest.onSnapshotChange
        && lastReportedSubjectPositionRef.current.get(shape.props.resourceUri) !== positionSignature
      ) {
        lastReportedSubjectPositionRef.current.set(shape.props.resourceUri, positionSignature)
        latest.onNodePositionChange?.(shape.props.resourceUri, pagePosition)
      }
      const node: StructuredWhiteboardSnapshotV1['nodes'][number] = {
        resourceUri: shape.props.resourceUri,
        x: Math.round(shape.x),
        y: Math.round(shape.y),
        w: typeof shape.props.w === 'number' ? Math.round(shape.props.w) : 288,
        h: typeof shape.props.h === 'number' ? Math.round(shape.props.h) : 160,
        z: nodes.length,
        shapeId: shape.id,
        kind: shape.props.resourceKind === 'file'
          || shape.props.resourceKind === 'card'
          || shape.props.resourceKind === 'group'
          ? shape.props.resourceKind
          : 'subject',
      }
      if (shape.parentId && groupIds.has(shape.parentId)) node.groupId = shape.parentId
      nodes.push(node)
    }
    if (!latest.onSnapshotChange) return
    const camera = editor.getCamera?.() ?? latest.persistedSnapshot?.camera ?? { x: 0, y: 0, z: 1 }
    const nextSnapshot: StructuredWhiteboardSnapshotV1 = {
      version: 1,
      camera: {
        x: Math.round(camera.x),
        y: Math.round(camera.y),
        z: camera.z,
      },
      nodes,
      groups,
      visualRelations: latest.model.relations
        .filter((relation) => relation.source === 'visual')
        .map((relation) => ({
          id: relation.id,
          from: relation.from,
          to: relation.to,
          label: relation.predicate,
        })),
    }
    const signature = JSON.stringify(nextSnapshot)
    if (signature === lastSnapshotSignatureRef.current) return
    lastSnapshotSignatureRef.current = signature
    latest.onSnapshotChange(nextSnapshot)
  }, [])

  const handleMount = useCallback((editor: unknown) => {
    const tldrawEditor = editor as TldrawEditorLike
    editorRef.current = tldrawEditor
    if (persistedSnapshot?.camera) {
      tldrawEditor.setCamera?.(persistedSnapshot.camera)
    }
    syncLinxWhiteboardSnapshot(tldrawEditor, snapshot)
    editorSubjectUrisRef.current = new Set(snapshot.subjectShapes.map((shape) => shape.props.resourceUri))
    hasObservedHydratedSubjectShapesRef.current = (tldrawEditor.getCurrentPageShapes?.() ?? [])
      .filter(isLinxWhiteboardRecord)
      .some((shape) => shape.type === 'linx-subject')
    unsubscribeRef.current?.()
    unsubscribeRef.current = tldrawEditor.store?.listen?.(persistCurrentGeometry) ?? null
  }, [persistCurrentGeometry, persistedSnapshot?.camera, snapshot])

  useEffect(() => () => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }, [])

  const focusSubject = useCallback((subject: string) => {
    const editor = editorRef.current
    const matchingShape = (editor?.getCurrentPageShapes?.() ?? [])
      .filter(isLinxWhiteboardRecord)
      .find((shape) => shape.type === 'linx-subject' && shape.props?.resourceUri === subject)
    const shapeId = matchingShape?.id ?? createLinxSubjectShapeId(subject)
    editor?.select?.(shapeId)
    editor?.zoomToSelection?.()
  }, [])

  const selectedShapeIds = () => editorRef.current?.getSelectedShapeIds?.() ?? []
  const fitContent = useCallback(() => editorRef.current?.zoomToFit?.(), [])

  return {
    alignSelection: (operation: WhiteboardAlignment) => {
      const ids = selectedShapeIds()
      if (ids.length > 1) editorRef.current?.alignShapes?.(ids, operation)
    },
    bringSelectionToFront: () => {
      const ids = selectedShapeIds()
      if (ids.length > 0) editorRef.current?.bringToFront?.(ids)
    },
    copySelection: () => {
      clipboardShapeIdsRef.current = selectedShapeIds()
    },
    deleteSelection: () => {
      const ids = selectedShapeIds()
      if (ids.length > 0) editorRef.current?.deleteShapes?.(ids)
    },
    distributeSelection: (operation: WhiteboardDistribution) => {
      const ids = selectedShapeIds()
      if (ids.length > 2) editorRef.current?.distributeShapes?.(ids, operation)
    },
    duplicateSelection: () => {
      const ids = selectedShapeIds()
      if (ids.length > 0) editorRef.current?.duplicateShapes?.(ids, { x: 24, y: 24 })
    },
    editorRef,
    fitContent,
    focusSubject,
    groupSelection: () => {
      const ids = selectedShapeIds()
      const editor = editorRef.current
      if (!editor || ids.length < 2) return
      const bounds = ids.flatMap((id) => {
        const bound = editor.getShapePageBounds?.(id)
        return bound ? [bound] : []
      })
      if (bounds.length === 0) return
      const left = Math.min(...bounds.map((bound) => bound.x))
      const top = Math.min(...bounds.map((bound) => bound.y))
      const right = Math.max(...bounds.map((bound) => bound.x + bound.w))
      const bottom = Math.max(...bounds.map((bound) => bound.y + bound.h))
      const groupId = createLinxGroupShapeId()
      editor.createShapes?.([{
        id: groupId,
        type: 'linx-group',
        x: left - 24,
        y: top - 48,
        props: {
          title: 'Section',
          color: 'blue',
          w: right - left + 48,
          h: bottom - top + 72,
        },
      }])
      editor.reparentShapes?.(ids, groupId)
      editor.sendToBack?.([groupId])
    },
    handTool: () => editorRef.current?.setCurrentTool?.('hand'),
    handleMount,
    selectTool: () => editorRef.current?.setCurrentTool?.('select'),
    snapshot,
    syncSnapshot: useCallback(() => {
      if (editorRef.current) syncLinxWhiteboardSnapshot(editorRef.current, snapshot)
    }, [snapshot]),
    zoomIn: () => editorRef.current?.zoomIn?.(),
    zoomOut: () => editorRef.current?.zoomOut?.(),
    resetZoom: () => editorRef.current?.resetZoom?.(),
    pasteSelection: () => {
      const ids = clipboardShapeIdsRef.current
      if (ids.length > 0) editorRef.current?.duplicateShapes?.(ids, { x: 24, y: 24 })
    },
    screenToPage: (point: { x: number; y: number }) => editorRef.current?.screenToPage?.(point) ?? point,
    redo: () => editorRef.current?.redo?.(),
    selectedShapeCount: () => selectedShapeIds().length,
    sendSelectionToBack: () => {
      const ids = selectedShapeIds()
      if (ids.length > 0) editorRef.current?.sendToBack?.(ids)
    },
    undo: () => editorRef.current?.undo?.(),
  }
}
