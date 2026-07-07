import { useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import {
  useCreateStructuredCellChangeProposal,
  useFilesCurrentPodRootUri,
  usePendingStructuredCellChangeProposals,
} from '../../data/queries'
import type { DetailMetaPredicateRelation } from './file-detail-metadata-panels-model'
import {
  buildDetailPendingMetaPredicateProposalMap,
  createDetailMetaPredicateEditorState,
  detailReviewStatusOptions,
  detailTagOptions,
  hydrateDetailMetaPredicateValues,
  projectDetailMetaPredicateEditorDraft,
  projectDetailMetaPredicateEditorHydration,
  projectDetailMetaPredicateEditorProposalStatus,
  resolveDetailMetaPredicateProposalStatus,
  shouldCreateDetailMetaPredicateProposal,
  splitDetailTagValue,
  type DetailMetaPredicateKey,
  type DetailMetaPredicateProposalStatus,
  type DetailPendingMetaPredicateProposalMap,
} from '../../domain/detail/detail-metadata-editor-model'
import { createStructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'

type CommitMetaPredicateInput = {
  predicateKey: DetailMetaPredicateKey
  predicate: string
  previousValues: string[]
  nextValues: string[]
}

type DetailMetaPredicateControllerOptions = {
  labelPrefix: 'Card' | 'File'
  documentUri: string
  subject: string
  titleValue: string
  titlePreviousValues: string[]
  tagsValue?: string
  tagsPreviousValues: string[]
  reviewStatusValue?: string
  reviewStatusPreviousValues: string[]
  relation?: DetailMetaPredicateRelation
}

export function useDetailMetaPredicateController({
  labelPrefix,
  documentUri,
  subject,
  titleValue,
  titlePreviousValues,
  tagsValue = '',
  tagsPreviousValues,
  reviewStatusValue = '',
  reviewStatusPreviousValues,
  relation,
}: DetailMetaPredicateControllerOptions) {
  const { toast } = useToast()
  const currentPodRootUri = useFilesCurrentPodRootUri()
  const createCellProposal = useCreateStructuredCellChangeProposal()
  const pendingCellProposalsQuery = usePendingStructuredCellChangeProposals(documentUri, true)
  const pendingMetaPredicateProposals = useMemo<DetailPendingMetaPredicateProposalMap>(() => {
    return buildDetailPendingMetaPredicateProposalMap({
      proposals: pendingCellProposalsQuery.data ?? [],
      documentUri,
      subject,
      relationPredicate: relation?.predicate,
    })
  }, [documentUri, pendingCellProposalsQuery.data, relation?.predicate, subject])
  const hydratedMetaPredicateValues = useMemo(() => hydrateDetailMetaPredicateValues({
    pendingProposals: pendingMetaPredicateProposals,
    values: {
      title: titleValue,
      reviewStatus: reviewStatusValue,
      tags: tagsValue,
      relation: relation?.value ?? '',
    },
  }), [
    pendingMetaPredicateProposals,
    relation?.value,
    reviewStatusValue,
    tagsValue,
    titleValue,
  ])
  const metaPredicateContextKey = `${documentUri}\n${subject}`
  const [metaPredicateEditorState, setMetaPredicateEditorState] = useState(() => (
    createDetailMetaPredicateEditorState({
      contextKey: metaPredicateContextKey,
      hydratedValues: hydratedMetaPredicateValues,
    })
  ))

  useEffect(() => {
    setMetaPredicateEditorState((current) => projectDetailMetaPredicateEditorHydration({
      current,
      contextKey: metaPredicateContextKey,
      hydratedValues: hydratedMetaPredicateValues,
    }))
  }, [
    hydratedMetaPredicateValues.relation,
    hydratedMetaPredicateValues.reviewStatus,
    hydratedMetaPredicateValues.tags,
    hydratedMetaPredicateValues.title,
    metaPredicateContextKey,
  ])

  const metaPredicateStatus = (predicateKey: DetailMetaPredicateKey): DetailMetaPredicateProposalStatus | undefined => {
    return resolveDetailMetaPredicateProposalStatus({
      localStatuses: metaPredicateEditorState.proposalStatuses,
      pendingProposals: pendingMetaPredicateProposals,
      predicateKey,
    })
  }

  const patchMetaPredicateDraft = (predicateKey: DetailMetaPredicateKey, nextValues: string[]) => {
    setMetaPredicateEditorState((current) => projectDetailMetaPredicateEditorDraft({
      current,
      predicateKey,
      nextValues,
    }))
  }

  const patchMetaPredicateStatus = (
    predicateKey: DetailMetaPredicateKey,
    status?: DetailMetaPredicateProposalStatus,
  ) => {
    setMetaPredicateEditorState((current) => projectDetailMetaPredicateEditorProposalStatus({
      current,
      predicateKey,
      status,
    }))
  }

  const commitMetaPredicate = async ({
    predicateKey,
    predicate,
    previousValues,
    nextValues,
  }: CommitMetaPredicateInput) => {
    const hydratedProposal = pendingMetaPredicateProposals[predicateKey]
    if (!shouldCreateDetailMetaPredicateProposal({
      mutationPending: createCellProposal.isPending,
      previousValues,
      nextValues,
      hydratedProposal,
    })) return
    patchMetaPredicateStatus(predicateKey, undefined)
    try {
      await createCellProposal.mutateAsync(createStructuredCellChangeProposal({
        documentUri,
        subject,
        predicate,
        previousValues,
        nextValues,
        reason: 'Card meta predicate change staged from Files detail sheet.',
        podRootUri: currentPodRootUri,
      }))
      patchMetaPredicateStatus(predicateKey, 'pending')
      toast({ description: 'meta predicate 更改已提交审核' })
    } catch (error) {
      patchMetaPredicateStatus(predicateKey, 'error')
      const description = error instanceof Error ? error.message : 'meta predicate 更改提交审核失败'
      toast({ description, variant: 'destructive' })
    }
  }

  const { title, reviewStatus, tags, relation: relationValue } = metaPredicateEditorState.values
  const reviewStatusOptions = detailReviewStatusOptions(reviewStatus)
  const tagOptions = detailTagOptions(tags, tagsPreviousValues)

  return {
    title: {
      status: metaPredicateStatus('title'),
      statusLabel: `${labelPrefix} title meta predicate`,
      values: title ? [title] : [],
      commit: (nextValues: string[]) => {
        patchMetaPredicateDraft('title', nextValues)
        void commitMetaPredicate({
          predicateKey: 'title',
          predicate: 'rdfs:label',
          previousValues: titlePreviousValues,
          nextValues,
        })
      },
    },
    reviewStatus: {
      status: metaPredicateStatus('reviewStatus'),
      statusLabel: `${labelPrefix} review status meta predicate`,
      values: reviewStatus ? [reviewStatus] : [],
      options: reviewStatusOptions,
      commitStructured: (nextValues: string[]) => {
        patchMetaPredicateDraft('reviewStatus', nextValues)
        void commitMetaPredicate({
          predicateKey: 'reviewStatus',
          predicate: 'udfs:reviewStatus',
          previousValues: reviewStatusPreviousValues,
          nextValues,
        })
      },
    },
    tags: {
      status: metaPredicateStatus('tags'),
      statusLabel: `${labelPrefix} tags meta predicate`,
      values: splitDetailTagValue(tags),
      options: tagOptions,
      commitStructured: (nextValues: string[]) => {
        patchMetaPredicateDraft('tags', nextValues)
        void commitMetaPredicate({
          predicateKey: 'tags',
          predicate: 'udfs:tags',
          previousValues: tagsPreviousValues,
          nextValues,
        })
      },
    },
    relation: relation ? {
      label: relation.label,
      ariaLabel: relation.ariaLabel,
      status: metaPredicateStatus('relation'),
      values: relationValue ? [relationValue] : [],
      commitStructured: (nextValues: string[]) => {
        patchMetaPredicateDraft('relation', nextValues)
        void commitMetaPredicate({
          predicateKey: 'relation',
          predicate: relation.predicate,
          previousValues: relation.previousValues,
          nextValues,
        })
      },
    } : null,
  }
}
