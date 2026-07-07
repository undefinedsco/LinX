import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
} from '../resource/files-rdf-contract'
import { applyStructuredCellWriteProposalToTurtle } from '../structured/structured-table'
import { readProposalIri, readProposalLiteral, readProposalLiterals } from './proposal-rdf'
import { readFilesProposalStatus, type FilesProposalStatus } from './proposal-status'

export const FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION = 'files-structured-cell-proposal-v1'
export const FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME = 'files.structured-cell.proposal'
export const FILES_STRUCTURED_CELL_APPROVAL_ACTION = 'https://undefineds.co/vocab/approveStructuredCellChangeProposal'

export interface StructuredCellChangeProposal {
  id: string
  kind: 'structured-cell-change-proposal'
  status: FilesProposalStatus
  operation: 'replace-values'
  proposalResourceUri: string
  documentUri: string
  subject: string
  predicate: string
  vocabTermProposalResourceUri?: string
  previousValues: string[]
  nextValues: string[]
  reason: string
  createdAt: string
  writesCanonicalResource: false
}

function slugify(value: string) {
  const slug = value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'cell'
}

function turtleString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function applyStructuredCellChangeProposalToTurtle(
  existingContent: string,
  proposal: StructuredCellChangeProposal,
) {
  return applyStructuredCellWriteProposalToTurtle(existingContent, {
    id: proposal.id,
    kind: 'cell-write',
    status: 'pending-write',
    documentUri: proposal.documentUri,
    subject: proposal.subject,
    predicate: proposal.predicate,
    ...(proposal.vocabTermProposalResourceUri ? { vocabTermProposalResourceUri: proposal.vocabTermProposalResourceUri } : {}),
    previousValues: proposal.previousValues,
    nextValues: proposal.nextValues,
    writesCanonicalResource: true,
  })
}

export function createStructuredCellChangeProposal({
  documentUri,
  subject,
  predicate,
  vocabTermProposalResourceUri,
  previousValues,
  nextValues,
  reason,
  podRootUri,
  createdAt = new Date().toISOString(),
}: {
  documentUri: string
  subject: string
  predicate: string
  vocabTermProposalResourceUri?: string
  previousValues: string[]
  nextValues: string[]
  reason?: string
  podRootUri?: string | null
  createdAt?: string
}): StructuredCellChangeProposal {
  const podRoot = resolveFilesPodRootUri(documentUri, { currentPodRootUri: podRootUri })
  const label = slugify(`${documentUri}-${subject}-${predicate}`)
  const instanceSuffix = filesProposalInstanceSuffix([
    createdAt,
    documentUri,
    subject,
    predicate,
    vocabTermProposalResourceUri,
    previousValues,
    nextValues,
    reason,
  ])
  const proposalResourceUri = filesDataResourceUri(podRoot, `proposals/cell/${label}-${instanceSuffix}.ttl`)
  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'structured-cell-change-proposal',
    status: 'pending',
    operation: 'replace-values',
    proposalResourceUri,
    documentUri,
    subject,
    predicate,
    ...(vocabTermProposalResourceUri ? { vocabTermProposalResourceUri } : {}),
    previousValues,
    nextValues,
    reason: reason?.trim() || 'Structured cell change staged for approval.',
    createdAt,
    writesCanonicalResource: false,
  }
}

export function renderStructuredCellChangeProposalTurtle(proposal: StructuredCellChangeProposal) {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#proposal> a udfs:StructuredCellChangeProposal ;',
    `  udfs:status ${turtleString(proposal.status)} ;`,
    `  udfs:operation ${turtleString(proposal.operation)} ;`,
    `  udfs:sourceDocument <${proposal.documentUri}> ;`,
    `  udfs:subject ${turtleString(proposal.subject)} ;`,
    `  udfs:predicate ${turtleString(proposal.predicate)} ;`,
    ...(proposal.vocabTermProposalResourceUri ? [`  udfs:vocabProposal <${proposal.vocabTermProposalResourceUri}> ;`] : []),
    ...proposal.previousValues.map((value) => `  udfs:previousValue ${turtleString(value)} ;`),
    ...proposal.nextValues.map((value) => `  udfs:nextValue ${turtleString(value)} ;`),
    `  dcterms:description ${turtleString(proposal.reason)} ;`,
    `  dcterms:created ${turtleString(proposal.createdAt)} ;`,
    `  udfs:writesCanonicalResource ${proposal.writesCanonicalResource ? 'true' : 'false'} .`,
  ].join('\n')
}

export function parseStructuredCellChangeProposalTurtle(
  source: string,
  proposalResourceUri: string,
): StructuredCellChangeProposal {
  const documentUri = readProposalIri(source, 'udfs:sourceDocument')
  const subject = readProposalLiteral(source, 'udfs:subject')
  const predicate = readProposalLiteral(source, 'udfs:predicate')
  const vocabTermProposalResourceUri = readProposalIri(source, 'udfs:vocabProposal')
  if (!documentUri || !subject || !predicate) {
    throw new Error('Invalid structured cell proposal: missing required fields.')
  }

  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'structured-cell-change-proposal',
    status: readFilesProposalStatus(source),
    operation: 'replace-values',
    proposalResourceUri,
    documentUri,
    subject,
    predicate,
    ...(vocabTermProposalResourceUri ? { vocabTermProposalResourceUri } : {}),
    previousValues: readProposalLiterals(source, 'udfs:previousValue'),
    nextValues: readProposalLiterals(source, 'udfs:nextValue'),
    reason: readProposalLiteral(source, 'dcterms:description') ?? '',
    createdAt: readProposalLiteral(source, 'dcterms:created') ?? new Date().toISOString(),
    writesCanonicalResource: false,
  }
}
