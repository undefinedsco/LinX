import { useEffect, useMemo, useState } from 'react'

import { usePendingSourceUpdateProposals } from '../../data/queries'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  createStructuredSourceUpdateWorkflowState,
  projectStructuredSourceUpdateWorkflowModel,
  projectStructuredSourceUpdateWorkflowReset,
  projectStructuredSourceUpdateWorkflowSourceUpdatesOnly,
} from './structured-source-update-workflow-model'

export function useStructuredSourceUpdateWorkflowController({
  documentUri,
  projection,
  structuredWritesSupported,
}: {
  documentUri: string
  projection: StructuredTableProjection
  structuredWritesSupported: boolean
}) {
  const [sourceUpdateWorkflowState, setSourceUpdateWorkflowState] = useState(createStructuredSourceUpdateWorkflowState)
  const {
    sourceUpdateProposalsBySubject,
    sourceUpdatesOnly,
  } = sourceUpdateWorkflowState
  const pendingSourceUpdateProposalsQuery = usePendingSourceUpdateProposals(documentUri, structuredWritesSupported)
  const {
    resourceUpdateFilteredProjection,
    resourceUpdateSubjects,
  } = useMemo(
    () => projectStructuredSourceUpdateWorkflowModel({
      localProposalsBySubject: sourceUpdateProposalsBySubject,
      pendingProposals: pendingSourceUpdateProposalsQuery.data ?? [],
      projection,
      sourceUpdatesOnly,
    }),
    [pendingSourceUpdateProposalsQuery.data, projection, sourceUpdateProposalsBySubject, sourceUpdatesOnly],
  )

  useEffect(() => {
    setSourceUpdateWorkflowState((current) => projectStructuredSourceUpdateWorkflowReset(current))
  }, [documentUri])

  const setSourceUpdatesOnly = (nextSourceUpdatesOnly: boolean) => {
    setSourceUpdateWorkflowState((current) => projectStructuredSourceUpdateWorkflowSourceUpdatesOnly({
      current,
      sourceUpdatesOnly: nextSourceUpdatesOnly,
    }))
  }

  return {
    resourceUpdateFilteredProjection,
    resourceUpdateSubjects,
    setSourceUpdatesOnly,
    sourceUpdateProposalsBySubject,
    sourceUpdatesOnly,
  }
}
