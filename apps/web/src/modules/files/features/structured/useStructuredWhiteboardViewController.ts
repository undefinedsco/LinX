import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import type { StructuredWhiteboardPosition } from '../../domain/structured/structured-view-metadata'
import {
  projectStructuredWhiteboardClampedPosition,
  projectStructuredWhiteboardViewModel,
  type StructuredWhiteboardVisualRelation,
} from './structured-whiteboard-view-model'
import { useStructuredWhiteboardRelationController } from './useStructuredWhiteboardRelationController'

const EMPTY_WHITEBOARD_LAYOUT: Record<string, { x: number; y: number }> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []

export type StructuredWhiteboardSubjectOpenOptions = {
  navigate?: boolean
}

function readWhiteboardFrameSize(frame: HTMLDivElement | null) {
  if (!frame) return null
  return {
    width: frame.clientWidth,
    height: frame.clientHeight,
  }
}

function resetAncestorHorizontalScroll(element: HTMLElement | null) {
  let current = element
  while (current && current !== document.body) {
    if (current.scrollLeft !== 0) current.scrollLeft = 0
    current = current.parentElement
  }
}

export function useStructuredWhiteboardViewController({
  documentUri,
  layout = EMPTY_WHITEBOARD_LAYOUT,
  projection,
  selectedSubjects = EMPTY_WHITEBOARD_SUBJECTS,
  visualRelations = [],
  onNodePositionChange,
  onVisualRelationsChange,
  onOpenSubject,
}: {
  documentUri: string
  layout?: Record<string, StructuredWhiteboardPosition>
  projection: StructuredTableProjection
  selectedSubjects?: string[]
  visualRelations?: StructuredWhiteboardVisualRelation[]
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
  onOpenSubject?: (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [draggingSubject, setDraggingSubject] = useState<string | null>(null)
  const suppressNextNodeOpenRef = useRef<string | null>(null)

  const {
    availableRows,
    canClearSubjects,
    canCreateVisualRelation,
    cardCountLabel,
    chrome,
    hasAvailableSubjectOptions,
    isCanvasEmpty,
    nodes,
    relationCountLabel,
    relations,
    relationSegments,
    relationSubjectOptions,
    showRelationCount,
  } = useMemo(
    () => projectStructuredWhiteboardViewModel({
      layout,
      projection,
      selectedSubjects,
      visualRelations,
    }),
    [layout, projection, selectedSubjects, visualRelations],
  )

  useLayoutEffect(() => {
    resetAncestorHorizontalScroll(frameRef.current)
  }, [documentUri, nodes.length, selectedSubjects.length, visualRelations.length])

  const relation = useStructuredWhiteboardRelationController({
    relationSubjectOptions,
    visualRelations,
    onVisualRelationsChange,
  })

  const openNode = useCallback((subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => {
    onOpenSubject?.(subject, options)
  }, [onOpenSubject])

  const handleNodeClick = useCallback((subject: string) => {
    if (suppressNextNodeOpenRef.current === subject) {
      suppressNextNodeOpenRef.current = null
      return
    }
    openNode(subject)
  }, [openNode])

  const handleNodeDoubleClick = useCallback((event: { preventDefault: () => void }, subject: string) => {
    event.preventDefault()
    openNode(subject, { navigate: true })
  }, [openNode])

  const handleNodeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, subject: string) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      openNode(subject, { navigate: true })
      return
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      openNode(subject)
    }
  }, [openNode])

  const startNodeDrag = useCallback((event: PointerEvent<HTMLDivElement>, subject: string) => {
    const node = nodes.find((candidate) => candidate.subject === subject)
    if (!node) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startPointer = { x: event.clientX, y: event.clientY }
    const startPosition = { x: node.x, y: node.y }
    let moved = false
    setDraggingSubject(subject)

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const deltaX = moveEvent.clientX - startPointer.x
      const deltaY = moveEvent.clientY - startPointer.y
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) moved = true
      onNodePositionChange?.(subject, projectStructuredWhiteboardClampedPosition({
        frameSize: readWhiteboardFrameSize(frameRef.current),
        position: {
          x: startPosition.x + deltaX,
          y: startPosition.y + deltaY,
        },
      }))
    }

    const onUp = () => {
      if (moved) suppressNextNodeOpenRef.current = subject
      setDraggingSubject(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [nodes, onNodePositionChange])

  return {
    ...relation,
    availableRows,
    canClearSubjects,
    canCreateVisualRelation,
    cardCountLabel,
    chrome,
    frameRef,
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeKeyDown,
    hasAvailableSubjectOptions,
    isCanvasEmpty,
    isNodeDragging: (subject: string) => draggingSubject === subject,
    layoutKey: documentUri,
    nodes,
    relationCountLabel,
    relations,
    relationSegments,
    relationSubjectOptions,
    showRelationCount,
    startNodeDrag,
  }
}
