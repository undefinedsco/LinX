import type { PredicateDefinition, PredicateKind, SourceReviewSample, VocabTermState } from './files-types'

export type SourceReviewState = 'pending' | 'accepted' | 'kept'
export type ProposalResourceKind = 'class' | 'predicate' | 'enum-option' | 'source-update'
export type ProposalResourceAction = 'create' | 'approve' | 'discard' | 'accept' | 'keep'

export interface ProposalResourceRecord {
  id: string
  kind: ProposalResourceKind
  action: ProposalResourceAction
  target: string
  uri: string
  scope: string
}

const vocabBaseUri = '/.vocab/terms.ttl'

export function proposalTermSlug(value: string) {
  const words = value.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words
    .map((word, index) => {
      const lowered = word.toLowerCase()
      return index === 0 ? lowered : `${lowered.charAt(0).toUpperCase()}${lowered.slice(1)}`
    })
    .join('')
}

export function proposalKeyForPredicate(className: string, predicateId: string) {
  return `predicate:${className}:${predicateId}`
}

export function proposalKeyForEnumOption(className: string, predicateId: string, option: string) {
  return `enum-option:${className}:${predicateId}:${option}`
}

export function proposalResourceUri(kind: ProposalResourceKind, target: string, action: ProposalResourceAction) {
  const slug = proposalTermSlug(`${kind} ${target} ${action}`) || `${kind}${action}`
  return `/.data/proposals/${slug}.ttl`
}

export function createProposalResourceRecord({
  action,
  kind,
  scope,
  target,
}: {
  action: ProposalResourceAction
  kind: ProposalResourceKind
  scope: string
  target: string
}): ProposalResourceRecord {
  return {
    id: `${kind}:${scope}:${target}:${action}`,
    kind,
    action,
    target,
    scope,
    uri: proposalResourceUri(kind, `${scope} ${target}`, action),
  }
}

export function appendProposalResourceRecord(current: ProposalResourceRecord[], record: ProposalResourceRecord) {
  return current.some((item) => item.id === record.id) ? current : [...current, record]
}

export function makePredicateProposalUri(className: string, name: string) {
  const classSlug = proposalTermSlug(className)
  const nameSlug = proposalTermSlug(name) || 'predicate'
  return `${vocabBaseUri}#${classSlug}${nameSlug.charAt(0).toUpperCase()}${nameSlug.slice(1)}`
}

export function createPredicateProposal({
  className,
  description,
  index,
  name,
  type,
  uri,
}: {
  className: string
  description: string
  index: number
  name: string
  type: PredicateKind
  uri?: string
}): PredicateDefinition {
  const normalizedName = name.trim() || `${className} predicate`
  const term = proposalTermSlug(`${className} ${normalizedName}`) || `predicate${index}`

  return {
    id: `udfs:${term}${index}`,
    label: `udfs:${term}${index}`,
    uri: uri?.trim() || makePredicateProposalUri(className, normalizedName),
    type,
    description,
    vocabState: 'ai-pending',
  }
}

export function enumOptionProposalUri(predicate: PredicateDefinition, option: string, predicateLocalName: string) {
  const baseUri = predicate.uri.split('#')[0] || vocabBaseUri
  const slug = proposalTermSlug(option) || 'option'
  return `${baseUri}#${proposalTermSlug(predicateLocalName)}${slug.charAt(0).toUpperCase()}${slug.slice(1)}`
}

export function approveProposalId(current: string[], id: string) {
  return current.includes(id) ? current : [...current, id]
}

export function discardProposalId(current: string[], id: string) {
  return current.includes(id) ? current : [...current, id]
}

export function proposalStateForId(
  id: string,
  baseState: VocabTermState | undefined,
  approvedIds: string[],
) {
  return approvedIds.includes(id) ? undefined : baseState
}

export function visibleDefinitionsAfterDiscard<T extends { id: string }>(
  definitions: T[],
  discardedIds: string[],
) {
  return definitions.filter((definition) => !discardedIds.includes(definition.id))
}

export function resolvePredicateProposals(
  definitions: PredicateDefinition[],
  approvedIds: string[],
  className?: string,
) {
  return definitions.map((definition) => (
    approvedIds.includes(definition.id) || (className ? approvedIds.includes(proposalKeyForPredicate(className, definition.id)) : false)
      ? { ...definition, vocabState: undefined }
      : definition
  ))
}

export function setEnumOptionProposal(
  current: Record<string, VocabTermState>,
  key: string,
  state: VocabTermState = 'ai-pending',
) {
  return { ...current, [key]: state }
}

export function clearEnumOptionProposal(current: Record<string, VocabTermState>, key: string) {
  const next = { ...current }
  delete next[key]
  return next
}

export function removeEnumOptionFromValue(value: string, predicateType: PredicateKind, option: string) {
  if (predicateType === 'multi-select') {
    return value.split(',').map((item) => item.trim()).filter((item) => item && item !== option).join(', ')
  }
  return value === option ? '' : value
}

export function sourceReviewSnapshot(review: SourceReviewSample, state: SourceReviewState) {
  const pending = state === 'pending'

  return {
    panelText: pending
      ? `${review.changedChunks} new ingest chunks · ${review.localProtectedBlocks} local edits protected`
      : state === 'accepted'
        ? `Ingest accepted · ${review.changedChunks} chunks applied`
        : `Local edits kept · ${review.localProtectedBlocks} protected blocks`,
    sourceUpdateCount: pending ? review.changedChunks : 0,
    localKeptCount: state === 'kept' ? review.localProtectedBlocks : 0,
    ingestSummary: `${review.ingestStatus} · ${review.readChunks}/${review.totalChunks} read · ${review.changedChunks} changed`,
  }
}
