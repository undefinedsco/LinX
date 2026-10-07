import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const projectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const projectionTableColumnsPath = 'src/modules/files/features/structured/StructuredProjectionTableColumns.tsx'
const projectionTableModelControllerPath = 'src/modules/files/features/structured/useStructuredProjectionTableModelController.ts'
const enumCellWorkflowControllerPath = 'src/modules/files/features/structured/useStructuredEnumCellWorkflowController.ts'
const tableModelPath = 'src/modules/files/features/structured/structured-projection-table-model.ts'
const cellEditWorkflowModelPath = 'src/modules/files/features/structured/structured-cell-edit-workflow-model.ts'
const enumCellWorkflowModelPath = 'src/modules/files/features/structured/structured-enum-cell-workflow-model.ts'
const predicateCellDisplayModelPath = 'src/modules/files/features/structured/structured-predicate-cell-display-model.ts'
const subjectCreationModelPath = 'src/modules/files/features/structured/structured-subject-creation-model.ts'
const cellChromeModelPath = 'src/modules/files/features/structured/structured-projection-cell-chrome.ts'
const predicateHeaderModelPath = 'src/modules/files/features/structured/structured-predicate-column-header-model.ts'
const predicateValueEditorModelPath = 'src/modules/files/features/structured/structured-predicate-value-editor-model.ts'
const subjectCreationControlsPath = 'src/modules/files/features/structured/StructuredSubjectCreationControls.tsx'
const tableChromeModelPath = 'src/modules/files/features/structured/structured-projection-table-chrome.ts'
const sortIconPath = 'src/modules/files/features/structured/StructuredProjectionSortIcon.tsx'
const predicateCellTrailingPath = 'src/modules/files/features/structured/StructuredPredicateCellTrailing.tsx'
const tableCellPrimitivesPath = 'src/modules/files/features/structured/StructuredTableCellPrimitives.tsx'

describe('Structured projection table model architecture boundary', () => {
	it('keeps row, visibility, relation value, enum option, subject draft, and shape warning projection out of the renderer', () => {
		const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

		expect(existsSync(projectionTableModelControllerPath)).toBe(true)
		expect(existsSync(enumCellWorkflowControllerPath)).toBe(true)
		expect(existsSync(tableModelPath)).toBe(true)
		expect(existsSync(cellEditWorkflowModelPath)).toBe(true)
		expect(existsSync(enumCellWorkflowModelPath)).toBe(true)
		expect(existsSync(predicateCellDisplayModelPath)).toBe(true)
		expect(existsSync(subjectCreationModelPath)).toBe(true)
		expect(existsSync(projectionTableColumnsPath)).toBe(true)
		expect(existsSync(cellChromeModelPath)).toBe(true)
		expect(existsSync(predicateHeaderModelPath)).toBe(true)
		expect(existsSync(predicateValueEditorModelPath)).toBe(true)
		if (
      !existsSync(projectionTableModelControllerPath) ||
      !existsSync(enumCellWorkflowControllerPath) ||
      !existsSync(tableModelPath) ||
      !existsSync(cellEditWorkflowModelPath) ||
      !existsSync(enumCellWorkflowModelPath) ||
      !existsSync(predicateCellDisplayModelPath) ||
      !existsSync(subjectCreationModelPath) ||
      !existsSync(cellChromeModelPath) ||
      !existsSync(predicateHeaderModelPath) ||
      !existsSync(predicateValueEditorModelPath)
    ) return

		const projectionTableModelControllerSource = readFileSync(projectionTableModelControllerPath, 'utf8')
		const enumCellWorkflowControllerSource = readFileSync(enumCellWorkflowControllerPath, 'utf8')
		const tableModelSource = readFileSync(tableModelPath, 'utf8')
		const cellEditWorkflowModelSource = readFileSync(cellEditWorkflowModelPath, 'utf8')
		const enumCellWorkflowModelSource = readFileSync(enumCellWorkflowModelPath, 'utf8')
		const predicateCellDisplayModelSource = readFileSync(predicateCellDisplayModelPath, 'utf8')
		const subjectCreationModelSource = readFileSync(subjectCreationModelPath, 'utf8')
		const cellChromeModelSource = readFileSync(cellChromeModelPath, 'utf8')
		const predicateHeaderModelSource = readFileSync(predicateHeaderModelPath, 'utf8')
		const predicateValueEditorModelSource = readFileSync(predicateValueEditorModelPath, 'utf8')
		const tableCellPrimitivesSource = readFileSync(tableCellPrimitivesPath, 'utf8')
		const projectionTableColumnsSource = existsSync(projectionTableColumnsPath)
			? readFileSync(projectionTableColumnsPath, 'utf8')
			: ''

		expect(projectionTableSource).toContain("from './useStructuredProjectionTableModelController'")
		expect(projectionTableSource).not.toContain("from './structured-projection-table-model'")
		expect(projectionTableSource).toContain("from './StructuredProjectionTableColumns'")
		expect(projectionTableSource).not.toContain("from './StructuredPredicateActiveCell'")
		expect(projectionTableSource).not.toContain("from './StructuredPredicateStaticCell'")
		expect(projectionTableSource).not.toContain('ColumnDef<StructuredProjectionTableRow>')
		expect(projectionTableSource).not.toContain('StructuredAddPredicateColumnHeader')
		expect(projectionTableSource).not.toContain('StructuredPredicateColumnHeader')
		expect(projectionTableSource).not.toContain("id: '__addPredicate'")
		expect(projectionTableSource).not.toContain('Object.fromEntries(projection.predicates.map')
    expect(projectionTableSource).not.toContain('new Set([...projection.rows.map')
    expect(projectionTableSource).not.toContain('new Map<string, StructuredShapeValidationWarning[]>')
    expect(projectionTableSource).not.toContain('visiblePredicates.filter((predicate) => !hiddenPredicates.has(predicate))')
    expect(projectionTableSource).not.toContain("external: openTarget?.kind === 'external'")
    expect(projectionTableSource).not.toContain('findPendingEnumOptionProposal')
    expect(projectionTableSource).not.toContain('proposalResourceUri: pendingProposal?.proposalResourceUri')
    expect(projectionTableSource).not.toContain('pendingEnumOptionLabelsForPredicate')
    expect(projectionTableSource).not.toContain('vocabDefinitionIndex?.enumOptionsByPredicate.get(predicate)')
    expect(projectionTableSource).not.toContain('isPendingEnumOption(reviewableVocabProposals')
    expect(projectionTableSource).not.toContain('const enumLabels = values.map')
    expect(projectionTableSource).not.toContain('const scalarLabels = values.map')
    expect(projectionTableSource).not.toContain('projection.rows.find((projectionRow) => projectionRow.subject')
    expect(projectionTableSource).not.toContain('originalValues.length !==')
    expect(projectionTableSource).not.toContain('originalValues.some((value, index)')
    expect(projectionTableSource).not.toContain('projection.rows.flatMap((row)')
    expect(projectionTableSource).not.toContain('proposal ? proposal.label : showNamespaces')
    expect(projectionTableSource).not.toContain('!label.endsWith')
    expect(projectionTableSource).not.toContain('quoteStructuredCellLiteral')
    expect(projectionTableSource).not.toContain('unquoteStructuredCellLiteral')
    expect(projectionTableSource).not.toContain('isMultiEnumPredicateDefinition')
    expect(projectionTableSource).not.toContain('existing.includes')
    expect(projectionTableSource).not.toContain('existing.filter((cellValue)')
    expect(projectionTableSource).not.toContain('knownOptions.includes')
    expect(projectionTableSource).not.toContain('tableRows.flatMap((tableRow)')
    expect(projectionTableSource).not.toContain('resolveStructuredCellEditorPlan')
    expect(projectionTableSource).not.toContain('quoteStructuredCellResourceValue')
    expect(projectionTableSource).not.toContain('activeTextCell.commit')
    expect(projectionTableSource).not.toContain('displayValue.trim')
    expect(projectionTableSource).not.toContain('activeRelationCell.value.trim')
    expect(projectionTableSource).not.toContain('projection.rows.some((row) => row.subject')
    expect(projectionTableSource).not.toContain("predicate: 'rdf:type'")
    expect(projectionTableSource).not.toContain('localeCompare')
    expect(projectionTableSource).not.toContain("columnId === 'subject'")
    expect(projectionTableSource).not.toContain('<StructuredBooleanCellToggle')
    expect(projectionTableSource).not.toContain('<StructuredScalarCellEditor')
    expect(projectionTableSource).not.toContain('<StructuredPredicateCellEditor')
    expect(projectionTableSource).not.toContain('<StructuredEnumCellSelector')
    expect(projectionTableSource).not.toContain('<StructuredEnumValueChips')
    expect(projectionTableSource).not.toContain('<StructuredPredicateValueLinks')
    expect(projectionTableSource).not.toContain('<StructuredScalarValueDisplay')

    expect(projectionTableModelControllerSource).toContain('export function useStructuredProjectionTableModelController')
    expect(projectionTableModelControllerSource).toContain("from './structured-projection-table-model'")
    expect(projectionTableModelControllerSource).toContain('buildStructuredProjectionTableRows')
    expect(projectionTableModelControllerSource).toContain('buildStructuredShapeWarningMap')
    expect(projectionTableModelControllerSource).toContain('projectStructuredColumnVisibilityState')
    expect(projectionTableModelControllerSource).toContain('projectStructuredDisplayTableRows')
    expect(projectionTableModelControllerSource).toContain('projectStructuredFooterPredicates')
    expect(projectionTableModelControllerSource).toContain('resolveStructuredVisiblePredicates')
    expect(projectionTableModelControllerSource).not.toContain('useReactTable')
    expect(projectionTableModelControllerSource).not.toContain('CompactTableShell')

    expect(tableModelSource).toContain('export function buildStructuredProjectionTableRows')
    expect(tableModelSource).toContain('export function compareStructuredProjectionTableRows')
    expect(tableModelSource).toContain('export function getStructuredProjectionCellOriginalValues')
    expect(tableModelSource).toContain('export function getStructuredProjectionTableCellValues')
    expect(tableModelSource).toContain('export function getStructuredProjectionTablePredicateValues')
    expect(tableModelSource).not.toContain('export function hasStructuredCellEditPendingProposal')
    expect(tableModelSource).not.toContain('export function planStructuredCellActivation')
    expect(tableModelSource).not.toContain('export function planStructuredTextCellCommit')
    expect(tableModelSource).not.toContain('export function planStructuredRelationCellCommit')
    expect(tableModelSource).not.toContain('export function planStructuredSubjectCreation')
    expect(tableModelSource).not.toContain('export function planStructuredEnumOptionAdd')
    expect(tableModelSource).not.toContain('export function planStructuredEnumOptionRemove')
    expect(tableModelSource).not.toContain('export function projectStructuredEnumOptionLabels')
    expect(tableModelSource).not.toContain('export function projectStructuredEnumOptions')
    expect(tableModelSource).not.toContain('export function projectStructuredEnumSelectedValues')
    expect(tableModelSource).not.toContain('export function projectStructuredEnumValueLabels')
    expect(tableModelSource).not.toContain('export function projectStructuredScalarValueLabels')
    expect(tableModelSource).not.toContain('export function projectStructuredRelationValues')
    expect(tableModelSource).not.toContain('export function projectStructuredPredicateColumnModel')
    expect(tableModelSource).toContain('export function resolveStructuredVisiblePredicates')
    expect(tableModelSource).toContain('export function projectStructuredColumnVisibilityState')
		expect(tableModelSource).toContain('export function buildStructuredShapeWarningMap')
		expect(tableModelSource).not.toContain('export function getNextStructuredSubjectDraft')
		expect(tableModelSource).not.toContain('useReactTable')
		expect(tableModelSource).not.toContain('CompactTableShell')
    expect(cellEditWorkflowModelSource).toContain('export function hasStructuredCellEditPendingProposal')
    expect(cellEditWorkflowModelSource).toContain('export function planStructuredCellActivation')
    expect(cellEditWorkflowModelSource).toContain('export function planStructuredTextCellCommit')
    expect(cellEditWorkflowModelSource).toContain('export function planStructuredRelationCellCommit')
    expect(cellEditWorkflowModelSource).not.toContain('useReactTable')
    expect(cellEditWorkflowModelSource).not.toContain('CompactTableShell')
    expect(enumCellWorkflowModelSource).toContain('export function planStructuredEnumOptionAdd')
    expect(enumCellWorkflowModelSource).toContain('export function planStructuredEnumOptionRemove')
    expect(enumCellWorkflowModelSource).toContain('export function projectStructuredEnumCellSelectorModel')
    expect(enumCellWorkflowModelSource).toContain('export function projectStructuredEnumCellSelectorChrome')
    expect(enumCellWorkflowModelSource).toContain('export function projectStructuredEnumCellOptionMenuModel')
    expect(enumCellWorkflowModelSource).not.toContain('useReactTable')
    expect(enumCellWorkflowModelSource).not.toContain('CompactTableShell')
    expect(enumCellWorkflowControllerSource).toContain('getStructuredProjectionTableCellValues')
    expect(enumCellWorkflowControllerSource).not.toContain('tableRows.find((row) => row.subject === subject)?.cells[predicate]')
    expect(tableCellPrimitivesSource).toContain('projectStructuredEnumCellSelectorModel')
    expect(tableCellPrimitivesSource).toContain('projectStructuredEnumCellSelectorChrome')
    expect(tableCellPrimitivesSource).toContain('projectStructuredEnumCellOptionMenuModel')
    expect(tableCellPrimitivesSource).toContain('selectorChrome.input.placeholder')
    expect(tableCellPrimitivesSource).toContain('optionMenu.actions.openDefinition.label')
    expect(tableCellPrimitivesSource).not.toContain('const filteredOptions = options.filter')
    expect(tableCellPrimitivesSource).not.toContain('const canCreate = !!normalizedSearch')
    expect(tableCellPrimitivesSource).not.toContain('const exactSearchOption = normalizedSearch')
    expect(tableCellPrimitivesSource).not.toContain('filteredOptions.length > 0 || canCreate')
    expect(tableCellPrimitivesSource).not.toContain('optionCandidates.length > 0 || canCreate')
    expect(tableCellPrimitivesSource).not.toContain('normalizedDraft && (filteredOptions.length > 0 || canCreate)')
    expect(tableCellPrimitivesSource).not.toContain('placeholder="选择或创建选项"')
    expect(tableCellPrimitivesSource).not.toContain('aria-label={`新增选项 ${normalizedSearch}`}')
    expect(tableCellPrimitivesSource).not.toContain('<span>新增 {normalizedSearch}*</span>')
    expect(tableCellPrimitivesSource).not.toContain('<p className="font-medium text-foreground">选项定义</p>')
    expect(predicateValueEditorModelSource).toContain('export function projectStructuredPredicateValueEditorChrome')
    expect(predicateValueEditorModelSource).toContain('showListbox')
    expect(predicateValueEditorModelSource).toContain('expanded')
    expect(tableCellPrimitivesSource).toContain('predicateEditorChrome.input.placeholder')
    expect(tableCellPrimitivesSource).toContain('predicateEditorChrome.listbox.ariaLabel')
    expect(tableCellPrimitivesSource).not.toContain("placeholder = '选择或创建选项'")
    expect(tableCellPrimitivesSource).not.toContain('aria-label={`${ariaLabel}`} 的选项')
    expect(tableCellPrimitivesSource).not.toContain('aria-label={`新增值 ${normalizedDraft}`}')
    expect(tableCellPrimitivesSource).not.toContain('新增 {normalizedDraft}*')
    expect(predicateCellDisplayModelSource).toContain('export function projectStructuredRelationValues')
    expect(predicateCellDisplayModelSource).toContain('export function projectStructuredEnumOptionLabels')
    expect(predicateCellDisplayModelSource).toContain('export function projectStructuredEnumOptions')
    expect(predicateCellDisplayModelSource).toContain('export function projectStructuredEnumSelectedValues')
    expect(predicateCellDisplayModelSource).toContain('export function projectStructuredEnumValueLabels')
    expect(predicateCellDisplayModelSource).toContain('export function projectStructuredScalarValueLabels')
    expect(predicateCellDisplayModelSource).not.toContain('useReactTable')
    expect(predicateCellDisplayModelSource).not.toContain('CompactTableShell')
    expect(subjectCreationModelSource).toContain('export function getNextStructuredSubjectDraft')
    expect(subjectCreationModelSource).toContain('export function projectStructuredSubjectCreationExistingSubjects')
    expect(subjectCreationModelSource).toContain('export function planStructuredSubjectCreation')
    expect(subjectCreationModelSource).toContain('export function projectStagedStructuredPendingSubjects')
    expect(subjectCreationModelSource).toContain('export function canSubmitStructuredSubjectCreation')
    expect(subjectCreationModelSource).toContain('export function projectStructuredSubjectCreationFooterModel')
    expect(subjectCreationModelSource).not.toContain('useReactTable')
    expect(subjectCreationModelSource).not.toContain('CompactTableShell')
		expect(projectionTableColumnsSource).toContain('export function buildStructuredProjectionTableColumns')
		expect(projectionTableColumnsSource).toContain("from './structured-projection-cell-chrome'")
		expect(projectionTableColumnsSource).toContain("from './structured-predicate-column-header-model'")
		expect(projectionTableColumnsSource).toContain('projectStructuredPredicateCellChrome')
		expect(projectionTableColumnsSource).toContain('projectStructuredSubjectCellChrome')
		expect(projectionTableColumnsSource).toContain('projectStructuredPredicateHeaderColumnModel')
		expect(projectionTableColumnsSource).not.toContain('projectStructuredPredicateColumnModel')
		expect(projectionTableColumnsSource).not.toContain("from '../../domain/structured/structured-subject-peek'")
		expect(projectionTableColumnsSource).not.toContain('resolveStructuredSubjectOpenTarget')
		expect(projectionTableColumnsSource).not.toContain("from '../../domain/structured/structured-table-cell-model'")
		expect(projectionTableColumnsSource).not.toContain("from '../../domain/structured/structured-table-vocab'")
		expect(projectionTableColumnsSource).not.toContain('documentCellKey')
		expect(projectionTableColumnsSource).not.toContain('localPredicateLabel')
		expect(projectionTableColumnsSource).not.toContain('cellWriteState.proposal')
		expect(projectionTableColumnsSource).not.toContain('cellWriteState.status')
		expect(projectionTableColumnsSource).not.toContain('cellWriteState.hasProposal')
		expect(projectionTableColumnsSource).not.toContain('shapeWarningByCell.get')
		expect(projectionTableColumnsSource).not.toContain('activeTextCell?.subject ===')
		expect(projectionTableColumnsSource).not.toContain('activeEnumCell?.subject ===')
		expect(projectionTableColumnsSource).not.toContain('activeRelationCell?.subject ===')
		expect(projectionTableColumnsSource).toContain("from './StructuredPredicateActiveCell'")
		expect(projectionTableColumnsSource).toContain("from './StructuredPredicateStaticCell'")
		expect(cellChromeModelSource).toContain('export function projectStructuredPredicateCellChrome')
		expect(cellChromeModelSource).toContain('export function projectStructuredSubjectCellChrome')
		expect(cellChromeModelSource).toContain("from '../../domain/structured/structured-subject-peek'")
		expect(cellChromeModelSource).toContain("from '../../domain/structured/structured-table-cell-model'")
		expect(cellChromeModelSource).toContain("from '../../domain/structured/structured-table-vocab'")
		expect(cellChromeModelSource).not.toContain('<ShapeWarningIndicator')
		expect(cellChromeModelSource).not.toContain('<PendingCellWriteButton')
		expect(predicateHeaderModelSource).toContain('export function projectStructuredPredicateHeaderColumnModel')
		expect(predicateHeaderModelSource).toContain('export function projectStructuredPredicateColumnHeader')
	})

  it('keeps subject creation footer and dialog markup out of the table renderer', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(subjectCreationControlsPath)).toBe(true)
    if (!existsSync(subjectCreationControlsPath)) return

    const subjectCreationControlsSource = readFileSync(subjectCreationControlsPath, 'utf8')

    expect(projectionTableSource).toContain("from './StructuredSubjectCreationControls'")
    expect(projectionTableSource).not.toContain("from 'lucide-react'")
    expect(projectionTableSource).not.toContain("@/components/ui/input")
    expect(projectionTableSource).not.toContain("@/components/ui/dialog")
    expect(projectionTableSource).not.toContain('const footerRow = editable ? (')
    expect(projectionTableSource).not.toContain('<Dialog open={createSubjectOpen}')
    expect(projectionTableSource).not.toContain('新增 subject')
    expect(projectionTableSource).not.toContain('创建条目审批')

    expect(subjectCreationControlsSource).toContain('export function StructuredSubjectCreationFooterRow')
    expect(subjectCreationControlsSource).toContain('export function StructuredSubjectCreationDialog')
    expect(subjectCreationControlsSource).toContain("@/components/ui/input")
    expect(subjectCreationControlsSource).toContain("@/components/ui/dialog")
    expect(subjectCreationControlsSource).toContain('footerModel.buttonAriaLabel')
    expect(subjectCreationControlsSource).toContain('footerModel.buttonLabel')
    expect(subjectCreationControlsSource).toContain('dialogModel.title')
    expect(subjectCreationControlsSource).toContain('dialogModel.description')
    expect(subjectCreationControlsSource).toContain('dialogModel.subjectInputLabel')
    expect(subjectCreationControlsSource).toContain('dialogModel.cancelLabel')
    expect(subjectCreationControlsSource).toContain('dialogModel.submitLabel')
    expect(subjectCreationControlsSource).toContain('submitDisabled')
    expect(subjectCreationControlsSource).not.toContain('aria-label="+ Subject"')
    expect(subjectCreationControlsSource).not.toContain('>Subject<')
    expect(subjectCreationControlsSource).not.toContain('新增 subject')
    expect(subjectCreationControlsSource).not.toContain('先选择 class 再新增 subject')
    expect(subjectCreationControlsSource).not.toContain('aria-label="Subject"')
    expect(subjectCreationControlsSource).not.toContain('>取消<')
    expect(subjectCreationControlsSource).not.toContain('创建条目审批')
    expect(subjectCreationControlsSource).not.toContain('subjectDraft.trim')
    expect(subjectCreationControlsSource).not.toContain('disabled={!classScope')
    expect(subjectCreationControlsSource).not.toContain('useStructuredSubjectCreationController')
    expect(subjectCreationControlsSource).not.toContain('useStructuredProjectionTableModelController')
  })

  it('keeps table chrome class projection out of the table renderer', () => {
    const projectionTableSource = readFileSync(projectionTablePath, 'utf8')

    expect(existsSync(tableChromeModelPath)).toBe(true)
    if (!existsSync(tableChromeModelPath)) return

    const tableChromeModelSource = readFileSync(tableChromeModelPath, 'utf8')

    expect(projectionTableSource).toContain("from './structured-projection-table-chrome'")
    expect(projectionTableSource).not.toContain("from '@/lib/utils'")
    expect(projectionTableSource).not.toContain('bg-amber-500/5')
    expect(projectionTableSource).not.toContain('text-foreground/80')
    expect(projectionTableSource).not.toContain('text-muted-foreground/50')

    expect(tableChromeModelSource).toContain('export function projectStructuredProjectionTableRowClassName')
    expect(tableChromeModelSource).toContain('export function projectStructuredProjectionTableCellClassName')
    expect(tableChromeModelSource).not.toContain('useReactTable')
    expect(tableChromeModelSource).not.toContain('CompactTableShell')
  })

  it('keeps sort icon primitives out of the columns builder', () => {
    const projectionTableColumnsSource = readFileSync(projectionTableColumnsPath, 'utf8')

    expect(existsSync(sortIconPath)).toBe(true)
    if (!existsSync(sortIconPath)) return

    const sortIconSource = readFileSync(sortIconPath, 'utf8')

    expect(projectionTableColumnsSource).toContain("from './StructuredProjectionSortIcon'")
    expect(projectionTableColumnsSource).not.toContain("from 'lucide-react'")
    expect(projectionTableColumnsSource).not.toMatch(/\nfunction StructuredProjectionSortIcon\(/)

    expect(sortIconSource).toContain('export function StructuredProjectionSortIcon')
    expect(sortIconSource).toContain("from 'lucide-react'")
    expect(sortIconSource).not.toContain('buildStructuredProjectionTableColumns')
    expect(sortIconSource).not.toContain('projectStructuredPredicateHeaderColumnModel')
  })

  it('keeps predicate cell trailing primitives out of the columns builder', () => {
    const projectionTableColumnsSource = readFileSync(projectionTableColumnsPath, 'utf8')

    expect(existsSync(predicateCellTrailingPath)).toBe(true)
    if (!existsSync(predicateCellTrailingPath)) return

    const predicateCellTrailingSource = readFileSync(predicateCellTrailingPath, 'utf8')

    expect(projectionTableColumnsSource).toContain("from './StructuredPredicateCellTrailing'")
    expect(projectionTableColumnsSource).not.toContain('PendingCellWriteButton')
    expect(projectionTableColumnsSource).not.toContain('ShapeWarningIndicator')
    expect(projectionTableColumnsSource).not.toMatch(/const shapeWarningIndicator =/)
    expect(projectionTableColumnsSource).not.toMatch(/const cellProposalButton =/)

    expect(predicateCellTrailingSource).toContain('export function StructuredPredicateCellShapeWarning')
    expect(predicateCellTrailingSource).toContain('export function StructuredPredicateCellPendingWriteControl')
    expect(predicateCellTrailingSource).toContain('export function StructuredPredicateCellTrailing')
    expect(predicateCellTrailingSource).toContain('PendingCellWriteButton')
    expect(predicateCellTrailingSource).toContain('ShapeWarningIndicator')
    expect(predicateCellTrailingSource).not.toContain('buildStructuredProjectionTableColumns')
    expect(predicateCellTrailingSource).not.toContain('useStructuredCellWriteProposalController')
  })
})
