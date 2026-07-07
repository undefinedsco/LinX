import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const projectionTableColumnsPath = 'src/modules/files/features/structured/StructuredProjectionTableColumns.tsx'
const predicateHeaderPath = 'src/modules/files/features/structured/StructuredPredicateColumnHeader.tsx'
const predicateHeaderModelPath = 'src/modules/files/features/structured/structured-predicate-column-header-model.ts'
const tableCellPrimitivesPath = 'src/modules/files/features/structured/StructuredTableCellPrimitives.tsx'

describe('Structured predicate column header architecture boundary', () => {
  it('keeps predicate header and add-predicate menu rendering out of the projection table', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(projectionTableColumnsPath)).toBe(true)
    expect(existsSync(predicateHeaderPath)).toBe(true)
    expect(existsSync(predicateHeaderModelPath)).toBe(true)
    expect(existsSync(tableCellPrimitivesPath)).toBe(true)
    if (
      !existsSync(projectionTableColumnsPath)
      || !existsSync(predicateHeaderPath)
      || !existsSync(predicateHeaderModelPath)
      || !existsSync(tableCellPrimitivesPath)
    ) return

    const projectionTableColumnsSource = readFileSync(projectionTableColumnsPath, 'utf8')
    const predicateHeaderSource = readFileSync(predicateHeaderPath, 'utf8')
    const predicateHeaderModelSource = readFileSync(predicateHeaderModelPath, 'utf8')
    const tableCellPrimitivesSource = readFileSync(tableCellPrimitivesPath, 'utf8')

    expect(projectionTableSource).toContain("from './StructuredProjectionTableColumns'")
    expect(projectionTableSource).not.toContain("from './StructuredPredicateColumnHeader'")
    expect(projectionTableSource).not.toContain("from './AddPredicateMenu'")
    expect(projectionTableSource).not.toContain('StructuredPredicateHeaderCell')
    expect(projectionTableSource).not.toContain('StructuredPendingPredicateHeaderCell')
    expect(projectionTableSource).not.toContain('<AddPredicateMenu')

    expect(projectionTableColumnsSource).toContain("from './StructuredPredicateColumnHeader'")
    expect(projectionTableColumnsSource).not.toContain("from './AddPredicateMenu'")
    expect(predicateHeaderSource).toContain('export function StructuredPredicateColumnHeader')
    expect(predicateHeaderSource).toContain('export function StructuredAddPredicateColumnHeader')
    expect(predicateHeaderSource).toContain("from './structured-predicate-column-header-model'")
    expect(predicateHeaderSource).toContain('projectStructuredPredicateColumnHeader')
    expect(predicateHeaderSource).toContain('StructuredPredicateHeaderCell')
    expect(predicateHeaderSource).toContain('StructuredPendingPredicateHeaderCell')
    expect(predicateHeaderSource).toContain('AddPredicateMenu')
    expect(predicateHeaderSource).not.toContain("from '../../domain/structured/structured-table-vocab'")
    expect(predicateHeaderSource).not.toContain('localPredicateLabel')
    expect(predicateHeaderSource).not.toContain('proposal.vocabProposal')
    expect(predicateHeaderModelSource).toContain('export function projectStructuredPredicateColumnHeader')
    expect(predicateHeaderModelSource).toContain('export function projectStructuredDefinedPredicateHeaderChrome')
    expect(predicateHeaderModelSource).toContain('export function projectStructuredPendingPredicateHeaderChrome')
    expect(predicateHeaderModelSource).toContain("from '../../domain/structured/structured-table-vocab'")
    expect(predicateHeaderModelSource).toContain('function predicateDefinitionTypeLabel')
    expect(predicateHeaderModelSource).toContain('function predicateDefinitionRuleText')
    expect(predicateHeaderModelSource).toContain('function pendingFieldStatusLabel')
    expect(predicateHeaderModelSource).not.toContain('<StructuredPredicateHeaderCell')
    expect(predicateHeaderModelSource).not.toContain('<StructuredPendingPredicateHeaderCell')
    expect(predicateHeaderModelSource).not.toContain('<AddPredicateMenu')
    expect(tableCellPrimitivesSource).not.toContain('function predicateDefinitionTypeLabel')
    expect(tableCellPrimitivesSource).not.toContain('function predicateDefinitionRuleText')
    expect(tableCellPrimitivesSource).not.toContain('function pendingFieldStatusLabel')
    expect(tableCellPrimitivesSource).not.toContain('function inferStructuredPredicateKind')
    expect(tableCellPrimitivesSource).toContain('chrome.menu.title')
    expect(tableCellPrimitivesSource).toContain('chrome.menu.actions.copyPredicate.label')
    expect(tableCellPrimitivesSource).toContain('chrome.menu.actions.discard.label')
    expect(tableCellPrimitivesSource).not.toContain('<p className="font-medium text-foreground">Predicate 定义</p>')
    expect(tableCellPrimitivesSource).not.toContain('<p className="font-medium text-foreground">待确认 predicate</p>')
    expect(tableCellPrimitivesSource).not.toContain('复制 predicate URI')
    expect(tableCellPrimitivesSource).not.toContain('打开 predicate URI')
    expect(tableCellPrimitivesSource).not.toContain('提交审核')
    expect(tableCellPrimitivesSource).not.toContain('放弃 predicate')
  })

  it('keeps predicate header browser side effects delegated to the projection table owner', () => {
    expect(existsSync(predicateHeaderPath)).toBe(true)
    if (!existsSync(predicateHeaderPath)) return

    const predicateHeaderSource = readFileSync(predicateHeaderPath, 'utf8')

    expect(predicateHeaderSource).toContain('onCopyPredicate')
    expect(predicateHeaderSource).toContain('onOpenPredicateDefinition')
    expect(predicateHeaderSource).toContain('onOpenPredicateShapeRule')
    expect(predicateHeaderSource).toContain('onOpenVocabTermProposal')
    expect(predicateHeaderSource).not.toContain('navigator.clipboard')
    expect(predicateHeaderSource).not.toContain('window.open')
  })
})
