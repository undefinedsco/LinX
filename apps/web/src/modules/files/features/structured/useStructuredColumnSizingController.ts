import { useCallback, useEffect, useRef, useState } from 'react'
import type { ColumnSizingState } from '@tanstack/react-table'
import {
  projectStructuredColumnResizeSize,
  projectStructuredColumnSizingColumnSize,
  projectStructuredColumnSizingFromInput,
  projectStructuredColumnSizingUpdate,
  type StructuredColumnSizingUpdater,
} from './structured-column-sizing-model'

export type { StructuredColumnSizingUpdater } from './structured-column-sizing-model'

export function useStructuredColumnSizingController({
  columnSizing,
  documentUri,
  onColumnSizingChange,
}: {
  columnSizing?: ColumnSizingState
  documentUri: string
  onColumnSizingChange?: (updater: StructuredColumnSizingUpdater) => void
}) {
  const [localColumnSizing, setLocalColumnSizingState] = useState<ColumnSizingState>({})
  const localColumnSizingRef = useRef<ColumnSizingState>({})

  useEffect(() => {
    const nextSizing = projectStructuredColumnSizingFromInput(columnSizing)
    localColumnSizingRef.current = nextSizing
    setLocalColumnSizingState(nextSizing)
  }, [columnSizing, documentUri])

  const setLocalColumnSizing = useCallback((updater: StructuredColumnSizingUpdater) => {
    setLocalColumnSizingState((current) => {
      const nextSizing = projectStructuredColumnSizingUpdate({ current, updater })
      localColumnSizingRef.current = nextSizing
      return nextSizing
    })
  }, [])

  const updateColumnSizing = useCallback((updater: StructuredColumnSizingUpdater) => {
    const nextSizing = projectStructuredColumnSizingUpdate({
      current: localColumnSizingRef.current,
      updater,
    })
    localColumnSizingRef.current = nextSizing
    setLocalColumnSizingState(nextSizing)
    onColumnSizingChange?.(nextSizing)
  }, [onColumnSizingChange])

  const startColumnResize = useCallback((columnId: string, startSize: number, startClientX: number) => {
    const handleMove = (event: MouseEvent) => {
      const nextSize = projectStructuredColumnResizeSize({
        currentClientX: event.clientX,
        startClientX,
        startSize,
      })
      updateColumnSizing((current) => projectStructuredColumnSizingColumnSize({ columnId, current, nextSize }))
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [updateColumnSizing])

  const startTouchColumnResize = useCallback((columnId: string, startSize: number, startClientX: number) => {
    const handleMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      const nextSize = projectStructuredColumnResizeSize({
        currentClientX: touch.clientX,
        startClientX,
        startSize,
      })
      updateColumnSizing((current) => projectStructuredColumnSizingColumnSize({ columnId, current, nextSize }))
    }
    const handleEnd = () => {
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleEnd)
      document.removeEventListener('touchcancel', handleEnd)
    }
    document.addEventListener('touchmove', handleMove)
    document.addEventListener('touchend', handleEnd)
    document.addEventListener('touchcancel', handleEnd)
  }, [updateColumnSizing])

  return {
    localColumnSizing,
    setLocalColumnSizing,
    startColumnResize,
    startTouchColumnResize,
  }
}
