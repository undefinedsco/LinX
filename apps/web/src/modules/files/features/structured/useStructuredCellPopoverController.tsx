import { useCallback, useState } from 'react'

import type { StructuredCellPopoverPlacement } from './StructuredCellPopoverLayer'

const STRUCTURED_CELL_POPOVER_WIDTH = 240

export function useStructuredCellPopoverController() {
  const [activeCellPopoverPlacement, setActiveCellPopoverPlacement] = useState<StructuredCellPopoverPlacement | null>(null)

  const clearCellPopoverPlacement = useCallback(() => {
    setActiveCellPopoverPlacement(null)
  }, [])

  const placeCellPopover = useCallback((anchor?: HTMLElement | null) => {
    if (!anchor || typeof window === 'undefined') {
      setActiveCellPopoverPlacement(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || STRUCTURED_CELL_POPOVER_WIDTH
    const width = Math.max(STRUCTURED_CELL_POPOVER_WIDTH, Math.min(360, Math.round(rect.width)))
    setActiveCellPopoverPlacement({
      top: Math.max(8, Math.round(rect.bottom + 4)),
      left: Math.max(8, Math.min(Math.round(rect.left), viewportWidth - width - 8)),
      width,
    })
  }, [])

  return {
    activeCellPopoverPlacement,
    clearCellPopoverPlacement,
    placeCellPopover,
  }
}
