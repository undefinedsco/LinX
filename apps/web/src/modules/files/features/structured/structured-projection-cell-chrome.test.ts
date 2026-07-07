import { describe, expect, it } from 'vitest'

import type {
  StructuredCellWriteProposal,
  StructuredShapeValidationWarning,
} from '../../domain/structured/structured-table'
import { documentCellKey } from '../../domain/structured/structured-table-cell-model'
import type { StructuredPredicateColumnProposal } from './StructuredPredicateColumnHeader'
import {
  projectStructuredPredicateCellChrome,
  projectStructuredSubjectCellChrome,
  projectStructuredSubjectCellOpenAffordance,
} from './structured-projection-cell-chrome'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const predicate = 'https://undefineds.co/vocab/reviewStatus'
const subject = '#Task'

function cellWriteProposal(overrides: Partial<StructuredCellWriteProposal> = {}): StructuredCellWriteProposal {
  return {
    id: `${documentUri}|${subject}|${predicate}`,
    kind: 'cell-write',
    status: 'pending-write',
    documentUri,
    subject,
    predicate,
    previousValues: ['"Todo"'],
    nextValues: ['"Review"'],
    writesCanonicalResource: true,
    ...overrides,
  }
}

describe('projectStructuredPredicateCellChrome', () => {
  it('projects cell values, labels, shape warning, pending write, and active editor matches outside the columns renderer', () => {
    const warning: StructuredShapeValidationWarning = {
      id: 'warning-1',
      subject,
      predicate,
      severity: 'warning',
      message: 'Must be one of the defined statuses.',
      rule: 'shape:reviewStatus',
    }
    const proposal: StructuredPredicateColumnProposal = {
      id: 'predicate-proposal',
      label: 'Status*',
      uri: predicate,
      type: 'enum',
      description: '',
      shape: '',
      status: 'pending',
    }
    const activeTextCell = {
      subject,
      predicate,
      kind: 'text' as const,
      value: 'Review',
      commit: (next: string) => `"${next}"`,
    }
    const localProposal = cellWriteProposal()

    const chrome = projectStructuredPredicateCellChrome({
      activeEnumCell: { subject: '#Other', predicate },
      activeRelationCell: { subject, predicate: 'https://undefineds.co/vocab/owner', value: '#Alice' },
      activeTextCell,
      cellWriteState: {
        proposal: localProposal,
        status: 'pending',
        hasProposal: true,
      },
      documentUri,
      predicate,
      proposal,
      row: {
        subject,
        cells: {
          [predicate]: ['"Todo"'],
        },
      },
      shapeWarningByCell: new Map([
        [documentCellKey(documentUri, subject, predicate), [warning]],
      ]),
    })

    expect(chrome).toEqual({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell,
      hasActiveEditor: true,
      hasCellWriteProposal: true,
      pendingWrite: {
        discardable: true,
        predicateLabel: 'Status*',
        status: 'pending',
        subject,
      },
      predicateLabel: 'Status*',
      shapeWarning: {
        ariaLabel: 'Shape warning for Status* on #Task',
        message: 'Must be one of the defined statuses.',
        predicateLabel: 'Status*',
        subject,
        title: 'Must be one of the defined statuses.',
      },
      values: ['"Todo"'],
    })
  })

  it('projects persisted approval writes as non-discardable pending markers', () => {
    const chrome = projectStructuredPredicateCellChrome({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell: null,
      cellWriteState: {
        persistedProposal: cellWriteProposal(),
        status: 'approval-staged',
        hasProposal: true,
      },
      documentUri,
      predicate,
      row: {
        subject,
        cells: {},
      },
      shapeWarningByCell: new Map(),
    })

    expect(chrome.pendingWrite).toEqual({
      discardable: false,
      predicateLabel: 'reviewStatus',
      status: 'approval-staged',
      subject,
    })
    expect(chrome.hasActiveEditor).toBe(false)
    expect(chrome.values).toEqual([])
  })
})

describe('projectStructuredSubjectCellChrome', () => {
  it('projects subject, row index, pending state, and open target outside the columns renderer', () => {
    const chrome = projectStructuredSubjectCellChrome({
      documentUri,
      projection: {
        prefixes: {},
        predicates: ['title'],
        rows: [
          {
            subject,
            cells: [
              {
                predicate: 'title',
                values: ['"Task"'],
              },
            ],
          },
        ],
        warnings: [],
      },
      row: {
        subject,
        pending: true,
        cells: {
          title: ['"Task"'],
        },
      },
      rowIndex: 2,
    })

    expect(chrome).toEqual({
      subject,
      documentUri,
      displayLabel: subject,
      rowIndex: 2,
      pending: true,
      openAffordance: {
        ariaDescription: '单击打开预览；在预览中选择打开动作。',
        title: `${documentUri}\n单击打开预览；在预览中选择打开动作`,
      },
      openTarget: {
        targetUri: documentUri,
        kind: 'resource',
        canNavigateDirectly: false,
      },
      pendingMarker: {
        displayLabel: '#Task*',
        label: '待确认 subject',
      },
    })
  })

  it('projects same-document absolute subject display labels before reaching the primitive', () => {
    const chrome = projectStructuredSubjectCellChrome({
      documentUri: 'https://pod.example/.data/repositories/repository.ttl',
      projection: {
        prefixes: {},
        predicates: [],
        rows: [],
        warnings: [],
      },
      row: {
        subject: 'https://pod.example/.data/repositories/repository.ttl#Repository',
        cells: {},
      },
      rowIndex: 4,
    })

    expect(chrome.displayLabel).toBe('#Repository')
    expect(chrome.pendingMarker).toBeNull()
  })

  it('projects subject open affordance copy for direct and peek-first targets', () => {
    expect(projectStructuredSubjectCellOpenAffordance({
      canNavigateDirectly: true,
      kind: 'resource',
      targetUri: 'https://pod.example/cards/report.md',
    })).toEqual({
      ariaDescription: '单击打开预览；Enter 或双击打开资源。',
      title: 'https://pod.example/cards/report.md\n单击打开预览；Enter 或双击打开资源',
    })

    expect(projectStructuredSubjectCellOpenAffordance({
      canNavigateDirectly: false,
      kind: 'resource',
      targetUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
    })).toEqual({
      ariaDescription: '单击打开预览；在预览中选择打开动作。',
      title: 'https://pod.example/.data/workspaces/ws-1/state.ttl\n单击打开预览；在预览中选择打开动作',
    })

    expect(projectStructuredSubjectCellOpenAffordance(null)).toBeNull()
  })
})
