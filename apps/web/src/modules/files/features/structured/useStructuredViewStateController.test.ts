import { describe, expect, it } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  projectStructuredReconciledKanbanBoard,
  projectStructuredWhiteboardVisualRelations,
  resolveStructuredEffectiveClassScope,
} from './structured-view-state-model'

const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['rdf:type', 'schema:name'],
  warnings: [],
  rows: [
    {
      subject: '#task',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Task'] },
        { predicate: 'schema:name', values: ['Task'] },
      ],
    },
    {
      subject: '#note',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Note'] },
        { predicate: 'schema:name', values: ['Note'] },
      ],
    },
  ],
}

describe('resolveStructuredEffectiveClassScope', () => {
  it('resolves requested class scope from the structured projection inside the view-state owner', () => {
    expect(resolveStructuredEffectiveClassScope(projection, 'schema:Note')).toBe('schema:Note')
    expect(resolveStructuredEffectiveClassScope(projection, 'schema:Missing')).toBe('schema:Note')
    expect(resolveStructuredEffectiveClassScope(projection, null)).toBe('schema:Note')
  })

  it('preserves a requested class when the projection has no observed class options', () => {
    expect(resolveStructuredEffectiveClassScope({
      prefixes: {},
      predicates: ['schema:name'],
      rows: [
        { subject: '#draft', cells: [{ predicate: 'schema:name', values: ['Draft'] }] },
      ],
      warnings: [],
    }, 'udfs:Draft')).toBe('udfs:Draft')
  })
})

describe('projectStructuredReconciledKanbanBoard', () => {
  it('reconciles stale saved order against live grouped subjects', () => {
    expect(projectStructuredReconciledKanbanBoard({
      projection: {
        predicates: ['status'],
        rows: [
          { subject: '#a', cells: [{ predicate: 'status', values: ['"Todo"'] }] },
          { subject: '#b', cells: [{ predicate: 'status', values: ['"Done"'] }] },
        ],
      },
      groupPredicate: 'status',
      kanbanOrder: {},
      saved: {
        version: 1,
        laneOrder: ['Missing', 'Done'],
        collapsedLaneIds: ['Missing', 'Done'],
        scrollLeft: 120,
        cardOrder: { Done: ['#gone', '#b'] },
      },
    })).toEqual({
      version: 1,
      laneOrder: ['Done', 'Todo'],
      collapsedLaneIds: ['Done'],
      scrollLeft: 120,
      cardOrder: { Done: ['#b'], Todo: ['#a'] },
    })
  })
})

describe('projectStructuredWhiteboardVisualRelations', () => {
  it('uses the versioned snapshot as the relation source of truth after migration', () => {
    expect(projectStructuredWhiteboardVisualRelations({
      version: 1,
      camera: { x: 0, y: 0, z: 1 },
      nodes: [],
      groups: [],
      visualRelations: [{ id: 'new', from: '#a', to: '#b', label: 'supports' }],
    }, [{ id: 'legacy', from: '#a', to: '#c', label: 'old' }])).toEqual([
      { id: 'new', from: '#a', to: '#b', label: 'supports' },
    ])
  })
})
