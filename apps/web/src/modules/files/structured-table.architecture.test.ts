import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const structuredTablePath = 'src/modules/files/domain/structured/structured-table.ts'
const structuredProjectionsPath = 'src/modules/files/domain/structured/structured-projections.ts'
const shapeValidationPath = 'src/modules/files/domain/structured/structured-shape-validation.ts'
const termKeysPath = 'src/modules/files/domain/structured/structured-term-keys.ts'
const structuredCellEditorPlanPath = 'src/modules/files/domain/structured/structured-cell-editor-plan.ts'
const structuredTableVocabPath = 'src/modules/files/domain/structured/structured-table-vocab.ts'
const structuredTableCellModelPath = 'src/modules/files/domain/structured/structured-table-cell-model.ts'
const structuredViewProjectionPath = 'src/modules/files/domain/structured/structured-view-projection.ts'
const structuredPredicateDraftPath = 'src/modules/files/domain/structured/structured-predicate-draft.ts'
const structuredSubjectPeekPath = 'src/modules/files/domain/structured/structured-subject-peek.ts'
const rootStructuredTableShimPath = 'src/modules/files/structured-table.ts'
const rootStructuredProjectionsShimPath = 'src/modules/files/structured-projections.ts'
const rootShapeValidationShimPath = 'src/modules/files/structured-shape-validation.ts'
const rootTermKeysShimPath = 'src/modules/files/structured-term-keys.ts'
const rootStructuredCellEditorPlanShimPath = 'src/modules/files/structured-cell-editor-plan.ts'
const rootStructuredTableVocabShimPath = 'src/modules/files/structured-table-vocab.ts'
const rootStructuredTableCellModelShimPath = 'src/modules/files/structured-table-cell-model.ts'
const rootStructuredViewProjectionShimPath = 'src/modules/files/structured-view-projection.ts'
const rootStructuredPredicateDraftShimPath = 'src/modules/files/structured-predicate-draft.ts'
const rootStructuredSubjectPeekShimPath = 'src/modules/files/structured-subject-peek.ts'

describe('Structured table architecture boundary', () => {
  it('keeps structured RDF projection models in domain/structured with root compatibility shims', () => {
    expect(existsSync(structuredTablePath)).toBe(true)
    expect(existsSync(structuredProjectionsPath)).toBe(true)
    expect(existsSync(shapeValidationPath)).toBe(true)
    expect(existsSync(termKeysPath)).toBe(true)
    expect(existsSync(rootStructuredTableShimPath)).toBe(true)
    expect(existsSync(rootStructuredProjectionsShimPath)).toBe(true)
    expect(existsSync(rootShapeValidationShimPath)).toBe(true)
    expect(existsSync(rootTermKeysShimPath)).toBe(true)
    if (
      !existsSync(structuredTablePath)
      || !existsSync(structuredProjectionsPath)
      || !existsSync(shapeValidationPath)
      || !existsSync(termKeysPath)
      || !existsSync(rootStructuredTableShimPath)
      || !existsSync(rootStructuredProjectionsShimPath)
      || !existsSync(rootShapeValidationShimPath)
      || !existsSync(rootTermKeysShimPath)
    ) return

    expect(readFileSync(rootStructuredTableShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-table'\n?$/)
    expect(readFileSync(rootStructuredProjectionsShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-projections'\n?$/)
    expect(readFileSync(rootShapeValidationShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-shape-validation'\n?$/)
    expect(readFileSync(rootTermKeysShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-term-keys'\n?$/)
  })

  it('keeps shape validation out of the projection and vocab registry module', () => {
    const structuredTableSource = readFileSync(structuredTablePath, 'utf8')

    expect(existsSync(shapeValidationPath)).toBe(true)
    if (!existsSync(shapeValidationPath)) return

    const shapeValidationSource = readFileSync(shapeValidationPath, 'utf8')

    expect(structuredTableSource).toContain("from './structured-shape-validation'")
    expect(structuredTableSource).toContain('validateStructuredTableShapeConstraints')
    expect(structuredTableSource).not.toMatch(/export function validateStructuredTableShapeConstraints\b/)
    expect(structuredTableSource).not.toMatch(/function predicateValidationEntries\b/)
    expect(structuredTableSource).not.toMatch(/function valueMatchesShapeDatatype\b/)
    expect(structuredTableSource).not.toMatch(/function compileShapePattern\b/)

    expect(shapeValidationSource).toContain('export function validateStructuredTableShapeConstraints')
    expect(shapeValidationSource).not.toContain('@tanstack/react-query')
    expect(shapeValidationSource).not.toContain('@inrupt/solid-client')
    expect(shapeValidationSource).not.toContain('SolidDatabase')
    expect(shapeValidationSource).not.toContain('@/providers/query-provider')
    expect(shapeValidationSource).not.toContain('projectStructuredResourceTable')
  })

  it('shares term-key helpers instead of duplicating alias matching rules', () => {
    const structuredTableSource = readFileSync(structuredTablePath, 'utf8')
    const shapeValidationSource = readFileSync(shapeValidationPath, 'utf8')

    expect(existsSync(termKeysPath)).toBe(true)
    if (!existsSync(termKeysPath)) return

    const termKeysSource = readFileSync(termKeysPath, 'utf8')

    expect(structuredTableSource).toContain("from './structured-term-keys'")
    expect(shapeValidationSource).toContain("from './structured-term-keys'")
    expect(structuredTableSource).not.toMatch(/function localName\b/)
    expect(structuredTableSource).not.toMatch(/function canonicalPredicateKey\b/)
    expect(structuredTableSource).not.toMatch(/function termLookupKeys\b/)
    expect(shapeValidationSource).not.toMatch(/function localName\b/)
    expect(shapeValidationSource).not.toMatch(/function canonicalPredicateKey\b/)
    expect(shapeValidationSource).not.toMatch(/function termLookupKeys\b/)

    expect(termKeysSource).toContain('export function localName')
    expect(termKeysSource).toContain('export function canonicalPredicateKey')
    expect(termKeysSource).toContain('export function termLookupKeys')
    expect(termKeysSource).not.toContain('@tanstack/react-query')
    expect(termKeysSource).not.toContain('@inrupt/solid-client')
    expect(termKeysSource).not.toContain('SolidDatabase')
  })

  it('keeps structured cell editor planning in domain/structured with a root compatibility shim', () => {
    expect(existsSync(structuredCellEditorPlanPath)).toBe(true)
    expect(existsSync(rootStructuredCellEditorPlanShimPath)).toBe(true)
    if (!existsSync(structuredCellEditorPlanPath) || !existsSync(rootStructuredCellEditorPlanShimPath)) return

    const planSource = readFileSync(structuredCellEditorPlanPath, 'utf8')
    const rootShimSource = readFileSync(rootStructuredCellEditorPlanShimPath, 'utf8')

    expect(planSource).toContain('export type StructuredCellEditorPlan')
    expect(planSource).toContain('export function resolveStructuredCellEditorPlan')
    expect(planSource).toContain("from './structured-table'")
    expect(planSource).not.toContain("from '../structured-cell-editor-plan'")
    expect(planSource).not.toContain('useState')
    expect(planSource).not.toContain('SolidDatabase')
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/structured\/structured-cell-editor-plan'\n?$/)
  })

  it('keeps structured vocab helpers and cell models in domain/structured with root compatibility shims', () => {
    expect(existsSync(structuredTableVocabPath)).toBe(true)
    expect(existsSync(structuredTableCellModelPath)).toBe(true)
    expect(existsSync(rootStructuredTableVocabShimPath)).toBe(true)
    expect(existsSync(rootStructuredTableCellModelShimPath)).toBe(true)
    if (
      !existsSync(structuredTableVocabPath)
      || !existsSync(structuredTableCellModelPath)
      || !existsSync(rootStructuredTableVocabShimPath)
      || !existsSync(rootStructuredTableCellModelShimPath)
    ) return

    const vocabSource = readFileSync(structuredTableVocabPath, 'utf8')
    const cellModelSource = readFileSync(structuredTableCellModelPath, 'utf8')

    expect(vocabSource).toContain('export function localPredicateLabel')
    expect(vocabSource).toContain('export function resolveLocalVocabTermUri')
    expect(vocabSource).toContain("from '../resource/files-rdf-contract'")
    expect(vocabSource).not.toContain('SolidDatabase')

    expect(cellModelSource).toContain('export function documentCellKey')
    expect(cellModelSource).toContain('export function structuredCellChangeProposalToWriteProposal')
    expect(cellModelSource).toContain('export function inferStructuredPredicateKind')
    expect(cellModelSource).toContain("from '../proposal/structured-cell-approval-model'")
    expect(cellModelSource).toContain("from './structured-table'")
    expect(cellModelSource).toContain("from './structured-table-vocab'")
    expect(cellModelSource).not.toContain('SolidDatabase')

    expect(readFileSync(rootStructuredTableVocabShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-table-vocab'\n?$/)
    expect(readFileSync(rootStructuredTableCellModelShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-table-cell-model'\n?$/)
  })

  it('keeps structured view filters and projections in domain/structured with a root compatibility shim', () => {
    expect(existsSync(structuredViewProjectionPath)).toBe(true)
    expect(existsSync(rootStructuredViewProjectionShimPath)).toBe(true)
    if (!existsSync(structuredViewProjectionPath) || !existsSync(rootStructuredViewProjectionShimPath)) return

    const viewProjectionSource = readFileSync(structuredViewProjectionPath, 'utf8')

    expect(viewProjectionSource).toContain('export type StructuredPredicateTypeFilter')
    expect(viewProjectionSource).toContain('export function projectStructuredPredicateTypeFilter')
    expect(viewProjectionSource).toContain('export function filterShapeWarningsForProjection')
    expect(viewProjectionSource).toContain("from './structured-table'")
    expect(viewProjectionSource).toContain("from './structured-cell-editor-plan'")
    expect(viewProjectionSource).toContain("from './structured-table-cell-model'")
    expect(viewProjectionSource).toContain("from './structured-table-vocab'")
    expect(viewProjectionSource).not.toContain('useState')
    expect(viewProjectionSource).not.toContain('SolidDatabase')
    expect(readFileSync(rootStructuredViewProjectionShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-view-projection'\n?$/)
  })

  it('keeps structured predicate draft planning in domain/structured with a root compatibility shim', () => {
    expect(existsSync(structuredPredicateDraftPath)).toBe(true)
    expect(existsSync(rootStructuredPredicateDraftShimPath)).toBe(true)
    if (!existsSync(structuredPredicateDraftPath) || !existsSync(rootStructuredPredicateDraftShimPath)) return

    const draftSource = readFileSync(structuredPredicateDraftPath, 'utf8')

    expect(draftSource).toContain('export type PredicateDefinitionDraft')
    expect(draftSource).toContain('export function createPredicateDefinitionDraft')
    expect(draftSource).toContain('export function predicateReferenceUriFromDraft')
    expect(draftSource).toContain('export function predicateShapeFromDraft')
    expect(draftSource).toContain("from './structured-table-vocab'")
    expect(draftSource).not.toContain('useState')
    expect(draftSource).not.toContain('SolidDatabase')
    expect(readFileSync(rootStructuredPredicateDraftShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-predicate-draft'\n?$/)
  })

  it('keeps structured subject peek and open-target decisions in domain/structured with a root compatibility shim', () => {
    expect(existsSync(structuredSubjectPeekPath)).toBe(true)
    expect(existsSync(rootStructuredSubjectPeekShimPath)).toBe(true)
    if (!existsSync(structuredSubjectPeekPath) || !existsSync(rootStructuredSubjectPeekShimPath)) return

    const subjectPeekSource = readFileSync(structuredSubjectPeekPath, 'utf8')

    expect(subjectPeekSource).toContain('export function resolveStructuredSubjectOpenTarget')
    expect(subjectPeekSource).toContain('export function resolveStructuredRelationOpenTarget')
    expect(subjectPeekSource).toContain('export function deriveStructuredSubjectPeekFacts')
    expect(subjectPeekSource).toContain("from '../resource/structured-subject-uri'")
    expect(subjectPeekSource).not.toContain("from './browser'")
    expect(subjectPeekSource).not.toContain('useFilesStore')
    expect(subjectPeekSource).not.toContain('SolidDatabase')
    expect(readFileSync(rootStructuredSubjectPeekShimPath, 'utf8')).toMatch(/^export \* from '.\/domain\/structured\/structured-subject-peek'\n?$/)
  })
})
