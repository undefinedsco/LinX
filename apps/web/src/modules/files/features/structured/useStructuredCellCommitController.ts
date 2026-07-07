import { useCallback } from 'react'
import {
  createStructuredCellWriteProposal,
  type StructuredCellWriteProposal,
  type StructuredTableProjection,
} from '../../domain/structured/structured-table'
import { getStructuredProjectionCellOriginalValues } from './structured-projection-table-model'

type StageCellWriteProposal = (proposal: StructuredCellWriteProposal) => void
type VocabTermProposalResourceResolver = (predicate: string) => string | undefined

function noopStageCellWriteProposal(_proposal: StructuredCellWriteProposal) {
  return undefined
}

function noVocabTermProposalResourceUri() {
  return undefined
}

export function useStructuredCellCommitController({
  documentUri,
  projectionRows,
  stageCellWriteProposal = noopStageCellWriteProposal,
  vocabTermProposalResourceUriForPredicate = noVocabTermProposalResourceUri,
}: {
  documentUri: string
  projectionRows: StructuredTableProjection['rows']
  stageCellWriteProposal?: StageCellWriteProposal
  vocabTermProposalResourceUriForPredicate?: VocabTermProposalResourceResolver
}) {
  const previousValuesForCell = useCallback((subject: string, predicate: string) => (
    getStructuredProjectionCellOriginalValues({
      predicate,
      projection: { rows: projectionRows },
      subject,
    })
  ), [projectionRows])

  const createCellWriteProposal = useCallback(({
    subject,
    predicate,
    nextValues,
  }: {
    subject: string
    predicate: string
    nextValues: string[]
  }) => createStructuredCellWriteProposal({
    documentUri,
    subject,
    predicate,
    vocabTermProposalResourceUri: vocabTermProposalResourceUriForPredicate(predicate),
    previousValues: previousValuesForCell(subject, predicate),
    nextValues,
  }), [documentUri, previousValuesForCell, vocabTermProposalResourceUriForPredicate])

  const stageCellValueChange = useCallback((input: {
    subject: string
    predicate: string
    nextValues: string[]
  }) => {
    stageCellWriteProposal(createCellWriteProposal(input))
  }, [createCellWriteProposal, stageCellWriteProposal])

  return {
    createCellWriteProposal,
    previousValuesForCell,
    stageCellValueChange,
  }
}
