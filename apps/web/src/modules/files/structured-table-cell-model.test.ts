import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StructuredCellChangeProposal } from './structured-cell-approval'

const cellModelPath = 'src/modules/files/domain/structured/structured-table-cell-model.ts'
const cellProposalWorkflowControllerPath = 'src/modules/files/features/structured/useStructuredCellProposalWorkflowController.ts'
const cellProposalWorkflowModelPath = 'src/modules/files/features/structured/structured-cell-proposal-workflow-model.ts'

describe('structured table cell model helpers', () => {
  it('keeps pure cell projection and pending-option helpers out of the React table container', async () => {
    expect(existsSync(cellModelPath)).toBe(true)
    expect(existsSync(cellProposalWorkflowControllerPath)).toBe(true)
    expect(existsSync(cellProposalWorkflowModelPath)).toBe(true)
    if (!existsSync(cellModelPath) || !existsSync(cellProposalWorkflowModelPath)) return

    const model = await import('./domain/structured/structured-table-cell-model')
    const workflowControllerSource = readFileSync(cellProposalWorkflowControllerPath, 'utf8')
    const workflowModelSource = readFileSync(cellProposalWorkflowModelPath, 'utf8')
    const modelSource = readFileSync(cellModelPath, 'utf8')

    expect(model.documentCellKey('doc', '#subject', 'udfs:title')).toBe('doc\u0000#subject\u0000udfs:title')
    expect(model.displayStructuredCellValue('"2026-06-28"^^xsd:date')).toBe('2026-06-28')
    expect(model.inferStructuredPredicateKind(['"2026-06-28"^^xsd:date'])).toBe('date')
    expect(model.sameStructuredCellValues(['"A"'], ['"A"'])).toBe(true)
    expect(model.pendingEnumOptionLabelsForPredicate([
      {
        id: 'proposal-1',
        kind: 'vocab-term-proposal',
        status: 'pending',
        operation: 'create',
        documentUri: 'https://pod.example/.data/table.ttl',
        proposalResourceUri: 'https://pod.example/.data/proposals/vocab/ready.ttl',
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
        classScope: 'udfs:Task',
        termUri: 'https://pod.example/.vocab/terms.ttl#ready',
        termKind: 'enum-option',
        label: 'Ready',
        valueType: 'enum-option',
        description: '',
        shape: 'predicate udfs:status',
        predicate: 'udfs:status',
        createdAt: '2026-06-28T00:00:00.000Z',
        writesCanonicalVocab: false,
      },
    ], 'udfs:status')).toEqual(['Ready'])

    const proposal: StructuredCellChangeProposal = {
      id: 'cell-1',
      kind: 'structured-cell-change-proposal',
      status: 'pending',
      operation: 'replace-values',
      proposalResourceUri: 'https://pod.example/.data/proposals/cell/cell-1.ttl',
      documentUri: 'https://pod.example/.data/table.ttl',
      subject: '#Task',
      predicate: 'udfs:status',
      previousValues: ['"Todo"'],
      nextValues: ['"Ready"'],
      reason: 'test',
      createdAt: '2026-06-28T00:00:00.000Z',
      writesCanonicalResource: false,
    }
    expect(model.structuredCellChangeProposalToWriteProposal(proposal)).toMatchObject({
      id: 'cell-1',
      kind: 'cell-write',
      status: 'pending-write',
      writesCanonicalResource: true,
    })

    expect(workflowControllerSource).not.toContain("from '../../domain/structured/structured-table-cell-model'")
    expect(workflowModelSource).toContain("from '../../domain/structured/structured-table-cell-model'")
    expect(workflowModelSource).toContain('documentCellKey')
    expect(workflowModelSource).toContain('structuredCellChangeProposalToWriteProposal')
    expect(workflowControllerSource).not.toMatch(/\nfunction documentCellKey\(/)
    expect(workflowControllerSource).not.toMatch(/\nfunction parseTypedLiteral\(/)
    expect(workflowControllerSource).not.toMatch(/\nfunction findPendingEnumOptionProposal\(/)
    expect(modelSource).not.toContain('useFilesStore')
    expect(modelSource).not.toContain('@tanstack/react-table')
  })
})
