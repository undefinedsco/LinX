import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const cellEditWorkflowControllerPath = 'src/modules/files/features/structured/useStructuredCellEditWorkflowController.ts'
const popoverControllerPath = 'src/modules/files/features/structured/useStructuredCellPopoverController.tsx'
const activeCellPath = 'src/modules/files/features/structured/StructuredPredicateActiveCell.tsx'
const popoverLayerPath = 'src/modules/files/features/structured/StructuredCellPopoverLayer.tsx'

describe('Structured cell popover controller architecture boundary', () => {
  it('keeps placement state in the controller and portal rendering in a named layer component', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(cellEditWorkflowControllerPath)).toBe(true)
    expect(existsSync(popoverControllerPath)).toBe(true)
    expect(existsSync(activeCellPath)).toBe(true)
    expect(existsSync(popoverLayerPath)).toBe(true)
    if (!existsSync(cellEditWorkflowControllerPath) || !existsSync(popoverControllerPath) || !existsSync(activeCellPath) || !existsSync(popoverLayerPath)) return

    const cellEditWorkflowControllerSource = readFileSync(cellEditWorkflowControllerPath, 'utf8')
    const controllerSource = readFileSync(popoverControllerPath, 'utf8')
    const activeCellSource = readFileSync(activeCellPath, 'utf8')
    const layerSource = readFileSync(popoverLayerPath, 'utf8')

    expect(projectionTableSource).toContain("from './useStructuredCellEditWorkflowController'")
    expect(projectionTableSource).not.toContain("from './useStructuredCellPopoverController'")
    expect(projectionTableSource).not.toContain("from 'react-dom'")
    expect(projectionTableSource).not.toContain('createPortal')
    expect(projectionTableSource).not.toContain('setActiveCellPopoverPlacement')
    expect(projectionTableSource).not.toContain('renderActiveCellPopover')

    expect(cellEditWorkflowControllerSource).toContain("from './useStructuredCellPopoverController'")
    expect(cellEditWorkflowControllerSource).toContain('activeCellPopoverPlacement')
    expect(cellEditWorkflowControllerSource).toContain('placeCellPopover')
    expect(cellEditWorkflowControllerSource).not.toContain("from 'react-dom'")
    expect(cellEditWorkflowControllerSource).not.toContain('createPortal')
    expect(cellEditWorkflowControllerSource).not.toContain('renderActiveCellPopover')
    expect(cellEditWorkflowControllerSource).not.toContain('useReactTable')
    expect(cellEditWorkflowControllerSource).not.toContain('CompactTableShell')

    expect(controllerSource).toContain('export function useStructuredCellPopoverController')
    expect(controllerSource).toContain('activeCellPopoverPlacement')
    expect(controllerSource).toContain('placeCellPopover')
    expect(controllerSource).toContain('STRUCTURED_CELL_POPOVER_WIDTH')
    expect(controllerSource).not.toContain("from 'react-dom'")
    expect(controllerSource).not.toContain('createPortal')
    expect(controllerSource).not.toContain('renderActiveCellPopover')
    expect(controllerSource).not.toContain('ReactNode')
    expect(controllerSource).not.toContain('data-structured-cell-popover')
    expect(controllerSource).not.toContain('useReactTable')
    expect(controllerSource).not.toContain('CompactTableShell')

    expect(activeCellSource).toContain("from './StructuredCellPopoverLayer'")
    expect(activeCellSource).toContain('popoverPlacement')
    expect(activeCellSource).not.toContain('renderActiveCellPopover')
    expect(activeCellSource).not.toContain("from 'react-dom'")
    expect(activeCellSource).not.toContain('createPortal')

    expect(layerSource).toContain('export function StructuredCellPopoverLayer')
    expect(layerSource).toContain("from 'react-dom'")
    expect(layerSource).toContain('createPortal')
    expect(layerSource).toContain('data-structured-cell-popover')
    expect(layerSource).not.toContain('useState')
    expect(layerSource).not.toContain('placeCellPopover')
  })
})
