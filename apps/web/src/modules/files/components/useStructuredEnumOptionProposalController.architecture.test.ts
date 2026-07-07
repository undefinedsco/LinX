import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const enumCellWorkflowControllerPath = 'src/modules/files/features/structured/useStructuredEnumCellWorkflowController.ts'
const enumOptionControllerPath = 'src/modules/files/features/structured/useStructuredEnumOptionProposalController.ts'

describe('Structured enum option proposal controller architecture boundary', () => {
  it('keeps enum option vocab proposal creation out of the projection table renderer', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(enumCellWorkflowControllerPath)).toBe(true)
    expect(existsSync(enumOptionControllerPath)).toBe(true)
    if (!existsSync(enumCellWorkflowControllerPath) || !existsSync(enumOptionControllerPath)) return

    const enumCellWorkflowControllerSource = readFileSync(enumCellWorkflowControllerPath, 'utf8')
    const controllerSource = readFileSync(enumOptionControllerPath, 'utf8')

    expect(projectionTableSource).toContain("from './useStructuredEnumCellWorkflowController'")
    expect(projectionTableSource).not.toContain("from './useStructuredEnumOptionProposalController'")
    expect(projectionTableSource).not.toContain('createVocabTermProposal')
    expect(projectionTableSource).not.toContain("termKind: 'enum-option'")
    expect(projectionTableSource).not.toContain('Enum option for')

    expect(enumCellWorkflowControllerSource).toContain('export function useStructuredEnumCellWorkflowController')
    expect(enumCellWorkflowControllerSource).toContain('useStructuredEnumOptionProposalController')
    expect(enumCellWorkflowControllerSource).not.toContain('useReactTable')
    expect(enumCellWorkflowControllerSource).not.toContain('CompactTableShell')
    expect(controllerSource).toContain('export function useStructuredEnumOptionProposalController')
    expect(controllerSource).toContain('createVocabTermProposal')
    expect(controllerSource).toContain("termKind: 'enum-option'")
    expect(controllerSource).toContain('Enum option for')
    expect(controllerSource).not.toContain('useReactTable')
    expect(controllerSource).not.toContain('CompactTableShell')
  })
})
