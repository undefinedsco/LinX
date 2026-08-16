import {
  approvalResource,
  auditResource,
  inboxNotificationResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createRawTextResource, readRawTextResource } from '../pod-adapter'
import { isFilesReservedResourceUri } from '../../domain/resource/files-rdf-contract'
import {
  FILES_STRUCTURED_CELL_APPROVAL_ACTION,
  FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
  FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
  parseStructuredCellChangeProposalTurtle,
  type StructuredCellChangeProposal,
} from '../../domain/proposal/structured-cell-approval-model'
import { stripProposalFragment } from '../../domain/proposal/proposal-status'

function normalizeAbsoluteIri(iri: string): string {
  try {
    return new URL(iri).href
  } catch {
    return iri
  }
}

function isMetadataResourceUri(resourceUri: string): boolean {
  try {
    const pathname = new URL(resourceUri).pathname
    return pathname.endsWith('.meta') || pathname.endsWith('/.meta') || pathname.includes('/.meta/')
  } catch {
    return resourceUri.endsWith('.meta') || resourceUri.endsWith('/.meta') || resourceUri.includes('/.meta/')
  }
}

function isLockedVocabRegistryResourceUri(resourceUri: string): boolean {
  try {
    return new URL(resourceUri).pathname.includes('/.vocab/')
  } catch {
    return resourceUri.includes('/.vocab/')
  }
}

function isEditableStructuredDataResourceUri(resourceUri: string, podBaseUrl: string): boolean {
  return normalizeAbsoluteIri(resourceUri).startsWith(`${podBaseUrl}/.data/`)
}

function resolveRequiredPodBaseUrl(db: SolidDatabase): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Cannot create structured cell proposal approval without a current SP Pod URL.')
  }
  return podBaseUrl
}

function assertStructuredCellProposalRefTargetsCurrentPod(db: SolidDatabase, proposalResourceUri: string): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalUri = normalizeAbsoluteIri(proposalResourceUri)
  if (!proposalUri.startsWith(`${podBaseUrl}/.data/proposals/cell/`)) {
    throw new Error('Refusing to approve structured cell proposal outside the current Pod.')
  }
}

function assertStructuredCellProposalTargetsCurrentPod(db: SolidDatabase, proposal: StructuredCellChangeProposal): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalResourceUri = normalizeAbsoluteIri(proposal.proposalResourceUri)
  const documentUri = normalizeAbsoluteIri(proposal.documentUri)
  const valid =
    proposalResourceUri.startsWith(`${podBaseUrl}/.data/proposals/cell/`) &&
    documentUri.startsWith(`${podBaseUrl}/`)

  if (!valid) {
    throw new Error('Refusing to approve structured cell proposal outside the current Pod.')
  }
  if (isLockedVocabRegistryResourceUri(documentUri)) {
    throw new Error('Refusing to approve structured cell proposal against locked vocab registry resources.')
  }
  if (isFilesReservedResourceUri(documentUri) && !isMetadataResourceUri(documentUri)) {
    throw new Error('Refusing to approve structured cell proposal against Files-managed resources.')
  }
  if (!isMetadataResourceUri(documentUri) && !isEditableStructuredDataResourceUri(documentUri, podBaseUrl)) {
    throw new Error('Refusing to approve structured cell proposal outside editable .data resources.')
  }
}

function assertStructuredCellProposalPending(proposal: StructuredCellChangeProposal): void {
  if (proposal.status !== 'pending') {
    throw new Error(`Cannot approve structured cell proposal because it is already ${proposal.status}.`)
  }
}

export async function approveStructuredCellChangeProposalFromInbox(
  db: SolidDatabase,
  proposalRef: string,
): Promise<StructuredCellChangeProposal> {
  const proposalResourceUri = stripProposalFragment(proposalRef)
  assertStructuredCellProposalRefTargetsCurrentPod(db, proposalResourceUri)
  const proposalResource = await readRawTextResource(db, proposalResourceUri)
  const proposal = parseStructuredCellChangeProposalTurtle(proposalResource.content, proposalResource.uri)
  assertStructuredCellProposalTargetsCurrentPod(db, proposal)
  assertStructuredCellProposalPending(proposal)
  await patchRdfStructuredCellChangeProposal(db, proposal, {
    createMissingMetadataResource: isMetadataResourceUri(proposal.documentUri),
  })
  return proposal
}

function sparqlSubjectToken(subject: string) {
  if (subject.startsWith('#')) return `<${subject}>`
  if (/^https?:\/\//.test(subject)) return `<${subject}>`
  return subject
}

function sparqlPredicateToken(predicate: string) {
  if (/^https?:\/\//.test(predicate)) return `<${predicate}>`
  return predicate
}

function renderStructuredCellMetadataPatch(proposal: StructuredCellChangeProposal) {
  const subject = sparqlSubjectToken(proposal.subject)
  const predicate = sparqlPredicateToken(proposal.predicate)
  const deleteTriples = proposal.previousValues.map((value) => `  ${subject} ${predicate} ${value} .`)
  const insertTriples = proposal.nextValues.map((value) => `  ${subject} ${predicate} ${value} .`)
  const operations = [
    deleteTriples.length > 0
      ? ['DELETE DATA {', ...deleteTriples, '}'].join('\n')
      : null,
    insertTriples.length > 0
      ? ['INSERT DATA {', ...insertTriples, '}'].join('\n')
      : null,
  ].filter((operation): operation is string => Boolean(operation))

  return [
    `BASE <${proposal.documentUri}>`,
    'PREFIX dcterms: <http://purl.org/dc/terms/>',
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
    'PREFIX udfs: <https://undefineds.co/vocab/>',
    '',
    operations.join(' ;\n'),
  ].join('\n')
}

function getAuthenticatedFetch(db: SolidDatabase): typeof fetch {
  const authFetch = (db as any)?.getDialect?.()?.getAuthenticatedFetch?.()
  if (!authFetch) {
    throw new Error('Authenticated fetch is unavailable for structured cell proposal approval.')
  }
  return authFetch
}

async function patchRdfStructuredCellChangeProposal(
  db: SolidDatabase,
  proposal: StructuredCellChangeProposal,
  options: { createMissingMetadataResource?: boolean } = {},
) {
  if (proposal.previousValues.length === 0 && proposal.nextValues.length === 0) return
  if (options.createMissingMetadataResource) {
    await ensureMetadataResourceExists(db, proposal.documentUri)
  }
  const response = await getAuthenticatedFetch(db)(proposal.documentUri, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/sparql-update',
    },
    body: renderStructuredCellMetadataPatch(proposal),
  })
  if (!response.ok) {
    throw new Error(`Cannot approve structured cell proposal: HTTP ${response.status}`)
  }
}

async function ensureMetadataResourceExists(db: SolidDatabase, documentUri: string) {
  const response = await getAuthenticatedFetch(db)(documentUri, {
    method: 'GET',
    headers: {
      Accept: 'text/turtle, text/*;q=0.9, application/ld+json;q=0.8, */*;q=0.1',
    },
  })
  if (response.ok) return
  if (response.status !== 404) {
    throw new Error(`Cannot read metadata resource before structured cell proposal approval: HTTP ${response.status}`)
  }

  await createRawTextResource(db, {
    uri: documentUri,
    mimeType: 'text/turtle',
  }, [
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '',
  ].join('\n'))
}

export async function createStructuredCellChangeProposalInboxApproval(
  db: SolidDatabase,
  input: {
    actorWebId: string
    proposal: StructuredCellChangeProposal
    createdAt?: Date
  },
): Promise<string> {
  const createdAt = input.createdAt ?? new Date()
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const approvalId = crypto.randomUUID()
  const auditId = crypto.randomUUID()
  const approvalResourceId = approvalResource.buildId({ id: approvalId, createdAt })
  const approvalUri = approvalResource.buildIri(podBaseUrl, { id: approvalId, createdAt } as any)

  const approvalPayload = {
    id: approvalResourceId,
    session: input.proposal.id,
    toolCallId: `${FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME}:${approvalId}`,
    toolName: FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
    target: input.proposal.id,
    action: FILES_STRUCTURED_CELL_APPROVAL_ACTION,
    risk: 'medium',
    status: 'pending',
    assignedTo: input.actorWebId,
    policyVersion: FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, approvalPayload)
  await db.insert(approvalResource).values(approvalPayload).execute()

  const auditPayload = {
    id: auditId,
    action: 'files.structured-cell.proposal.requested',
    actor: input.actorWebId,
    actorRole: 'human',
    approval: approvalUri,
    entry: input.proposal.proposalResourceUri,
    toolName: FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
    policyVersion: FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, auditPayload)
  await db.insert(auditResource).values(auditPayload).execute()

  const notificationPayload = {
    id: crypto.randomUUID(),
    actor: input.actorWebId,
    object: approvalUri,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, notificationPayload)
  await db.insert(inboxNotificationResource).values(notificationPayload).execute()

  return approvalUri
}
