import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const cellProposalControllerPath = 'src/modules/files/features/structured/useStructuredCellWriteProposalController.ts'
const cellProposalModelPath = 'src/modules/files/features/structured/structured-cell-write-proposal-model.ts'

describe('Structured cell write proposal controller architecture boundary', () => {
  it('keeps optimistic cell proposal state out of the projection table renderer', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(cellProposalControllerPath)).toBe(true)
    expect(existsSync(cellProposalModelPath)).toBe(true)
    if (!existsSync(cellProposalControllerPath) || !existsSync(cellProposalModelPath)) return

    const controllerSource = readFileSync(cellProposalControllerPath, 'utf8')
    const modelSource = readFileSync(cellProposalModelPath, 'utf8')

    expect(projectionTableSource).toContain("from './useStructuredCellWriteProposalController'")
    expect(projectionTableSource).not.toContain('cellValueOverrides')
    expect(projectionTableSource).not.toContain('setCellValueOverrides')
    expect(projectionTableSource).not.toContain('setCellWriteProposals')
    expect(projectionTableSource).not.toContain('CellWriteProposalState')
    expect(projectionTableSource).not.toContain('CellWriteProposalDraft')

    expect(controllerSource).toContain('export function useStructuredCellWriteProposalController')
    expect(controllerSource).toContain('cellValueOverrides')
    expect(controllerSource).toContain('stageCellWriteProposal')
    expect(controllerSource).toContain('discardCellDraft')
    expect(controllerSource).toContain('persistedCellWriteProposalByKey')
    expect(controllerSource).toContain("from './structured-cell-write-proposal-model'")
    expect(controllerSource).toContain('createStructuredCellWriteProposalWorkflowState')
    expect(controllerSource).toContain('projectStructuredCellWriteProposalWorkflowReset')
    expect(controllerSource).toContain('projectStructuredCellWriteProposalWorkflowStaged')
    expect(controllerSource).toContain('projectStructuredCellWriteProposalWorkflowDiscarded')
    expect(controllerSource).toContain('projectStructuredCellWriteProposalWorkflowApprovalStaged')
    expect(controllerSource).toContain('projectStructuredPendingWriteSubjectList')
    expect(controllerSource).toMatch(/\n\s*const \[cellWriteProposalWorkflowState, setCellWriteProposalWorkflowState\]/)
    expect(controllerSource).not.toMatch(/\n\s*const \[cellValueOverrides, setCellValueOverrides\]/)
    expect(controllerSource).not.toMatch(/\n\s*const \[cellWriteProposals, setCellWriteProposals\]/)
    expect(controllerSource).not.toContain('new Map<string, StructuredCellWriteProposal>()')
    expect(controllerSource).not.toContain('proposalDraft?.status')
    expect(controllerSource).not.toContain('[key]: proposal.nextValues')
    expect(controllerSource).not.toContain("[key]: { proposal, status: 'pending' }")
    expect(controllerSource).not.toContain('delete next[key]')
    expect(controllerSource).not.toContain("status: 'approval-staged'")
    expect(controllerSource).not.toContain('Array.from(pendingWriteSubjects).sort')
    expect(controllerSource).not.toContain('useReactTable')
    expect(controllerSource).not.toContain('CompactTableShell')

    expect(modelSource).toContain('export type StructuredCellWriteProposalWorkflowState')
    expect(modelSource).toContain('export function createStructuredCellWriteProposalWorkflowState')
    expect(modelSource).toContain('export function projectStructuredCellWriteProposalWorkflowReset')
    expect(modelSource).toContain('export function projectStructuredCellWriteProposalWorkflowStaged')
    expect(modelSource).toContain('export function projectStructuredCellWriteProposalWorkflowDiscarded')
    expect(modelSource).toContain('export function projectStructuredCellWriteProposalWorkflowApprovalStaged')
    expect(modelSource).toContain('export function buildStructuredPersistedCellWriteProposalByKey')
    expect(modelSource).toContain('export function resolveStructuredCellWriteValues')
    expect(modelSource).toContain('export function projectStructuredCellWriteState')
    expect(modelSource).toContain('export function projectStructuredStagedCellValueOverrides')
    expect(modelSource).toContain('export function projectStructuredStagedCellWriteProposals')
    expect(modelSource).toContain('export function projectStructuredDiscardedCellValueOverrides')
    expect(modelSource).toContain('export function projectStructuredDiscardedCellWriteProposals')
    expect(modelSource).toContain('export function projectStructuredApprovalStagedCellWriteProposals')
    expect(modelSource).toContain('export function projectStructuredPendingWriteSubjectList')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useEffect')
  })
})
