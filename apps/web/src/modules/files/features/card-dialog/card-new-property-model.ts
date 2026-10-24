import type { CardColumnModel } from '../../domain/card/card-dialog-model'
import {
  createPredicateDefinitionDraft,
  autoPredicateLocalName,
  PREDICATE_VALUE_TYPE_OPTIONS,
} from '../../domain/structured/structured-predicate-draft'
import type { StructuredCellEditorValueKind } from '../../domain/structured/structured-cell-editor-plan'
import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  createStructuredPendingPredicateApprovalProposal,
  createStructuredPendingPredicateColumnProposalFromDraft,
} from '../structured/structured-pending-predicate-columns-model'

export const CARD_NEW_PROPERTY_TYPES = PREDICATE_VALUE_TYPE_OPTIONS

/** The editor a new column starts with, by the kind of value the person picked for it. */
export function cardEditorKindForValueType(type: string): StructuredCellEditorValueKind {
  if (type === 'number' || type === 'date' || type === 'boolean') return type
  if (type === 'enum') return 'multi-select'
  if (type === 'relation' || type === 'url' || type === 'contact') return 'relation'
  return 'text'
}

export type CardNewPropertyPlan =
  | { ok: true; proposal: VocabTermProposal; column: CardColumnModel }
  | { ok: false; reason: 'empty' | 'duplicate' }

/**
 * "+ 属性" in a card adds a column to the table the card is a row of: the same vocabulary term the
 * table's own "+ 属性" writes, so the person's column is usable at once.
 */
export function planCardNewProperty({
  label,
  type,
  documentUri,
  classScope,
  existingPredicates,
  currentPodRootUri,
  targetVocabUri,
  targetShapesUri,
  vocabNamespaces,
}: {
  label: string
  type: string
  documentUri: string
  classScope: string | null
  existingPredicates: readonly string[]
  currentPodRootUri?: string | null
  targetVocabUri?: string | null
  targetShapesUri?: string | null
  vocabNamespaces?: ReadonlyMap<string, string>
}): CardNewPropertyPlan {
  const name = label.trim()
  if (!name) return { ok: false, reason: 'empty' }
  const draft = {
    ...createPredicateDefinitionDraft(classScope),
    label: name,
    localName: autoPredicateLocalName(name),
    type,
  }
  const column = createStructuredPendingPredicateColumnProposalFromDraft({
    currentPodRootUri,
    documentUri,
    draft,
    projectionPredicates: existingPredicates,
    targetVocabUri,
    visiblePendingPredicateProposals: [],
    vocabNamespaces,
  })
  if (!column) return { ok: false, reason: 'duplicate' }
  const proposal = createStructuredPendingPredicateApprovalProposal({
    classScope,
    currentPodRootUri,
    documentUri,
    proposal: column,
    targetShapesUri,
    targetVocabUri,
  })
  const kind = cardEditorKindForValueType(type)
  return {
    ok: true,
    proposal,
    column: {
      predicate: column.id,
      label: name,
      valueTokens: [],
      displayValues: [],
      isResource: false,
      links: [],
      editorKind: kind,
      editorValues: kind === 'boolean' ? ['false'] : [],
      options: [],
    },
  }
}
