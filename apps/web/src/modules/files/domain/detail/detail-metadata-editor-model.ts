import type { StructuredCellChangeProposal } from '../proposal/structured-cell-approval-model'

export const DETAIL_REVIEW_STATUS_OPTIONS = ['Draft', 'Ready', 'Published'] as const

export type DetailMetaPredicateKey = 'title' | 'reviewStatus' | 'tags' | 'relation'
export type DetailMetaPredicateProposalStatus = 'pending' | 'error'
export type DetailMetaPredicateProposalStatusMap = Partial<Record<DetailMetaPredicateKey, DetailMetaPredicateProposalStatus>>
export type DetailPendingMetaPredicateProposalMap = Partial<Record<DetailMetaPredicateKey, StructuredCellChangeProposal>>

export interface DetailMetaPredicateValues {
  title: string
  reviewStatus: string
  tags: string
  relation: string
}

export interface DetailMetaPredicateEditorState {
  contextKey: string
  values: DetailMetaPredicateValues
  hydratedValues: DetailMetaPredicateValues
  proposalStatuses: DetailMetaPredicateProposalStatusMap
}

type DetailMetaPredicateValueKey = keyof DetailMetaPredicateValues

export function sourceLinkedCardBodyUri(descriptorUri: string) {
  if (descriptorUri.endsWith('.card.ttl')) return `${descriptorUri.slice(0, -'.card.ttl'.length)}.md`
  return `${descriptorUri}.body.md`
}

export function splitDetailTagValue(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function literalDetailCellValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function iriDetailCellValue(value: string) {
  const trimmed = value.trim()
  return trimmed ? [`<${trimmed}>`] : []
}

function unescapeDetailLiteralValue(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

export function displayDetailLiteralCellValue(value: string | undefined) {
  if (!value) return ''
  const literal = value.match(/^"((?:\\.|[^"\\])*)"/)
  return literal ? unescapeDetailLiteralValue(literal[1] ?? '') : value
}

export function displayDetailIriCellValue(value: string | undefined) {
  if (!value) return ''
  const trimmed = value.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1)
  return displayDetailLiteralCellValue(trimmed)
}

export function sameDetailCellValues(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function latestDetailPendingProposal(
  proposals: StructuredCellChangeProposal[],
  documentUri: string,
  subject: string,
  predicate: string,
) {
  const matches = proposals
    .filter((proposal) => (
      proposal.documentUri === documentUri
      && proposal.subject === subject
      && proposal.predicate === predicate
    ))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  return matches[matches.length - 1]
}

export function buildDetailPendingMetaPredicateProposalMap({
  proposals,
  documentUri,
  subject,
  relationPredicate,
}: {
  proposals: StructuredCellChangeProposal[]
  documentUri: string
  subject: string
  relationPredicate?: string
}): DetailPendingMetaPredicateProposalMap {
  return {
    title: latestDetailPendingProposal(proposals, documentUri, subject, 'rdfs:label'),
    reviewStatus: latestDetailPendingProposal(proposals, documentUri, subject, 'udfs:reviewStatus'),
    tags: latestDetailPendingProposal(proposals, documentUri, subject, 'udfs:tags'),
    relation: relationPredicate
      ? latestDetailPendingProposal(proposals, documentUri, subject, relationPredicate)
      : undefined,
  }
}

export function hydrateDetailMetaPredicateValues({
  pendingProposals,
  values,
}: {
  pendingProposals: DetailPendingMetaPredicateProposalMap
  values: DetailMetaPredicateValues
}): DetailMetaPredicateValues {
  return {
    title: pendingProposals.title
      ? displayDetailLiteralCellValue(pendingProposals.title.nextValues[0])
      : values.title,
    reviewStatus: pendingProposals.reviewStatus
      ? displayDetailLiteralCellValue(pendingProposals.reviewStatus.nextValues[0])
      : values.reviewStatus,
    tags: pendingProposals.tags
      ? pendingProposals.tags.nextValues.map(displayDetailLiteralCellValue).filter(Boolean).join(', ')
      : values.tags,
    relation: pendingProposals.relation
      ? displayDetailIriCellValue(pendingProposals.relation.nextValues[0])
      : values.relation,
  }
}

export function createDetailMetaPredicateEditorState({
  contextKey,
  hydratedValues,
}: {
  contextKey: string
  hydratedValues: DetailMetaPredicateValues
}): DetailMetaPredicateEditorState {
  return {
    contextKey,
    values: hydratedValues,
    hydratedValues,
    proposalStatuses: {},
  }
}

function projectDetailMetaPredicateDraftValue(
  predicateKey: DetailMetaPredicateKey,
  nextValues: string[],
) {
  if (predicateKey === 'relation') return displayDetailIriCellValue(nextValues[0])
  if (predicateKey === 'tags') return nextValues.map(displayDetailLiteralCellValue).filter(Boolean).join(', ')
  return displayDetailLiteralCellValue(nextValues[0])
}

export function projectDetailMetaPredicateEditorDraft({
  current,
  predicateKey,
  nextValues,
}: {
  current: DetailMetaPredicateEditorState
  predicateKey: DetailMetaPredicateKey
  nextValues: string[]
}): DetailMetaPredicateEditorState {
  return {
    ...current,
    values: {
      ...current.values,
      [predicateKey]: projectDetailMetaPredicateDraftValue(predicateKey, nextValues),
    },
  }
}

export function projectDetailMetaPredicateEditorHydration({
  current,
  contextKey,
  hydratedValues,
}: {
  current: DetailMetaPredicateEditorState
  contextKey: string
  hydratedValues: DetailMetaPredicateValues
}): DetailMetaPredicateEditorState {
  if (current.contextKey !== contextKey) {
    return createDetailMetaPredicateEditorState({ contextKey, hydratedValues })
  }

  let values = current.values
  let storedHydratedValues = current.hydratedValues
  let changed = false
  const keys: DetailMetaPredicateValueKey[] = ['title', 'reviewStatus', 'tags', 'relation']

  for (const key of keys) {
    if (storedHydratedValues[key] === hydratedValues[key] || current.proposalStatuses[key]) continue
    if (values === current.values) values = { ...current.values }
    if (storedHydratedValues === current.hydratedValues) storedHydratedValues = { ...current.hydratedValues }
    values[key] = hydratedValues[key]
    storedHydratedValues[key] = hydratedValues[key]
    changed = true
  }

  if (!changed) return current

  return {
    ...current,
    values,
    hydratedValues: storedHydratedValues,
  }
}

export function projectDetailMetaPredicateEditorProposalStatus({
  current,
  predicateKey,
  status,
}: {
  current: DetailMetaPredicateEditorState
  predicateKey: DetailMetaPredicateKey
  status?: DetailMetaPredicateProposalStatus
}): DetailMetaPredicateEditorState {
  return {
    ...current,
    proposalStatuses: projectDetailMetaPredicateProposalStatuses({
      current: current.proposalStatuses,
      predicateKey,
      status,
    }),
  }
}

export function shouldCreateDetailMetaPredicateProposal({
  mutationPending,
  previousValues,
  nextValues,
  hydratedProposal,
}: {
  mutationPending: boolean
  previousValues: string[]
  nextValues: string[]
  hydratedProposal?: StructuredCellChangeProposal
}) {
  if (mutationPending) return false
  if (sameDetailCellValues(previousValues, nextValues)) return false
  if (hydratedProposal && sameDetailCellValues(hydratedProposal.nextValues, nextValues)) return false
  return true
}

export function projectDetailMetaPredicateProposalStatuses({
  current,
  predicateKey,
  status,
}: {
  current: DetailMetaPredicateProposalStatusMap
  predicateKey: DetailMetaPredicateKey
  status?: DetailMetaPredicateProposalStatus
}): DetailMetaPredicateProposalStatusMap {
  return { ...current, [predicateKey]: status }
}

export function resolveDetailMetaPredicateProposalStatus({
  localStatuses,
  pendingProposals,
  predicateKey,
}: {
  localStatuses: DetailMetaPredicateProposalStatusMap
  pendingProposals: DetailPendingMetaPredicateProposalMap
  predicateKey: DetailMetaPredicateKey
}): DetailMetaPredicateProposalStatus | undefined {
  return localStatuses[predicateKey] ?? (pendingProposals[predicateKey] ? 'pending' : undefined)
}

export function detailReviewStatusOptions(reviewStatus: string) {
  if (!reviewStatus || DETAIL_REVIEW_STATUS_OPTIONS.includes(reviewStatus as typeof DETAIL_REVIEW_STATUS_OPTIONS[number])) {
    return [...DETAIL_REVIEW_STATUS_OPTIONS]
  }
  return [reviewStatus, ...DETAIL_REVIEW_STATUS_OPTIONS]
}

export function detailTagOptions(tags: string, previousValues: string[]) {
  return Array.from(new Set([
    ...splitDetailTagValue(tags),
    ...previousValues.map(displayDetailLiteralCellValue).filter(Boolean),
  ]))
}
