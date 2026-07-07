import type { StructuredCellChangeProposal } from '../proposal/structured-cell-approval-model'
import type { StructuredCellWriteProposal, VocabTermProposal } from './structured-table'
import { localPredicateLabel } from './structured-table-vocab'

const TYPED_LITERAL_PATTERN = /^"((?:[^"\\]|\\.)*)"\^\^(?:<([^>]+)>|([A-Za-z][\w.-]*:[\w.-]+))$/
const DATE_TYPE_SUFFIX_PATTERN = /(?:#|:)date$/i

export function documentCellKey(documentUri: string, subject: string, predicate: string) {
  return `${documentUri}\u0000${subject}\u0000${predicate}`
}

export function structuredCellChangeProposalToWriteProposal(
  proposal: StructuredCellChangeProposal,
): StructuredCellWriteProposal {
  return {
    id: proposal.id,
    kind: 'cell-write',
    status: 'pending-write',
    documentUri: proposal.documentUri,
    subject: proposal.subject,
    predicate: proposal.predicate,
    previousValues: proposal.previousValues,
    nextValues: proposal.nextValues,
    writesCanonicalResource: true,
  }
}

export function parseStructuredTypedLiteral(value: string) {
  const match = value.match(TYPED_LITERAL_PATTERN)
  if (!match) return null
  const fullIriDatatype = match[2]
  const prefixedDatatype = match[3]
  const datatypeToken = fullIriDatatype ? `<${fullIriDatatype}>` : (prefixedDatatype ?? '')
  return {
    lexical: match[1].replace(/\\"/g, '"'),
    datatype: fullIriDatatype ?? prefixedDatatype ?? '',
    datatypeToken,
  }
}

export function displayStructuredCellValue(value: string) {
  const typedLiteral = parseStructuredTypedLiteral(value)
  if (typedLiteral && DATE_TYPE_SUFFIX_PATTERN.test(typedLiteral.datatype)) return typedLiteral.lexical
  return value
}

export function sameStructuredCellValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function enumOptionPredicateFromShape(shape: string) {
  return shape.startsWith('predicate ') ? shape.slice('predicate '.length).trim() : null
}

export function isPendingEnumOption(
  proposals: readonly VocabTermProposal[],
  predicate: string,
  optionLabel: string,
) {
  return Boolean(findPendingEnumOptionProposal(proposals, predicate, optionLabel))
}

export function findPendingEnumOptionProposal(
  proposals: readonly VocabTermProposal[],
  predicate: string,
  optionLabel: string,
) {
  const tablePredicateLabel = localPredicateLabel(predicate)
  return proposals.find((proposal) => (
    proposal.termKind === 'enum-option'
    && proposal.label === optionLabel
    && (() => {
      const proposalPredicate = proposal.predicate ?? enumOptionPredicateFromShape(proposal.shape)
      if (!proposalPredicate) return false
      return proposalPredicate === predicate || localPredicateLabel(proposalPredicate) === tablePredicateLabel
    })()
  ))
}

export function pendingEnumOptionLabelsForPredicate(
  proposals: readonly VocabTermProposal[],
  predicate: string,
) {
  const tablePredicateLabel = localPredicateLabel(predicate)
  return proposals
    .filter((proposal) => {
      if (proposal.termKind !== 'enum-option') return false
      const proposalPredicate = proposal.predicate ?? enumOptionPredicateFromShape(proposal.shape)
      if (!proposalPredicate) return false
      return proposalPredicate === predicate || localPredicateLabel(proposalPredicate) === tablePredicateLabel
    })
    .map((proposal) => proposal.label || localPredicateLabel(proposal.termUri))
    .filter(Boolean)
}

export function inferStructuredPredicateKind(values: string[]) {
  if (values.some((value) => value === 'true' || value === 'false')) return 'boolean'
  if (values.some((value) => parseStructuredTypedLiteral(value)?.datatype.match(/(?:#|:)date$/i))) return 'date'
  if (values.some((value) => /^-?\d+(?:\.\d+)?$/.test(value))) return 'number'
  if (values.some((value) => value.startsWith('<') || /^https?:\/\//.test(value))) return 'relation'
  if (values.length > 1) return 'multi-value'
  return 'text'
}
