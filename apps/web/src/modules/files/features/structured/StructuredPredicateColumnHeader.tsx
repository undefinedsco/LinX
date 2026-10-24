import type { ReactNode } from 'react'
import type {
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import type { PredicateDefinitionDraft } from '../../domain/structured/structured-predicate-draft'
import { AddPredicateMenu } from './AddPredicateMenu'
import { StructuredAiColumnHeaderCell } from './StructuredAiColumnHeaderCell'
import { projectStructuredAiColumnHeaderChrome } from './structured-ai-column-header-model'
import { StructuredPendingPredicateHeaderCell } from './StructuredTableCellPrimitives'
import {
  StructuredColumnHeaderCell,
  type StructuredColumnHeaderActions,
} from './StructuredColumnHeaderCell'
import type { StructuredColumnSortState } from './structured-column-header-menu-model'
import {
  projectStructuredPredicateColumnHeader,
  projectStructuredPendingPredicateHeaderChrome,
  type StructuredPredicateColumnProposal,
} from './structured-predicate-column-header-model'

export type { StructuredPredicateColumnProposal } from './structured-predicate-column-header-model'

export function StructuredPredicateColumnHeader({
  actions,
  definition,
  editable = false,
  labelOverride,
  observedValues,
  onApprove,
  onDiscard,
  onOpenVocabTermProposal,
  predicate,
  proposal,
  showNamespaces = false,
  sort = null,
  sortIcon,
  termIsEditable = false,
}: {
  /** What the column's menu can do (K6d); the menu is the header of every ordinary column. */
  actions: StructuredColumnHeaderActions
  definition?: StructuredVocabPredicateDefinition
  editable?: boolean
  /** The name the person gave this column in this table. */
  labelOverride?: string
  observedValues: string[]
  onApprove?: () => void
  onDiscard: () => void
  onOpenVocabTermProposal?: (proposal: VocabTermProposal) => void
  predicate: string
  proposal?: StructuredPredicateColumnProposal
  showNamespaces?: boolean
  sort?: StructuredColumnSortState
  sortIcon: ReactNode
  termIsEditable?: boolean
}) {
  const header = projectStructuredPredicateColumnHeader({
    definition,
    observedValues,
    predicate,
    proposal,
    showNamespaces,
  })

  if (header.kind === 'pending' && header.aiColumn) {
    return (
      <StructuredAiColumnHeaderCell
        chrome={projectStructuredAiColumnHeaderChrome(header.aiColumn)}
        displayLabel={header.normalizedLabel}
        type={header.type}
        onConfirm={() => onApprove?.()}
        onRemove={onDiscard}
      />
    )
  }

  if (header.kind === 'pending') {
    return (
      <StructuredPendingPredicateHeaderCell
        chrome={projectStructuredPendingPredicateHeaderChrome({
          hasVocabProposal: Boolean(header.vocabProposal),
          normalizedLabel: header.normalizedLabel,
        })}
        displayLabel={header.displayLabel}
        proposalUri={header.proposalUri}
        predicateUri={header.predicateUri}
        type={header.type}
        description={header.description}
        ruleText={header.ruleText}
        statusLabel={header.statusLabel}
        vocabProposal={header.vocabProposal}
        onSubmit={header.submitInline ? onApprove : undefined}
        onOpenProposal={header.openableVocabProposal
          ? () => header.openableVocabProposal && onOpenVocabTermProposal?.(header.openableVocabProposal)
          : undefined}
        onDiscard={onDiscard}
      />
    )
  }

  return (
    <StructuredColumnHeaderCell
      actions={actions}
      description={definition?.description || undefined}
      editable={editable}
      label={labelOverride || header.normalizedLabel}
      predicate={header.predicate}
      sort={sort}
      sortIcon={sortIcon}
      termIsEditable={termIsEditable}
      typeLabel={header.typeLabel}
    />
  )
}

export function StructuredAddPredicateColumnHeader({
  availablePredicates,
  classScope,
  currentPodRootUri,
  documentUri,
  onCreate,
  onSelectExisting,
  showNamespaces,
  targetVocabUri,
  vocabDefinitionIndex,
}: {
  availablePredicates: readonly string[]
  classScope?: string | null
  currentPodRootUri?: string | null
  documentUri: string
  onCreate: (draft: PredicateDefinitionDraft) => void
  onSelectExisting?: (predicate: string) => void
  showNamespaces: boolean
  targetVocabUri?: string | null
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
}) {
  return (
    <AddPredicateMenu
      documentUri={documentUri}
      predicates={[...availablePredicates]}
      vocabDefinitionIndex={vocabDefinitionIndex}
      showNamespaces={showNamespaces}
      classScope={classScope}
      namespaceRegistry={vocabDefinitionIndex?.namespaces}
      currentPodRootUri={currentPodRootUri}
      targetVocabUri={targetVocabUri}
      onCreate={onCreate}
      onSelectExisting={onSelectExisting}
    />
  )
}
