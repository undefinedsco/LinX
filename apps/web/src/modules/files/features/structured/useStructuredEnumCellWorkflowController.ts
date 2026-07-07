import { useCallback } from 'react'

import type {
  StructuredCellWriteProposal,
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  planStructuredEnumOptionAdd,
  planStructuredEnumOptionRemove,
} from './structured-enum-cell-workflow-model'
import {
  projectStructuredEnumOptionLabels,
} from './structured-predicate-cell-display-model'
import {
  getStructuredProjectionTableCellValues,
  getStructuredProjectionTablePredicateValues,
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'
import type { StructuredPredicateColumnProposal } from './StructuredPredicateColumnHeader'
import { useStructuredEnumOptionProposalController } from './useStructuredEnumOptionProposalController'

type CellWriteProposalFactory = (input: {
  subject: string
  predicate: string
  nextValues: string[]
}) => StructuredCellWriteProposal

type StageCellValueChange = (input: {
  subject: string
  predicate: string
  nextValues: string[]
}) => void

export function useStructuredEnumCellWorkflowController({
  classScope,
  clearActiveEnumCell,
  createCellWriteProposal,
  currentPodRootUri,
  documentUri,
  findVisiblePendingPredicateProposal,
  getPredicateDefinition,
  onCreateVocabTermProposal,
  previousValuesForCell,
  reviewableVocabProposals,
  stageCellValueChange,
  stageCellWriteProposal,
  tableRows,
  targetShapesUri,
  targetVocabUri,
  vocabDefinitionIndex,
}: {
  classScope?: string | null
  clearActiveEnumCell: () => void
  createCellWriteProposal: CellWriteProposalFactory
  currentPodRootUri?: string | null
  documentUri: string
  findVisiblePendingPredicateProposal: (predicate: string) => StructuredPredicateColumnProposal | undefined
  getPredicateDefinition: (predicate: string) => StructuredVocabPredicateDefinition | undefined
  onCreateVocabTermProposal?: (proposal: VocabTermProposal) => boolean | Promise<boolean>
  previousValuesForCell: (subject: string, predicate: string) => string[]
  reviewableVocabProposals: readonly VocabTermProposal[]
  stageCellValueChange: StageCellValueChange
  stageCellWriteProposal: (proposal: StructuredCellWriteProposal) => void
  tableRows: readonly StructuredProjectionTableRow[]
  targetShapesUri?: string | null
  targetVocabUri?: string | null
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
}) {
  const {
    resolveEnumOptionTermUri,
    stageEnumOptionVocabProposal,
  } = useStructuredEnumOptionProposalController({
    classScope,
    currentPodRootUri,
    documentUri,
    onCreateVocabTermProposal,
    stageCellWriteProposal,
    targetShapesUri,
    targetVocabUri,
  })

  const getEnumOptionsForPredicate = useCallback((predicate: string, values: string[]) => (
    projectStructuredEnumOptionLabels({
      definitionOptionsByPredicate: vocabDefinitionIndex?.enumOptionsByPredicate,
      observedValues: values,
      pendingDefinitionOptions: findVisiblePendingPredicateProposal(predicate)?.enumOptions ?? [],
      predicate,
      proposals: reviewableVocabProposals,
    })
  ), [findVisiblePendingPredicateProposal, reviewableVocabProposals, vocabDefinitionIndex?.enumOptionsByPredicate])

  const addEnumOption = useCallback((subject: string, predicate: string, value: string) => {
    const existing = getStructuredProjectionTableCellValues({ predicate, subject, tableRows })
    const definition = getPredicateDefinition(predicate)
    const plan = planStructuredEnumOptionAdd({
      definition,
      existingValues: existing,
      knownOptions: getEnumOptionsForPredicate(predicate, getStructuredProjectionTablePredicateValues({
        predicate,
        tableRows,
      })),
      previousValues: previousValuesForCell(subject, predicate),
      value,
    })
    if (plan.kind === 'noop') {
      if (plan.reason === 'duplicate') clearActiveEnumCell()
      return
    }
    const cellProposal = createCellWriteProposal({
      subject,
      predicate,
      nextValues: plan.nextValues,
    })
    if (plan.kind === 'known-option') {
      stageCellWriteProposal(cellProposal)
      clearActiveEnumCell()
      return
    }
    stageEnumOptionVocabProposal({
      cellProposal,
      label: plan.label,
      predicate,
      predicateUri: definition?.uri,
    })
    clearActiveEnumCell()
  }, [
    clearActiveEnumCell,
    createCellWriteProposal,
    getEnumOptionsForPredicate,
    getPredicateDefinition,
    previousValuesForCell,
    stageCellWriteProposal,
    stageEnumOptionVocabProposal,
    tableRows,
  ])

  const removeEnumOption = useCallback((subject: string, predicate: string, value: string) => {
    const existing = getStructuredProjectionTableCellValues({ predicate, subject, tableRows })
    const plan = planStructuredEnumOptionRemove({
      existingValues: existing,
      value,
    })
    if (plan.kind === 'noop') return
    stageCellValueChange({
      subject,
      predicate,
      nextValues: plan.nextValues,
    })
    clearActiveEnumCell()
  }, [clearActiveEnumCell, stageCellValueChange, tableRows])

  return {
    addEnumOption,
    getEnumOptionsForPredicate,
    removeEnumOption,
    resolveEnumOptionTermUri,
  }
}
