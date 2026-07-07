import type { ReactNode } from 'react'
import type {
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import type { PredicateDefinitionDraft } from '../../domain/structured/structured-predicate-draft'
import { AddPredicateMenu } from './AddPredicateMenu'
import {
  StructuredPendingPredicateHeaderCell,
  StructuredPredicateHeaderCell,
} from './StructuredTableCellPrimitives'
import {
  projectStructuredDefinedPredicateHeaderChrome,
  projectStructuredPredicateColumnHeader,
  projectStructuredPendingPredicateHeaderChrome,
  type StructuredPredicateColumnProposal,
} from './structured-predicate-column-header-model'

export type { StructuredPredicateColumnProposal } from './structured-predicate-column-header-model'

export function StructuredPredicateColumnHeader({
  definition,
  observedValues,
  onApprove,
  onCanCreateVocabTermProposal,
  onCopyPredicate,
  onDiscard,
  onOpenPredicateDefinition,
  onOpenPredicateShapeRule,
  onOpenVocabTermProposal,
  predicate,
  proposal,
  sortIcon,
  onSort,
}: {
  definition?: StructuredVocabPredicateDefinition
  observedValues: string[]
  onApprove?: () => void
  onCanCreateVocabTermProposal?: boolean
  onCopyPredicate?: (predicateUri: string) => void
  onDiscard: () => void
  onOpenPredicateDefinition?: (predicateUri: string) => void
  onOpenPredicateShapeRule?: (shapeRuleUri: string) => void
  onOpenVocabTermProposal?: (proposal: VocabTermProposal) => void
  predicate: string
  proposal?: StructuredPredicateColumnProposal
  sortIcon: ReactNode
  onSort?: () => void
}) {
  const header = projectStructuredPredicateColumnHeader({
    canCreateVocabTermProposal: onCanCreateVocabTermProposal,
    definition,
    observedValues,
    predicate,
    proposal,
  })

  if (header.kind === 'pending') {
    return (
      <StructuredPendingPredicateHeaderCell
        chrome={projectStructuredPendingPredicateHeaderChrome({
          hasVocabProposal: Boolean(header.vocabProposal),
          normalizedLabel: header.normalizedLabel,
          status: header.status,
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
    <StructuredPredicateHeaderCell
      chrome={projectStructuredDefinedPredicateHeaderChrome({
        normalizedLabel: header.normalizedLabel,
        shapeRuleActions: header.shapeRuleActions,
      })}
      predicate={header.predicate}
      displayLabel={header.displayLabel}
      normalizedLabel={header.normalizedLabel}
      typeLabel={header.typeLabel}
      description={header.description}
      ruleText={header.ruleText}
      statusLabel={header.statusLabel}
      sortIcon={sortIcon}
      onSort={onSort}
      onCopyPredicate={onCopyPredicate}
      onOpenPredicate={onOpenPredicateDefinition}
      onOpenShapeRule={onOpenPredicateShapeRule}
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
