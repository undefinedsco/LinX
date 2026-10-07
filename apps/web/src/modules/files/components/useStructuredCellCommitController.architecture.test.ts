import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const kanbanPath = 'src/modules/files/features/structured/StructuredKanbanView.tsx'
const kanbanViewControllerPath = 'src/modules/files/features/structured/useStructuredKanbanViewController.ts'
const kanbanMoveControllerPath = 'src/modules/files/features/structured/useStructuredKanbanMoveController.ts'
const commitControllerPath = 'src/modules/files/features/structured/useStructuredCellCommitController.ts'

describe('Structured cell commit controller architecture boundary', () => {
  it('keeps cell proposal construction and previous-value lookup out of the projection table renderer', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(commitControllerPath)).toBe(true)
    if (!existsSync(commitControllerPath)) return

    const controllerSource = readFileSync(commitControllerPath, 'utf8')

    expect(projectionTableSource).toContain("from './useStructuredCellCommitController'")
    expect(projectionTableSource).not.toContain('createStructuredCellWriteProposal')
    expect(projectionTableSource).not.toContain('previousValues = projection.rows.find')
    expect(projectionTableSource).not.toContain('vocabTermProposalResourceUriForPredicate(')

    expect(controllerSource).toContain('export function useStructuredCellCommitController')
    expect(controllerSource).toContain('createStructuredCellWriteProposal')
    expect(controllerSource).toContain('previousValuesForCell')
    expect(controllerSource).toContain('getStructuredProjectionCellOriginalValues')
    expect(controllerSource).toContain('vocabTermProposalResourceUriForPredicate')
    expect(controllerSource).not.toContain('projectionRows\n      .find')
    expect(controllerSource).not.toContain('?.cells.find((cell) => cell.predicate === predicate)')
    expect(controllerSource).not.toContain('useReactTable')
    expect(controllerSource).not.toContain('CompactTableShell')
  })

  it('keeps Kanban cell move proposal construction on the shared commit controller', () => {
    const kanbanSource = readFileSync(kanbanPath, 'utf8')

    expect(existsSync(commitControllerPath)).toBe(true)
    expect(existsSync(kanbanViewControllerPath)).toBe(true)
    expect(existsSync(kanbanMoveControllerPath)).toBe(true)
    if (!existsSync(commitControllerPath) || !existsSync(kanbanViewControllerPath) || !existsSync(kanbanMoveControllerPath)) return

    const kanbanViewControllerSource = readFileSync(kanbanViewControllerPath, 'utf8')
    const kanbanMoveControllerSource = readFileSync(kanbanMoveControllerPath, 'utf8')

    expect(kanbanSource).toContain("from './useStructuredKanbanViewController'")
    expect(kanbanSource).not.toContain("from './useStructuredKanbanMoveController'")
    expect(kanbanSource).not.toContain("from './useStructuredCellCommitController'")
    expect(kanbanViewControllerSource).toContain("from './useStructuredKanbanMoveController'")
    expect(kanbanViewControllerSource).not.toContain("from './useStructuredCellCommitController'")
    expect(kanbanMoveControllerSource).toContain("from './useStructuredCellCommitController'")
    expect(kanbanSource).not.toContain('createStructuredCellWriteProposal')
    expect(kanbanSource).not.toContain('previousValues = projection.rows.find')
    expect(kanbanSource).not.toContain('noopStageCellWriteProposal')
    expect(kanbanSource).not.toContain('noVocabTermProposalResourceUri')
  })
})
