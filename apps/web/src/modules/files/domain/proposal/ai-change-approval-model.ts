import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
} from '../resource/files-rdf-contract'
import { readProposalIri, readProposalLiteral } from './proposal-rdf'
import { readFilesProposalStatus, type FilesProposalStatus } from './proposal-status'

export const FILES_AI_CHANGE_APPROVAL_POLICY_VERSION = 'files-ai-change-proposal-v1'
export const FILES_AI_CHANGE_APPROVAL_TOOL_NAME = 'files.ai.change.proposal'
export const FILES_AI_CHANGE_APPROVAL_ACTION = 'https://undefineds.co/vocab/reviewAiChangeProposal'

export type AiChangeOperation = 'replace-content' | 'append-content'

export interface AiChangeProposal {
  id: string
  kind: 'ai-change-proposal'
  status: FilesProposalStatus
  operation: AiChangeOperation
  proposalResourceUri: string
  targetResourceUri: string
  documentUri: string | null
  subject: string | null
  agentWebId: string | null
  summary: string
  diff: string
  reason: string
  proposedContent: string
  createdAt: string
  writesCanonicalContent: false
}

function slugify(value: string) {
  const slug = value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'ai-change'
}

function getResourceStem(uri: string) {
  try {
    const pathname = new URL(uri).pathname
    const pathSegments = pathname.split('/').filter(Boolean)
    return pathSegments[pathSegments.length - 1] ?? 'ai-change'
  } catch {
    const pathSegments = uri.split('/').filter(Boolean)
    return pathSegments[pathSegments.length - 1] ?? 'ai-change'
  }
}

function turtleString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`
}

export function createAiChangeProposal(input: {
  targetResourceUri: string
  documentUri?: string | null
  subject?: string | null
  agentWebId?: string | null
  operation?: AiChangeOperation
  proposedContent: string
  summary: string
  diff: string
  reason?: string
  podRootUri?: string | null
  createdAt?: string
}): AiChangeProposal {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const podRoot = resolveFilesPodRootUri(input.targetResourceUri, { currentPodRootUri: input.podRootUri })
  const label = slugify(getResourceStem(input.targetResourceUri))
  const instanceSuffix = filesProposalInstanceSuffix([
    createdAt,
    input.targetResourceUri,
    input.documentUri,
    input.subject,
    input.operation ?? 'replace-content',
    input.summary,
    input.diff,
    input.proposedContent,
  ])
  const proposalResourceUri = filesDataResourceUri(podRoot, `proposals/ai/${label}-${instanceSuffix}.ttl`)

  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'ai-change-proposal',
    status: 'pending',
    operation: input.operation ?? 'replace-content',
    proposalResourceUri,
    targetResourceUri: input.targetResourceUri,
    documentUri: input.documentUri ?? null,
    subject: input.subject ?? null,
    agentWebId: input.agentWebId ?? null,
    summary: input.summary.trim() || 'AI change requires review before writing canonical content.',
    diff: input.diff.trim() || 'AI staged content is waiting for review.',
    reason: input.reason?.trim() || 'AI proposed a content change.',
    proposedContent: input.proposedContent,
    createdAt,
    writesCanonicalContent: false,
  }
}

export function renderAiChangeProposalTurtle(proposal: AiChangeProposal) {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#proposal> a udfs:AiChangeProposal ;',
    `  udfs:status ${turtleString(proposal.status)} ;`,
    `  udfs:operation ${turtleString(proposal.operation)} ;`,
    `  udfs:targetResource <${proposal.targetResourceUri}> ;`,
    ...(proposal.documentUri ? [`  udfs:sourceDocument <${proposal.documentUri}> ;`] : []),
    ...(proposal.subject ? [`  udfs:subject ${turtleString(proposal.subject)} ;`] : []),
    ...(proposal.agentWebId ? [`  udfs:agent <${proposal.agentWebId}> ;`] : []),
    `  dcterms:description ${turtleString(proposal.summary)} ;`,
    `  udfs:diff ${turtleString(proposal.diff)} ;`,
    `  udfs:reason ${turtleString(proposal.reason)} ;`,
    `  udfs:proposedContent ${turtleString(proposal.proposedContent)} ;`,
    `  dcterms:created ${turtleString(proposal.createdAt)} ;`,
    `  udfs:writesCanonicalContent ${proposal.writesCanonicalContent ? 'true' : 'false'} .`,
  ].join('\n')
}

function isAiChangeOperation(value: string | null): value is AiChangeOperation {
  return value === 'replace-content' || value === 'append-content'
}

export function parseAiChangeProposalTurtle(source: string, proposalResourceUri: string): AiChangeProposal {
  const operation = readProposalLiteral(source, 'udfs:operation')
  const targetResourceUri = readProposalIri(source, 'udfs:targetResource')
  const proposedContent = readProposalLiteral(source, 'udfs:proposedContent')
  if (!isAiChangeOperation(operation) || !targetResourceUri || proposedContent == null) {
    throw new Error('Invalid AI change proposal: missing required fields.')
  }

  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'ai-change-proposal',
    status: readFilesProposalStatus(source),
    operation,
    proposalResourceUri,
    targetResourceUri,
    documentUri: readProposalIri(source, 'udfs:sourceDocument'),
    subject: readProposalLiteral(source, 'udfs:subject'),
    agentWebId: readProposalIri(source, 'udfs:agent'),
    summary: readProposalLiteral(source, 'dcterms:description') ?? '',
    diff: readProposalLiteral(source, 'udfs:diff') ?? '',
    reason: readProposalLiteral(source, 'udfs:reason') ?? '',
    proposedContent,
    createdAt: readProposalLiteral(source, 'dcterms:created') ?? new Date().toISOString(),
    writesCanonicalContent: false,
  }
}

export function applyAiChangeProposalToContent(existingContent: string, proposal: AiChangeProposal) {
  if (!proposal.proposedContent) {
    throw new Error('AI change proposal has no staged content.')
  }
  if (proposal.operation === 'append-content') {
    return `${existingContent.replace(/\s+$/, '')}\n\n${proposal.proposedContent.replace(/^\s+/, '')}`
  }
  return proposal.proposedContent
}
