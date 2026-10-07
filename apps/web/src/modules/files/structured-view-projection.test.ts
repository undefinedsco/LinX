import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  filterShapeWarningsForProjection,
  projectStructuredPredicateNamespaceFilter,
  projectStructuredPredicateTypeFilter,
  projectStructuredRowsFromSubjects,
  projectStructuredVocabTermFilter,
  projectStructuredWarningRows,
  structuredPredicateNamespace,
  type StructuredPredicateTypeFilter,
  type StructuredVocabTermFilter,
} from './domain/structured/structured-view-projection'
import type {
  StructuredShapeValidationWarning,
  StructuredTableProjection,
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
} from './structured-table'

const previewPath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'
const toolbarPath = 'src/modules/files/features/structured/StructuredResourceToolbar.tsx'
const projectionFilterControllerPath = 'src/modules/files/features/structured/useStructuredProjectionFilterController.ts'
const projectionFilterModelPath = 'src/modules/files/features/structured/structured-projection-filter-model.ts'
const projectionReviewControllerPath = 'src/modules/files/features/structured/useStructuredProjectionReviewController.ts'
const viewProjectionPath = 'src/modules/files/domain/structured/structured-view-projection.ts'

const projection: StructuredTableProjection = {
  prefixes: { schema: 'https://schema.org/', linx: 'https://undefineds.co/vocab/' },
  predicates: [
    'schema:name',
    'https://schema.org/author',
    'linx:done',
    'linx:rating',
    'linx:status',
    'observedOnly',
  ],
  rows: [
    {
      subject: '#one',
      cells: [
        { predicate: 'schema:name', values: ['"Alpha"'] },
        { predicate: 'https://schema.org/author', values: ['https://pod.example/alice'] },
        { predicate: 'linx:done', values: ['true'] },
        { predicate: 'linx:rating', values: ['5'] },
        { predicate: 'linx:status', values: ['todo'] },
        { predicate: 'observedOnly', values: ['"free text"'] },
      ],
    },
    {
      subject: '#two',
      cells: [
        { predicate: 'schema:name', values: ['"Beta"'] },
        { predicate: 'linx:done', values: ['false'] },
      ],
    },
  ],
  warnings: [],
}

function predicateDefinition(
  uri: string,
  label: string,
  valueType: string,
  extra: Partial<StructuredVocabPredicateDefinition> = {},
): StructuredVocabPredicateDefinition {
  return {
    uri,
    label,
    description: '',
    status: 'defined',
    valueType,
    shape: '',
    shapeRules: [],
    ...extra,
  }
}

const vocabDefinitionIndex: StructuredVocabDefinitionIndex = {
  classes: new Map(),
  predicates: new Map([
    ['schema:name', predicateDefinition('schema:name', 'name', 'text')],
    ['https://schema.org/author', predicateDefinition('https://schema.org/author', 'author', 'relation')],
    ['linx:done', predicateDefinition('linx:done', 'done', 'boolean')],
    ['linx:rating', predicateDefinition('linx:rating', 'rating', 'number')],
    ['linx:status', predicateDefinition('linx:status', 'status', 'enum')],
  ]),
  enumOptionsByPredicate: new Map(),
  shapesByTerm: new Map(),
  namespaces: new Map([
    ['schema', 'https://schema.org/'],
    ['linx', 'https://undefineds.co/vocab/'],
  ]),
}

describe('structured view projection helpers', () => {
  it('keeps predicate view filters in a pure non-React module', () => {
    expect(existsSync(viewProjectionPath)).toBe(true)
    expect(existsSync(projectionFilterControllerPath)).toBe(true)
    expect(existsSync(projectionFilterModelPath)).toBe(true)
    expect(existsSync(projectionReviewControllerPath)).toBe(true)
    if (!existsSync(viewProjectionPath) || !existsSync(projectionFilterControllerPath) || !existsSync(projectionFilterModelPath) || !existsSync(projectionReviewControllerPath)) return

    const previewSource = readFileSync(previewPath, 'utf8')
    const toolbarSource = readFileSync(toolbarPath, 'utf8')
    const projectionFilterControllerSource = readFileSync(projectionFilterControllerPath, 'utf8')
    const projectionFilterModelSource = readFileSync(projectionFilterModelPath, 'utf8')
    const projectionReviewControllerSource = readFileSync(projectionReviewControllerPath, 'utf8')
    const helperSource = readFileSync(viewProjectionPath, 'utf8')

    expect(previewSource).toContain("from './useStructuredProjectionFilterController'")
    expect(previewSource).toContain("from './useStructuredProjectionReviewController'")
    expect(previewSource).not.toContain("from '../../domain/structured/structured-view-projection'")
    expect(previewSource).not.toMatch(/\nfunction projectStructuredPredicateNamespaceFilter/)
    expect(previewSource).not.toMatch(/\nfunction projectStructuredVocabTermFilter/)
    expect(previewSource).not.toMatch(/\nfunction projectStructuredPredicateTypeFilter/)
    expect(previewSource).not.toMatch(/\nfunction filterShapeWarningsForProjection/)

    expect(projectionFilterControllerSource).toContain("from './structured-projection-filter-model'")
    expect(projectionFilterControllerSource).toContain('createStructuredProjectionFilterState')
    expect(projectionFilterControllerSource).toContain('projectStructuredProjectionFilterNamespaceVisibility')
    expect(projectionFilterControllerSource).toContain('projectStructuredProjectionFilterStateDocumentReset')
    expect(projectionFilterControllerSource).toContain('projectStructuredProjectionFilterStatePatch')
    expect(projectionFilterControllerSource).not.toContain("from '../../domain/structured/structured-view-projection'")
    expect(projectionFilterControllerSource).not.toContain('projectStructuredVocabSchemaColumns')
    expect(projectionFilterControllerSource).not.toContain('projectStructuredPredicateNamespaceFilter')
    expect(projectionFilterControllerSource).not.toContain('projectStructuredVocabTermFilter')
    expect(projectionFilterControllerSource).not.toContain('projectStructuredPredicateTypeFilter')
    expect(projectionFilterControllerSource).not.toContain('structuredPredicateNamespace')
    expect(projectionFilterControllerSource).not.toContain("useState<StructuredPredicateTypeFilter>('all')")
    expect(projectionFilterControllerSource).not.toContain("useState<StructuredVocabTermFilter>('all')")
    expect(projectionFilterControllerSource).not.toContain('const [showNamespaces, setShowNamespaces]')
    expect(projectionFilterControllerSource).not.toContain('useState(false)')
    expect(projectionFilterControllerSource).not.toContain('setPredicateTypeFilter(\'all\')')
    expect(projectionFilterControllerSource).not.toContain('setPredicateNamespaceFilter(null)')
    expect(projectionFilterControllerSource).not.toContain('setVocabTermFilter(\'all\')')
    expect(projectionFilterControllerSource).not.toMatch(/\nfunction projectStructuredPredicateNamespaceFilter/)
    expect(projectionFilterControllerSource).not.toMatch(/\nfunction projectStructuredVocabTermFilter/)
    expect(projectionFilterControllerSource).not.toMatch(/\nfunction projectStructuredPredicateTypeFilter/)
    expect(projectionFilterModelSource).toContain('export function createStructuredProjectionFilterState')
    expect(projectionFilterModelSource).toContain('export function projectStructuredProjectionFilterNamespaceVisibility')
    expect(projectionFilterModelSource).toContain('export function projectStructuredProjectionFilterStateDocumentReset')
    expect(projectionFilterModelSource).toContain('export function projectStructuredProjectionFilterStatePatch')
    expect(projectionFilterModelSource).toContain('export function projectStructuredProjectionFilterStateReset')
    expect(projectionFilterModelSource).toContain('export function projectStructuredProjectionFilterStateForExistingPredicate')
    expect(projectionFilterModelSource).toContain('export function projectStructuredProjectionFilterModel')
    expect(projectionFilterModelSource).toContain('projectStructuredVocabSchemaColumns')
    expect(projectionFilterModelSource).toContain('projectStructuredPredicateNamespaceFilter')
    expect(projectionFilterModelSource).toContain('projectStructuredVocabTermFilter')
    expect(projectionFilterModelSource).toContain('projectStructuredPredicateTypeFilter')
    expect(projectionFilterModelSource).toContain('structuredPredicateNamespace')
    expect(projectionFilterModelSource).not.toContain('useState')
    expect(projectionFilterModelSource).not.toContain('useEffect')

    expect(projectionReviewControllerSource).toContain("from '../../domain/structured/structured-view-projection'")
    expect(projectionReviewControllerSource).not.toMatch(/\nfunction filterShapeWarningsForProjection/)
    expect(projectionReviewControllerSource).not.toMatch(/\nfunction projectStructuredWarningRows/)
    expect(projectionReviewControllerSource).not.toMatch(/\nfunction projectStructuredRowsFromSubjects/)

    expect(toolbarSource).toContain("from '../../domain/structured/structured-view-projection'")
    expect(toolbarSource).not.toMatch(/\nexport type StructuredPredicateTypeFilter =/)
    expect(toolbarSource).not.toMatch(/\nexport type StructuredVocabTermFilter =/)

    expect(helperSource).not.toContain('useFilesStore')
    expect(helperSource).not.toContain('useState')
    expect(helperSource).not.toContain('StructuredTablePreview')
  })

  it('filters predicates by namespace, vocab definition, and predicate type without dropping unrelated rows', () => {
    const schemaOnly = projectStructuredPredicateNamespaceFilter(projection, 'schema', vocabDefinitionIndex.namespaces)
    expect(schemaOnly.predicates).toEqual(['schema:name', 'https://schema.org/author'])
    expect(schemaOnly.rows.map((row) => row.subject)).toEqual(['#one', '#two'])
    expect(schemaOnly.rows[0]?.cells.map((cell) => cell.predicate)).toEqual(['schema:name', 'https://schema.org/author'])

    const definedOnly = projectStructuredVocabTermFilter(projection, 'defined', vocabDefinitionIndex)
    expect(definedOnly.predicates).not.toContain('observedOnly')
    expect(definedOnly.rows[0]?.cells.map((cell) => cell.predicate)).not.toContain('observedOnly')

    const observedOnly = projectStructuredVocabTermFilter(projection, 'observed', vocabDefinitionIndex)
    expect(observedOnly.predicates).toEqual(['observedOnly'])
    expect(observedOnly.rows[0]?.cells).toEqual([{ predicate: 'observedOnly', values: ['"free text"'] }])

    const booleanOnly = projectStructuredPredicateTypeFilter(projection, 'boolean', vocabDefinitionIndex)
    expect(booleanOnly.predicates).toEqual(['linx:done'])
    expect(booleanOnly.rows[0]?.cells).toEqual([{ predicate: 'linx:done', values: ['true'] }])

    const relationOnly = projectStructuredPredicateTypeFilter(projection, 'relation', vocabDefinitionIndex)
    expect(relationOnly.predicates).toEqual(['https://schema.org/author'])
  })

  it('projects warning and subject scopes without leaking hidden predicates', () => {
    const warnings: StructuredShapeValidationWarning[] = [
      { subject: '#one', predicate: 'linx:status', message: 'status is required' },
      { subject: '#one', predicate: 'linx:rating', message: 'rating is hidden' },
      { subject: '#missing', predicate: 'linx:status', message: 'missing row' },
    ]
    const warningRows = projectStructuredWarningRows(projection, warnings)
    expect(warningRows.rows.map((row) => row.subject)).toEqual(['#one'])

    const subjectScoped = projectStructuredRowsFromSubjects(projection, {
      ...projection,
      rows: [{ subject: '#two', cells: [] }],
    })
    expect(subjectScoped.rows.map((row) => row.subject)).toEqual(['#two'])

    expect(filterShapeWarningsForProjection(warnings, projection, new Set(['linx:rating']))).toEqual([
      { subject: '#one', predicate: 'linx:status', message: 'status is required' },
    ])
  })

  it('exports filter types from the projection boundary', () => {
    const typeFilter: StructuredPredicateTypeFilter = 'enum'
    const vocabFilter: StructuredVocabTermFilter = 'defined'

    expect(typeFilter).toBe('enum')
    expect(vocabFilter).toBe('defined')
    expect(structuredPredicateNamespace('https://schema.org/dateCreated', vocabDefinitionIndex.namespaces)).toBe('schema')
  })
})
