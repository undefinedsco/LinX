import { describe, expect, it } from 'vitest'

import type {
  StructuredTableProjection,
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
  StructuredVocabTermDefinition,
} from '../../domain/structured/structured-table'
import {
  createStructuredProjectionFilterState,
  projectStructuredExistingPredicateSelection,
  projectStructuredProjectionFilterNamespaceVisibility,
  projectStructuredProjectionFilterStateDocumentReset,
  projectStructuredProjectionFilterStateForExistingPredicate,
  projectStructuredProjectionFilterStatePatch,
  projectStructuredProjectionFilterStateReset,
  projectStructuredProjectionFilterModel,
} from './structured-projection-filter-model'

const taskClass: StructuredVocabTermDefinition = {
  uri: 'schema:Task',
  label: 'Task',
  description: 'Task class',
  status: 'active',
}

function predicateDefinition(
  uri: string,
  label: string,
  valueType: string,
): StructuredVocabPredicateDefinition {
  return {
    uri,
    label,
    description: '',
    status: 'defined',
    valueType,
    shape: '',
    shapeRules: [],
  }
}

const projection: StructuredTableProjection = {
  prefixes: { schema: 'https://schema.org/', linx: 'https://undefineds.co/vocab/' },
  predicates: ['rdf:type', 'schema:name', 'linx:done', 'observedOnly'],
  rows: [
    {
      subject: '#one',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Task'] },
        { predicate: 'schema:name', values: ['Alpha'] },
        { predicate: 'linx:done', values: ['true'] },
        { predicate: 'observedOnly', values: ['draft'] },
      ],
    },
    {
      subject: '#two',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Note'] },
        { predicate: 'schema:name', values: ['Note'] },
      ],
    },
    {
      subject: '#three',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Task'] },
        { predicate: 'schema:name', values: ['Beta'] },
        { predicate: 'linx:done', values: ['false'] },
      ],
    },
  ],
  warnings: [],
}

const vocabDefinitionIndex: StructuredVocabDefinitionIndex = {
  classes: new Map([
    ['schema:Task', taskClass],
    ['Task', taskClass],
  ]),
  enumOptionsByPredicate: new Map(),
  namespaces: new Map([
    ['schema', 'https://schema.org/'],
    ['linx', 'https://undefineds.co/vocab/'],
  ]),
  predicates: new Map([
    ['schema:name', predicateDefinition('schema:name', 'name', 'text')],
    ['linx:done', predicateDefinition('linx:done', 'done', 'boolean')],
  ]),
  shapesByTerm: new Map(),
}

describe('structured projection filter model', () => {
  it('projects class scope, schema controls, filter namespaces, sorted view rows, and filtered table projection', () => {
    const model = projectStructuredProjectionFilterModel({
      classScope: 'schema:Task',
      predicateNamespaceFilter: 'linx',
      predicateTypeFilter: 'boolean',
      projection,
      structuredSearchText: '',
      structuredSortDirection: 'desc',
      structuredSortKey: 'schema:name',
      vocabDefinitionIndex,
      vocabTermFilter: 'defined',
    })

    expect(model.scopedProjection.className).toBe('schema:Task')
    expect(model.scopedProjection.rows.map((row) => row.subject)).toEqual(['#one', '#three'])
    expect(model.schemaPredicateControls).toEqual(['schema:name', 'linx:done', 'observedOnly'])
    expect(model.classDefinition).toEqual(taskClass)
    expect(model.availablePredicateNamespaces).toEqual(['linx', 'local', 'schema'])
    expect(model.viewProjection.rows.map((row) => row.subject)).toEqual(['#three', '#one'])
    expect(model.unfilteredTableProjection.predicates).toEqual(['linx:done'])
    expect(model.unfilteredTableProjection.rows).toEqual([
      { subject: '#one', cells: [{ predicate: 'linx:done', values: ['true'] }] },
      { subject: '#three', cells: [{ predicate: 'linx:done', values: ['false'] }] },
    ])
  })

  it('projects select-existing-predicate side effects without owning React state', () => {
    expect(projectStructuredExistingPredicateSelection({
      hiddenPredicates: new Set(['schema:name']),
      predicate: 'schema:name',
    })).toEqual({
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'all',
      shouldRevealPredicate: true,
      vocabTermFilter: 'all',
    })
    expect(projectStructuredExistingPredicateSelection({
      hiddenPredicates: new Set(['schema:name']),
      predicate: 'schema:name',
    })).not.toHaveProperty('showNamespaces')

    expect(projectStructuredExistingPredicateSelection({
      hiddenPredicates: new Set(['schema:name']),
      predicate: 'linx:done',
    }).shouldRevealPredicate).toBe(false)
  })

  it('projects filter state defaults, patch reuse, reset, and existing-predicate selection', () => {
    const initialState = createStructuredProjectionFilterState()

    expect(initialState).toEqual({
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'all',
      showNamespaces: false,
      vocabTermFilter: 'all',
    })
    expect(projectStructuredProjectionFilterStatePatch({
      current: initialState,
      patch: { predicateTypeFilter: 'all' },
    })).toBe(initialState)

    const typeFilteredState = projectStructuredProjectionFilterStatePatch({
      current: initialState,
      patch: { predicateTypeFilter: 'relation' },
    })

    expect(typeFilteredState).toEqual({
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'relation',
      showNamespaces: false,
      vocabTermFilter: 'all',
    })
    expect(projectStructuredProjectionFilterStatePatch({
      current: typeFilteredState,
      patch: {
        predicateNamespaceFilter: 'schema',
        vocabTermFilter: 'defined',
      },
    })).toEqual({
      predicateNamespaceFilter: 'schema',
      predicateTypeFilter: 'relation',
      showNamespaces: false,
      vocabTermFilter: 'defined',
    })
    expect(projectStructuredProjectionFilterNamespaceVisibility({
      current: typeFilteredState,
      showNamespaces: true,
    })).toEqual({
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'relation',
      showNamespaces: true,
      vocabTermFilter: 'all',
    })
    expect(projectStructuredProjectionFilterStateReset()).toEqual(initialState)
    expect(projectStructuredProjectionFilterStateDocumentReset({
      ...typeFilteredState,
      showNamespaces: true,
      vocabTermFilter: 'defined',
    })).toEqual({
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'all',
      showNamespaces: true,
      vocabTermFilter: 'all',
    })
    expect(projectStructuredProjectionFilterStateForExistingPredicate({
      hiddenPredicates: new Set(['schema:name']),
      predicate: 'schema:name',
    })).toEqual({
      filterState: initialState,
      shouldRevealPredicate: true,
    })
  })
})
