import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface StructuredCellPopoverPlacement {
  top: number
  left: number
  width: number
}

export function StructuredCellPopoverLayer({
  children,
  placement,
}: {
  children: ReactNode
  placement: StructuredCellPopoverPlacement | null
}) {
  if (typeof document === 'undefined' || !placement) return <>{children}</>

  return createPortal(
    <div
      data-structured-cell-popover="true"
      className="fixed z-50"
      style={{
        top: placement.top,
        left: placement.left,
        width: placement.width,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
