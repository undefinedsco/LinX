import { useCallback } from 'react'
import {
  createVocabTermProposal,
  type StructuredCellWriteProposal,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  localPredicateLabel,
  resolveLocalVocabTermUri,
} from '../../domain/structured/structured-table-vocab'

export function useStructuredEnumOptionProposalController({
  classScope,
  currentPodRootUri,
  documentUri,
  onCreateVocabTermProposal,
  stageCellWriteProposal,
  targetShapesUri,
  targetVocabUri,
}: {
  classScope?: string | null
  currentPodRootUri?: string | null
  documentUri: string
  onCreateVocabTermProposal?: (proposal: VocabTermProposal) => boolean | Promise<boolean>
  stageCellWriteProposal: (proposal: StructuredCellWriteProposal) => void
  targetShapesUri?: string | null
  targetVocabUri?: string | null
}) {
  const resolveEnumOptionTermUri = useCallback((label: string) => (
    resolveLocalVocabTermUri(documentUri, label, currentPodRootUri, targetVocabUri)
  ), [currentPodRootUri, documentUri, targetVocabUri])

  const stageEnumOptionVocabProposal = useCallback(({
    cellProposal,
    label,
    predicate,
    predicateUri,
  }: {
    cellProposal: StructuredCellWriteProposal
    label: string
    predicate: string
    predicateUri?: string
  }) => {
    const vocabProposal = createVocabTermProposal({
      documentUri,
      classScope: classScope ?? null,
      termUri: resolveEnumOptionTermUri(label),
      termKind: 'enum-option',
      predicate: predicateUri ?? predicate,
      label,
      valueType: 'enum-option',
      description: `Enum option for ${localPredicateLabel(predicate)}.`,
      shape: `predicate ${predicate}`,
      podRootUri: currentPodRootUri,
      targetVocabUri: targetVocabUri ?? undefined,
      targetShapesUri: targetShapesUri ?? undefined,
    })
    void Promise.resolve(onCreateVocabTermProposal?.(vocabProposal)).then((saved) => {
      if (saved) {
        stageCellWriteProposal(cellProposal)
      }
    })
  }, [classScope, currentPodRootUri, documentUri, onCreateVocabTermProposal, resolveEnumOptionTermUri, stageCellWriteProposal, targetShapesUri, targetVocabUri])

  return {
    resolveEnumOptionTermUri,
    stageEnumOptionVocabProposal,
  }
}
