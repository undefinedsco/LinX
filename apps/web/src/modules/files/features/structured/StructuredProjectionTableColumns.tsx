import type { ReactNode } from 'react'
import type { ColumnDef, SortingFn } from '@tanstack/react-table'
import {
  collectStructuredColumnFilterValues,
  findStructuredColumnFilter,
  STRUCTURED_SUBJECT_FILTER_KEY,
  type StructuredColumnFilter,
} from '../../domain/structured/structured-column-filter'
import { useCardDialog } from '@/lib/card-dialog'
import type { StructuredCardCreationResult } from './useStructuredSubjectCreationController'
import { projectCardSubjectUris } from '../../domain/card/card-dialog-model'
import { expandRdfIri } from '../../domain/card/rdf-term-tokens'

import type {
  StructuredShapeValidationWarning,
  StructuredTableProjection,
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  compareStructuredProjectionTableRows,
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'
import { projectStructuredPredicateHeaderColumnModel } from './structured-predicate-column-header-model'
import {
  projectStructuredPredicateCellChrome,
  projectStructuredSubjectCellChrome,
} from './structured-projection-cell-chrome'
import {
  StructuredAddPredicateColumnHeader,
  StructuredPredicateColumnHeader,
  type StructuredPredicateColumnProposal,
} from './StructuredPredicateColumnHeader'
import { StructuredPredicateActiveCell } from './StructuredPredicateActiveCell'
import { StructuredRowLeading } from './StructuredRowLeading'
import { StructuredAiCellDot } from './StructuredAiCellDot'
import { StructuredPredicateStaticCell } from './StructuredPredicateStaticCell'
import { aiCellKey, type AiCellChange } from '../../domain/proposal/ai-cell-change-model'
import {
  StructuredSubjectCell,
  type StructuredSubjectCellOpenKind,
} from './StructuredTableCellPrimitives'
import { StructuredProjectionSortIcon } from './StructuredProjectionSortIcon'
import { StructuredColumnHeaderCell } from './StructuredColumnHeaderCell'
import type { StructuredColumnDialogKind } from './StructuredColumnDialogHost'
import {
  StructuredPredicateCellPendingWriteControl,
  StructuredPredicateCellShapeWarning,
  StructuredPredicateCellTrailing,
} from './StructuredPredicateCellTrailing'
import type { StructuredCellWriteState } from './useStructuredCellWriteProposalController'

export type StructuredSubjectOpenOptions = {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

type StructuredPredicateActiveCellProps = Parameters<typeof StructuredPredicateActiveCell>[0]
type StructuredAddPredicateColumnHeaderProps = Parameters<typeof StructuredAddPredicateColumnHeader>[0]

export type StructuredColumnMenuInput = {
  /** Names the person gave columns in this table. */
  labels: Readonly<Record<string, string>>
  filters: readonly StructuredColumnFilter[]
  /** Rows the option lists of filters are read from (before any column filter hides rows). */
  getValueRows: () => ReadonlyArray<{ subject: string; cells: ReadonlyArray<{ predicate: string; values: readonly string[] }> }>
  onFilterChange?: (predicate: string, filter: StructuredColumnFilter | null) => void
  onHide?: (predicate: string, label: string) => void
  /** 改显示的名字, 改值的类型, 按它筛选 (a dialog) and 从这张表去掉 open a dialog kept outside the header. */
  onOpenDialog?: (kind: StructuredColumnDialogKind, predicate: string) => void
  onSortDirection?: (sortKey: string, direction: 'asc' | 'desc' | null) => void
  /** Only a property in the person's own vocabulary can change type. */
  canChangeType?: (predicate: string) => boolean
}

export interface StructuredProjectionTableColumnsInput {
  headerCache?: StructuredHeaderCache
  activeEnumCell: StructuredPredicateActiveCellProps['activeEnumCell']
  activeRelationCell: StructuredPredicateActiveCellProps['activeRelationCell']
  activeTextCell: StructuredPredicateActiveCellProps['activeTextCell']
  addEnumOption: StructuredPredicateActiveCellProps['onAddEnumOption']
  approvePendingPredicateProposal: (predicate: string) => void
  availablePredicates: readonly string[]
  classScope?: string | null
  closeActiveCellPopover: StructuredPredicateActiveCellProps['closeActiveCellPopover']
  commitRelationCell: StructuredPredicateActiveCellProps['onCommitRelationCell']
  commitTextCell: StructuredPredicateActiveCellProps['onCommitTextCell']
  createPendingPredicateProposal: StructuredAddPredicateColumnHeaderProps['onCreate']
  currentPodRootUri?: string | null
  discardCellDraft: StructuredPredicateActiveCellProps['onCancelCellDraft']
  discardPendingPredicateProposal: (predicate: string) => void
  documentUri: string
  editable: boolean
  enumSearch: string
  getCellWriteState: (subject: string, predicate: string) => StructuredCellWriteState
  getEnumOptionsForPredicate: StructuredPredicateActiveCellProps['getEnumOptionsForPredicate']
  getPredicateDefinition: (predicate: string) => StructuredVocabPredicateDefinition | undefined
  onDiscardVocabTermProposal?: StructuredPredicateActiveCellProps['onDiscardVocabTermProposal']
  onOpenEnumOptionDefinition?: StructuredPredicateActiveCellProps['onOpenEnumOptionDefinition']
  onOpenPredicateDefinition?: (predicateUri: string) => void
  onOpenSubjectResource?: (
    subject: string,
    targetUri: string,
    kind: StructuredSubjectCellOpenKind,
    options?: StructuredSubjectOpenOptions,
  ) => void
  onOpenVocabTermProposal?: StructuredPredicateActiveCellProps['onOpenVocabTermProposal']
  onSelectExistingPredicate?: StructuredAddPredicateColumnHeaderProps['onSelectExisting']
  onSort?: (sortKey: string) => void
  openRelationValue: StructuredPredicateActiveCellProps['onOpenRelationValue']
  confirmedLabelByPredicate?: ReadonlyMap<string, { label: string }>
  pendingProposalByPredicate: ReadonlyMap<string, StructuredPredicateColumnProposal>
  popoverPlacement: StructuredPredicateActiveCellProps['popoverPlacement']
  projection: StructuredTableProjection
  resolveEnumOptionTermUri: StructuredPredicateActiveCellProps['resolveEnumOptionTermUri']
  reviewableVocabProposals: readonly VocabTermProposal[]
  shapeWarningByCell: ReadonlyMap<string, readonly StructuredShapeValidationWarning[]>
  showNamespaces: boolean
  sortDirection?: 'asc' | 'desc'
  sortKey?: string | null
  startCellEdit: (row: StructuredProjectionTableRow, predicate: string, anchor?: HTMLElement | null) => void
  tableRows: readonly StructuredProjectionTableRow[]
  targetVocabUri?: string | null
  updateActiveRelationCellValue: StructuredPredicateActiveCellProps['updateActiveRelationCellValue']
  updateActiveTextCellValue: StructuredPredicateActiveCellProps['updateActiveTextCellValue']
  updateEnumSearch: StructuredPredicateActiveCellProps['updateEnumSearch']
  visiblePredicates: readonly string[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
  removeEnumOption: StructuredPredicateActiveCellProps['onRemoveEnumOption']
  /** K6d header menu: the names, filters and actions of this table's columns. */
  columnMenu?: StructuredColumnMenuInput
  /** Cells LinX wrote that still wear a purple dot, keyed by `aiCellKey(subjectIri, predicateIri)`. */
  aiCellDots?: ReadonlyMap<string, AiCellChange>
  onUndoAiCell?: (change: AiCellChange) => void
  onSeenAiCell?: (change: AiCellChange) => void
  /** Rows ticked for the bulk bar (R6 K6); the tick box is hidden when there is no handler. */
  selectedSubjects?: ReadonlySet<string>
  onToggleSubject?: (subject: string) => void
}

const structuredTableSortingFn: SortingFn<StructuredProjectionTableRow> = (left, right, columnId) => {
  return compareStructuredProjectionTableRows(left.original, right.original, columnId)
}

function openSubjectCard(projection: StructuredTableProjection, documentUri: string, subject: string) {
  useCardDialog.getState().open({
    uri: expandRdfIri(subject, documentUri, projection.prefixes),
    siblings: projectCardSubjectUris(projection, documentUri),
    from: 'table',
  })
}

/** R6 K2 "+ 卡片": an empty card popup whose title becomes the new row's name. */
export function openStructuredNewCard(
  projection: StructuredTableProjection,
  documentUri: string,
  createSubjectByName: (name: string) => Promise<StructuredCardCreationResult>,
) {
  useCardDialog.getState().open({
    uri: `${documentUri}#new-card`,
    from: 'table',
    draft: {
      create: async (title) => {
        const created = await createSubjectByName(title)
        if (created.kind === 'created') {
          const uri = expandRdfIri(created.subject, documentUri, projection.prefixes)
          return { kind: 'created', uri, siblings: [...projectCardSubjectUris(projection, documentUri), uri] }
        }
        if (created.kind === 'rejected' && created.reason === 'duplicate-subject') return { kind: 'rejected', reason: 'duplicate' }
        if (created.kind === 'rejected' && created.reason === 'empty-subject') return { kind: 'rejected', reason: 'empty' }
        return { kind: 'rejected', reason: 'unavailable' }
      },
    },
  })
}

export function openStructuredSubjectCard(projection: StructuredTableProjection, documentUri: string, subject: string) {
  openSubjectCard(projection, documentUri, subject)
}

/**
 * Header components keep their identity across column rebuilds, so an open column menu is not torn
 * down (and re-opened closed) whenever the table re-reads its data; only what they render is updated.
 */
export type StructuredHeaderCache = {
  renderers: Map<string, () => ReactNode>
  components: Map<string, () => ReactNode>
}

export function createStructuredHeaderCache(): StructuredHeaderCache {
  return { renderers: new Map(), components: new Map() }
}

function stableHeader(cache: StructuredHeaderCache | undefined, id: string, render: () => ReactNode) {
  if (!cache) return render
  cache.renderers.set(id, render)
  let component = cache.components.get(id)
  if (!component) {
    component = () => cache.renderers.get(id)?.() ?? null
    cache.components.set(id, component)
  }
  return component
}

export function buildStructuredProjectionTableColumns({
  headerCache,
  columnMenu,
  aiCellDots,
  onUndoAiCell,
  onSeenAiCell,
  selectedSubjects,
  onToggleSubject,
  activeEnumCell,
  activeRelationCell,
  activeTextCell,
  addEnumOption,
  approvePendingPredicateProposal,
  availablePredicates,
  classScope,
  closeActiveCellPopover,
  commitRelationCell,
  commitTextCell,
  createPendingPredicateProposal,
  currentPodRootUri,
  discardCellDraft,
  discardPendingPredicateProposal,
  documentUri,
  editable,
  enumSearch,
  getCellWriteState,
  getEnumOptionsForPredicate,
  getPredicateDefinition,
  onDiscardVocabTermProposal,
  onOpenEnumOptionDefinition,
  onOpenPredicateDefinition,
  onOpenSubjectResource,
  onOpenVocabTermProposal,
  onSelectExistingPredicate,
  onSort,
  openRelationValue,
  confirmedLabelByPredicate,
  pendingProposalByPredicate,
  popoverPlacement,
  projection,
  resolveEnumOptionTermUri,
  reviewableVocabProposals,
  shapeWarningByCell,
  showNamespaces,
  sortDirection,
  sortKey,
  startCellEdit,
  tableRows,
  targetVocabUri,
  updateActiveRelationCellValue,
  updateActiveTextCellValue,
  updateEnumSearch,
  visiblePredicates,
  vocabDefinitionIndex,
  removeEnumOption,
}: StructuredProjectionTableColumnsInput): ColumnDef<StructuredProjectionTableRow>[] {
  return [
    {
      id: 'subject',
      accessorFn: (row) => row.subject,
      size: 124,
      sortingFn: structuredTableSortingFn,
      meta: {
        label: '名称',
        resizable: true,
        cellLabel: (row: StructuredProjectionTableRow) => projectStructuredSubjectCellChrome({
          documentUri,
          projection,
          row,
          rowIndex: 0,
        }).displayLabel,
      },
      header: stableHeader(headerCache, 'subject', () => (
        columnMenu ? (
          <StructuredColumnHeaderCell
            isNameColumn
            editable={editable}
            label={columnMenu.labels.subject ?? '名称'}
            predicate="subject"
            sort={sortKey === 'subject' ? sortDirection ?? 'asc' : null}
            sortIcon={<StructuredProjectionSortIcon columnKey="subject" sortKey={sortKey} sortDirection={sortDirection} />}
            termIsEditable={false}
            typeLabel="text"
            actions={{
              filter: findStructuredColumnFilter(columnMenu.filters, STRUCTURED_SUBJECT_FILTER_KEY),
              filterValues: [],
              onFilterChange: (filter) => columnMenu.onFilterChange?.(STRUCTURED_SUBJECT_FILTER_KEY, filter),
              onOpenFilterDialog: () => columnMenu.onOpenDialog?.('filter', STRUCTURED_SUBJECT_FILTER_KEY),
              onSort: (direction) => columnMenu.onSortDirection?.('subject', direction),
            }}
          />
        ) : (
          <button className="flex items-center gap-1 hover:text-foreground" onClick={() => onSort?.('subject')}>
            名称 <StructuredProjectionSortIcon columnKey="subject" sortKey={sortKey} sortDirection={sortDirection} />
          </button>
        )
      )),
      cell: ({ row }) => {
        const subjectChrome = projectStructuredSubjectCellChrome({
          documentUri,
          projection,
          row: row.original,
          rowIndex: row.index,
        })
        return (
          <StructuredRowLeading
            label={subjectChrome.displayLabel}
            selectable={!!onToggleSubject && !subjectChrome.pending}
            selected={!!selectedSubjects?.has(row.original.subject)}
            onToggleSelected={() => onToggleSubject?.(row.original.subject)}
          >
            <StructuredSubjectCell
              subject={subjectChrome.subject}
              displayLabel={subjectChrome.displayLabel}
              rowIndex={subjectChrome.rowIndex}
              pending={subjectChrome.pending}
              pendingMarker={subjectChrome.pendingMarker}
              openTarget={subjectChrome.openTarget}
              openAffordance={subjectChrome.openAffordance}
              onOpenSubject={onOpenSubjectResource}
              onOpenCard={() => openSubjectCard(projection, documentUri, row.original.subject)}
            />
          </StructuredRowLeading>
        )
      },
    },
    ...visiblePredicates.map<ColumnDef<StructuredProjectionTableRow>>((predicate) => {
      const proposal = pendingProposalByPredicate.get(predicate)
      const definition = getPredicateDefinition(predicate)
      const columnModel = projectStructuredPredicateHeaderColumnModel({
        predicate,
        definition,
        projection,
        proposal,
        showNamespaces,
      })
      return {
        id: predicate,
        accessorFn: (row) => (row.cells[predicate] ?? []).join(' '),
        size: 128,
        sortingFn: structuredTableSortingFn,
        header: stableHeader(headerCache, predicate, () => (
          <StructuredPredicateColumnHeader
            predicate={predicate}
            proposal={proposal}
            showNamespaces={showNamespaces}
            observedValues={columnModel.observedValues}
            definition={definition}
            editable={editable}
            labelOverride={columnMenu?.labels[predicate]}
            sort={sortKey === predicate ? sortDirection ?? 'asc' : null}
            termIsEditable={columnMenu?.canChangeType?.(predicate) ?? false}
            sortIcon={(
              <StructuredProjectionSortIcon columnKey={predicate} sortKey={sortKey} sortDirection={sortDirection} />
            )}
            actions={{
              filter: columnMenu ? findStructuredColumnFilter(columnMenu.filters, predicate) : undefined,
              filterValues: columnMenu
                ? collectStructuredColumnFilterValues(
                  columnMenu.getValueRows(),
                  predicate,
                  getEnumOptionsForPredicate(predicate, columnModel.observedValues),
                )
                : [],
              onFilterChange: (filter) => columnMenu?.onFilterChange?.(predicate, filter),
              onSort: (direction) => (columnMenu?.onSortDirection ? columnMenu.onSortDirection(predicate, direction) : onSort?.(predicate)),
              onOpenFilterDialog: () => columnMenu?.onOpenDialog?.('filter', predicate),
              onRename: columnMenu?.onOpenDialog ? () => columnMenu.onOpenDialog?.('rename', predicate) : undefined,
              onChangeType: columnMenu?.onOpenDialog ? () => columnMenu.onOpenDialog?.('type', predicate) : undefined,
              onHide: columnMenu?.onHide ? () => columnMenu.onHide?.(predicate, columnMenu.labels[predicate] ?? columnModel.label) : undefined,
              onRemove: columnMenu?.onOpenDialog ? () => columnMenu.onOpenDialog?.('remove', predicate) : undefined,
              onOpenDefinition: onOpenPredicateDefinition ? () => onOpenPredicateDefinition(predicate) : undefined,
            }}
            onApprove={() => approvePendingPredicateProposal(predicate)}
            onDiscard={() => discardPendingPredicateProposal(predicate)}
            onOpenVocabTermProposal={onOpenVocabTermProposal}
          />
        )),
        cell: ({ row }) => {
          const cellChrome = projectStructuredPredicateCellChrome({
            activeEnumCell,
            activeRelationCell,
            activeTextCell,
            cellWriteState: getCellWriteState(row.original.subject, predicate),
            documentUri,
            predicate,
            // Cells are named after the column's name ("状态"), not its address ("p-ae49e298").
            proposal: proposal ?? confirmedLabelByPredicate?.get(predicate) ?? (definition?.label ? { label: definition.label } : undefined),
            row: row.original,
            shapeWarningByCell,
          })
          const shapeWarningControl = (
            <StructuredPredicateCellShapeWarning warning={cellChrome.shapeWarning} />
          )
          const pendingWriteControl = (hasPendingProposal = cellChrome.hasCellWriteProposal) => (
            <StructuredPredicateCellPendingWriteControl
              enabled={hasPendingProposal}
              fallbackPredicateLabel={cellChrome.predicateLabel}
              fallbackSubject={row.original.subject}
              pendingWrite={cellChrome.pendingWrite}
              onDiscardPendingWrite={() => discardCellDraft(row.original.subject, predicate)}
            />
          )

          if (cellChrome.hasActiveEditor) return (
            <StructuredPredicateActiveCell
              activeEnumCell={cellChrome.activeEnumCell}
              activeRelationCell={cellChrome.activeRelationCell}
              activeTextCell={cellChrome.activeTextCell}
              cellProposalButton={pendingWriteControl}
              closeActiveCellPopover={closeActiveCellPopover}
              documentUri={documentUri}
              enumSearch={enumSearch}
              getEnumOptionsForPredicate={getEnumOptionsForPredicate}
              hasCellWriteProposal={cellChrome.hasCellWriteProposal}
              predicate={predicate}
              predicateLabel={cellChrome.predicateLabel}
              popoverPlacement={popoverPlacement}
              projection={projection}
              resolveEnumOptionTermUri={resolveEnumOptionTermUri}
              reviewableVocabProposals={reviewableVocabProposals}
              rowSubject={row.original.subject}
              shapeWarningIndicator={shapeWarningControl}
              tableRows={tableRows}
              updateActiveRelationCellValue={updateActiveRelationCellValue}
              updateActiveTextCellValue={updateActiveTextCellValue}
              updateEnumSearch={updateEnumSearch}
              values={cellChrome.values}
              onAddEnumOption={addEnumOption}
              onCancelCellDraft={discardCellDraft}
              onCommitRelationCell={commitRelationCell}
              onCommitTextCell={commitTextCell}
              onDiscardVocabTermProposal={onDiscardVocabTermProposal}
              onOpenEnumOptionDefinition={onOpenEnumOptionDefinition}
              onOpenRelationValue={openRelationValue}
              onOpenVocabTermProposal={onOpenVocabTermProposal}
              onRemoveEnumOption={removeEnumOption}
            />
          )

          return (
            <StructuredPredicateStaticCell
              booleanTrailing={shapeWarningControl}
              definition={definition}
              documentUri={documentUri}
              editable={editable}
              predicate={predicate}
              proposals={reviewableVocabProposals}
              values={cellChrome.values}
              trailing={(
                <StructuredPredicateCellTrailing
                  pendingWrite={cellChrome.pendingWrite}
                  shapeWarning={cellChrome.shapeWarning}
                  onDiscardPendingWrite={() => discardCellDraft(row.original.subject, predicate)}
                  aiChangeDot={(() => {
                    const change = aiCellDots?.get(aiCellKey(
                      expandRdfIri(row.original.subject, documentUri, projection.prefixes),
                      expandRdfIri(predicate, documentUri, projection.prefixes),
                    ))
                    return change && onUndoAiCell && onSeenAiCell
                      ? <StructuredAiCellDot change={change} onUndo={onUndoAiCell} onSeen={onSeenAiCell} />
                      : null
                  })()}
                />
              )}
              onOpenRelationValue={openRelationValue}
              onToggleBoolean={() => startCellEdit(row.original, predicate)}
            />
          )
        },
        meta: {
          label: columnModel.actionLabel,
          resizable: true,
        },
      }
    }),
    ...(editable ? [{
      id: '__addPredicate',
      size: 88,
      header: () => (
        <StructuredAddPredicateColumnHeader
          documentUri={documentUri}
          availablePredicates={availablePredicates}
          vocabDefinitionIndex={vocabDefinitionIndex}
          showNamespaces={showNamespaces}
          classScope={classScope}
          currentPodRootUri={currentPodRootUri}
          targetVocabUri={targetVocabUri}
          onCreate={createPendingPredicateProposal}
          onSelectExisting={onSelectExistingPredicate}
        />
      ),
      cell: () => <span className="text-muted-foreground/50">-</span>,
    } satisfies ColumnDef<StructuredProjectionTableRow>] : []),
  ]
}
