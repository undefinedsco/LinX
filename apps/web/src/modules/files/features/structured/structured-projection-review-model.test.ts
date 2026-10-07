import { describe, expect, it } from 'vitest'

import type {
  StructuredCellWriteProposal,
  StructuredTableProjection,
  StructuredVocabDefinitionIndex,
} from '../../domain/structured/structured-table'
import {
  createStructuredProjectionReviewState,
  projectStructuredProjectionReviewPendingWritesOnly,
  projectStructuredProjectionReviewReset,
  projectStructuredProjectionReviewWarningRowsOnly,
  projectStructuredProjectionReviewModel,
} from './structured-projection-review-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['schema:name', 'hidden'],
  rows: [
    {
      subject: '#TaskA',
      cells: [
        { predicate: 'schema:name', values: ['"Alpha"'] },
        { predicate: 'hidden', values: ['"secret"'] },
      ],
    },
    {
      subject: '#TaskB',
      cells: [
        { predicate: 'schema:name', values: ['"Beta"'] },
      ],
    },
  ],
  warnings: [],
}
const emptyVocabIndex: StructuredVocabDefinitionIndex = {
  classes: new Map(),
  enumOptionsByPredicate: new Map(),
  namespaces: new Map(),
  predicates: new Map(),
  shapesByTerm: new Map(),
}

function pendingCellWrite(overrides: Partial<StructuredCellWriteProposal> = {}): StructuredCellWriteProposal {
  return {
    id: `${documentUri}|#TaskA|schema:name`,
    kind: 'cell-write',
    status: 'pending-write',
    documentUri,
    subject: '#TaskA',
    predicate: 'schema:name',
    previousValues: ['"Alpha"'],
    nextValues: ['"Alpha draft"'],
    writesCanonicalResource: true,
    ...overrides,
  }
}

describe('projectStructuredProjectionReviewModel', () => {
  it('projects warning and pending review filters as a single controller state', () => {
    const initial = createStructuredProjectionReviewState()

    expect(initial).toEqual({
      pendingWritesOnly: false,
      warningRowsOnly: false,
    })
    expect(projectStructuredProjectionReviewWarningRowsOnly({
      current: initial,
      warningRowsOnly: true,
    })).toEqual({
      pendingWritesOnly: false,
      warningRowsOnly: true,
    })
    expect(projectStructuredProjectionReviewPendingWritesOnly({
      current: initial,
      pendingWritesOnly: true,
    })).toEqual({
      pendingWritesOnly: true,
      warningRowsOnly: false,
    })
    expect(projectStructuredProjectionReviewReset({
      pendingWritesOnly: true,
      warningRowsOnly: true,
    })).toEqual(initial)
  })

  it('projects effective view/raw text, table projection, and status outside the controller', () => {
    const model = projectStructuredProjectionReviewModel({
      allPendingWriteSubjects: new Set(['#TaskA']),
      classScope: null,
      documentUri,
      effectiveCellWriteProposals: [pendingCellWrite()],
      hiddenPredicates: new Set(['hidden']),
      pendingWritesOnly: true,
      predicateNamespaceFilter: 'schema',
      predicateTypeFilter: 'text',
      resourceUpdateFilteredProjection: projection,
      schemaProjection: projection,
      sourceUpdatesOnly: true,
      viewProjection: projection,
      vocabDefinitionIndex: emptyVocabIndex,
      vocabTermFilter: 'observed',
      warningRowsOnly: false,
    })

    expect(model.effectiveViewProjection).toEqual({
      ...projection,
      predicates: ['schema:name'],
      rows: [
        {
          subject: '#TaskA',
          cells: [
            { predicate: 'schema:name', values: ['"Alpha draft"'] },
          ],
        },
        {
          subject: '#TaskB',
          cells: [
            { predicate: 'schema:name', values: ['"Beta"'] },
          ],
        },
      ],
    })
    expect(model.effectiveRawText).toContain('#TaskA schema:name "Alpha draft" .')
    expect(model.tableProjection).toBe(projection)
    expect(model.shapeWarnings).toEqual([])
    expect(model.structuredStatus).toBe(
      '2 行 · 2 predicates · schema 命名空间 · 仅观察到 predicate · text · 仅待确认更改 · 仅 Ingest 更新 · 1 hidden predicate',
    )
  })

  it('projects warning-only rows as an empty table when there are no shape warnings', () => {
    const model = projectStructuredProjectionReviewModel({
      allPendingWriteSubjects: new Set(),
      classScope: null,
      documentUri,
      effectiveCellWriteProposals: [],
      hiddenPredicates: new Set(),
      pendingWritesOnly: false,
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'all',
      resourceUpdateFilteredProjection: projection,
      schemaProjection: projection,
      sourceUpdatesOnly: false,
      viewProjection: projection,
      vocabDefinitionIndex: emptyVocabIndex,
      vocabTermFilter: 'all',
      warningRowsOnly: true,
    })

    expect(model.tableProjection.rows).toEqual([])
    expect(model.structuredStatus).toBe('0 行 · 2 predicates · 仅校验提醒')
  })
})
