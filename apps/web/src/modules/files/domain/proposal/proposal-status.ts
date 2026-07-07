import { readProposalLiteral } from './proposal-rdf'

export type FilesProposalDecisionStatus = 'approved' | 'rejected'
export type FilesProposalStatus = 'pending' | FilesProposalDecisionStatus

const STATUS_PREDICATE_IRI = '<https://undefineds.co/vocab/status>'
const STATUS_PATTERN = /(?:udfs:status|<https:\/\/undefineds\.co\/vocab\/status>)\s+"[^"]*"/
const EXPANDED_PROPOSAL_SUBJECT_PATTERN = /^(<[^>\n]*#proposal>)\s+<[^>\n]+>\s+.+\.\s*$/m

export function stripProposalFragment(uri: string): string {
  const hashIndex = uri.indexOf('#')
  return hashIndex >= 0 ? uri.slice(0, hashIndex) : uri
}

export function updateProposalStatusInTurtle(source: string, status: FilesProposalDecisionStatus): string {
  const statusPredicate = source.includes('@prefix udfs:') ? 'udfs:status' : STATUS_PREDICATE_IRI
  const nextStatus = `${statusPredicate} "${status}"`
  if (STATUS_PATTERN.test(source)) {
    return source.replace(STATUS_PATTERN, nextStatus)
  }
  const expandedProposalSubject = source.match(EXPANDED_PROPOSAL_SUBJECT_PATTERN)?.[1]
  if (expandedProposalSubject) {
    return `${source.trimEnd()}\n${expandedProposalSubject} ${STATUS_PREDICATE_IRI} "${status}" .`
  }
  return source.replace(/(<#proposal>\s+a\s+[^;.\n]*\S)(\s*[;.])/, `$1 ;\n  ${nextStatus}$2`)
}

export function readFilesProposalStatus(source: string): FilesProposalStatus {
  const status = readProposalLiteral(source, 'udfs:status')
  return status === 'approved' || status === 'rejected' ? status : 'pending'
}
