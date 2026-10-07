import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const columnSizingControllerPath = 'src/modules/files/features/structured/useStructuredColumnSizingController.ts'
const columnSizingModelPath = 'src/modules/files/features/structured/structured-column-sizing-model.ts'

describe('Structured column sizing controller architecture boundary', () => {
  it('keeps column sizing sync and drag listeners out of the projection table renderer', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(columnSizingControllerPath)).toBe(true)
    expect(existsSync(columnSizingModelPath)).toBe(true)
    if (!existsSync(columnSizingControllerPath) || !existsSync(columnSizingModelPath)) return

    const controllerSource = readFileSync(columnSizingControllerPath, 'utf8')
    const modelSource = readFileSync(columnSizingModelPath, 'utf8')

    expect(projectionTableSource).toContain("from './useStructuredColumnSizingController'")
    expect(projectionTableSource).not.toContain('localColumnSizingRef')
    expect(projectionTableSource).not.toContain('updateColumnSizing')
    expect(projectionTableSource).not.toContain('const startColumnResize')
    expect(projectionTableSource).not.toContain('const startTouchColumnResize')
    expect(projectionTableSource).not.toContain("document.addEventListener('mousemove'")
    expect(projectionTableSource).not.toContain("document.addEventListener('touchmove'")

    expect(controllerSource).toContain('export function useStructuredColumnSizingController')
    expect(controllerSource).toContain('localColumnSizingRef')
    expect(controllerSource).toContain('startColumnResize')
    expect(controllerSource).toContain('startTouchColumnResize')
    expect(controllerSource).toContain("from './structured-column-sizing-model'")
    expect(controllerSource).toContain('projectStructuredColumnSizingFromInput')
    expect(controllerSource).toContain('projectStructuredColumnSizingUpdate')
    expect(controllerSource).toContain('projectStructuredColumnResizeSize')
    expect(controllerSource).toContain('projectStructuredColumnSizingColumnSize')
    expect(controllerSource).toContain("document.addEventListener('mousemove'")
    expect(controllerSource).toContain("document.addEventListener('touchmove'")
    expect(controllerSource).not.toContain("typeof updater === 'function'")
    expect(controllerSource).not.toContain('Math.max(48')
    expect(controllerSource).not.toContain('[columnId]: nextSize')
    expect(controllerSource).not.toContain('useReactTable')
    expect(controllerSource).not.toContain('CompactTableShell')

    expect(modelSource).toContain('export const MIN_STRUCTURED_COLUMN_WIDTH')
    expect(modelSource).toContain('export function projectStructuredColumnSizingFromInput')
    expect(modelSource).toContain('export function projectStructuredColumnSizingUpdate')
    expect(modelSource).toContain('export function projectStructuredColumnResizeSize')
    expect(modelSource).toContain('export function projectStructuredColumnSizingColumnSize')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useEffect')
  })
})
