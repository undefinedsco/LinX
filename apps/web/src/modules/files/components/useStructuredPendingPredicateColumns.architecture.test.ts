import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const pendingPredicateHookPath = 'src/modules/files/features/structured/useStructuredPendingPredicateColumns.ts'
const pendingPredicateModelPath = 'src/modules/files/features/structured/structured-pending-predicate-columns-model.ts'

describe('Structured pending predicate column controller architecture boundary', () => {
  it('keeps vocab draft and pending predicate proposal control out of the projection table', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(pendingPredicateHookPath)).toBe(true)
    expect(existsSync(pendingPredicateModelPath)).toBe(true)
    if (!existsSync(pendingPredicateHookPath) || !existsSync(pendingPredicateModelPath)) return

    const pendingPredicateHookSource = readFileSync(pendingPredicateHookPath, 'utf8')
    const pendingPredicateModelSource = readFileSync(pendingPredicateModelPath, 'utf8')

    expect(projectionTableSource).toContain("from './useStructuredPendingPredicateColumns'")
    expect(projectionTableSource).not.toContain("from '../structured-predicate-draft'")
    expect(projectionTableSource).not.toContain("from '../../domain/structured/structured-predicate-draft'")
    expect(projectionTableSource).not.toContain('pendingPredicateProposalFromVocabTermProposal')
    expect(projectionTableSource).not.toContain('predicateColumnIdForProposal')
    expect(projectionTableSource).not.toContain('stagePendingPredicateApproval')
    expect(projectionTableSource).not.toContain('setPendingPredicateProposals')
    expect(projectionTableSource).not.toContain('dismissedHydratedPredicateProposalIds')
    expect(projectionTableSource).not.toContain('visiblePendingPredicateProposals.map((proposal) => proposal.id)')

    expect(pendingPredicateHookSource).toContain('export function useStructuredPendingPredicateColumns')
    expect(pendingPredicateHookSource).toContain("from './structured-pending-predicate-columns-model'")
    expect(pendingPredicateHookSource).toContain('projectStructuredVisiblePendingPredicateProposals')
    expect(pendingPredicateHookSource).toContain('pendingPredicateIds')
    expect(pendingPredicateHookSource).not.toContain("from '../../domain/structured/structured-predicate-draft'")
    expect(pendingPredicateHookSource).not.toContain('createVocabTermProposal')
    expect(pendingPredicateHookSource).not.toContain('pendingPredicateProposalFromVocabTermProposal')
    expect(pendingPredicateHookSource).not.toContain('predicateUriFromDraft')
    expect(pendingPredicateHookSource).not.toContain('predicateShapeFromDraft')
    expect(pendingPredicateHookSource).not.toContain('localPredicateLabel')
    expect(pendingPredicateHookSource).not.toContain('useReactTable')
    expect(pendingPredicateHookSource).not.toContain('CompactTableShell')

    expect(pendingPredicateModelSource).toContain('export function projectStructuredVisiblePendingPredicateProposals')
    expect(pendingPredicateModelSource).toContain('export function createStructuredPendingPredicateColumnProposalFromDraft')
    expect(pendingPredicateModelSource).toContain('export function createStructuredPendingPredicateApprovalProposal')
    expect(pendingPredicateModelSource).toContain('createVocabTermProposal')
    expect(pendingPredicateModelSource).toContain("from '../../domain/structured/structured-predicate-draft'")
    expect(pendingPredicateModelSource).not.toContain('useState')
    expect(pendingPredicateModelSource).not.toContain('useEffect')
  })
})
