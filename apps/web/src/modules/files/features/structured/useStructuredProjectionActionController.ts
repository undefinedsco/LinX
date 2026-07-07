import { useCallback } from 'react'

import { copyFilesText, openFilesExternalUri } from '../../app/platform-actions'
import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  resolveStructuredRelationOpenTarget,
  type StructuredSubjectOpenTarget,
} from '../../domain/structured/structured-subject-peek'

export type StructuredProjectionSubjectOpenKind = StructuredSubjectOpenTarget['kind']

type OpenSubjectResource = (
  subject: string,
  targetUri: string,
  kind: StructuredProjectionSubjectOpenKind,
) => void

export function useStructuredProjectionActionController({
  documentUri,
  onCopyPredicate,
  onOpenEnumOptionDefinition,
  onOpenPredicateDefinition,
  onOpenPredicateShapeRule,
  onOpenSubjectResource,
  onOpenVocabTermProposal,
}: {
  documentUri: string
  onCopyPredicate?: (predicateUri: string) => void
  onOpenEnumOptionDefinition?: (termUri: string) => void
  onOpenPredicateDefinition?: (predicateUri: string) => void
  onOpenPredicateShapeRule?: (shapeRuleUri: string) => void
  onOpenSubjectResource?: OpenSubjectResource
  onOpenVocabTermProposal?: (proposal: VocabTermProposal) => void
}) {
  const openEnumOptionDefinition = useCallback((termUri: string) => {
    if (onOpenEnumOptionDefinition) {
      onOpenEnumOptionDefinition(termUri)
      return
    }
    openFilesExternalUri(termUri)
  }, [onOpenEnumOptionDefinition])

  const openPredicateDefinition = useCallback((predicateUri: string) => {
    if (onOpenPredicateDefinition) {
      onOpenPredicateDefinition(predicateUri)
      return
    }
    openFilesExternalUri(predicateUri)
  }, [onOpenPredicateDefinition])

  const openPredicateShapeRule = useCallback((shapeRuleUri: string) => {
    if (onOpenPredicateShapeRule) {
      onOpenPredicateShapeRule(shapeRuleUri)
      return
    }
    openFilesExternalUri(shapeRuleUri)
  }, [onOpenPredicateShapeRule])

  const openVocabTermProposal = useCallback((proposal: VocabTermProposal) => {
    if (onOpenVocabTermProposal) {
      onOpenVocabTermProposal(proposal)
      return
    }
    openFilesExternalUri(proposal.proposalResourceUri)
  }, [onOpenVocabTermProposal])

  const copyPredicate = useCallback((predicateUri: string) => {
    if (onCopyPredicate) {
      onCopyPredicate(predicateUri)
      return
    }
    void copyFilesText(predicateUri)
  }, [onCopyPredicate])

  const openRelationValue = useCallback((normalizedValue: string, external: boolean) => {
    const openTarget = resolveStructuredRelationOpenTarget(documentUri, normalizedValue)
    if (external || openTarget?.kind === 'external') {
      openFilesExternalUri(openTarget?.targetUri ?? normalizedValue)
      return
    }
    if (openTarget && onOpenSubjectResource) {
      onOpenSubjectResource(normalizedValue, openTarget.targetUri, openTarget.kind)
    }
  }, [documentUri, onOpenSubjectResource])

  return {
    copyPredicate,
    openEnumOptionDefinition,
    openPredicateDefinition,
    openPredicateShapeRule,
    openRelationValue,
    openVocabTermProposal,
  }
}
