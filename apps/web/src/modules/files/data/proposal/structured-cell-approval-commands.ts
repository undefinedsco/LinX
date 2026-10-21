import {
  approvalResource,
  auditResource,
  inboxNotificationResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createRawTextResource, readRawTextResource } from '../pod-adapter'
import { toPatchValueToken, WELL_KNOWN_PREFIXES } from '../../domain/card/rdf-term-tokens'
import { supportsStructuredWriteProposals } from '../../domain/structured/structured-write-capability'
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

/**
 * Tables the person made anywhere in their private Pod are editable. What stays locked is the
 * same set the Files UI treats as read-only: public, vocab registry, Files-managed and sidecars.
 */
function isEditableStructuredResourceUri(resourceUri: string): boolean {
  return supportsStructuredWriteProposals({ uri: normalizeAbsoluteIri(resourceUri), mimeType: 'text/turtle' })
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
  if (!isMetadataResourceUri(documentUri) && !isEditableStructuredResourceUri(documentUri)) {
    throw new Error('这个文件在公开区或系统保留区，不能在这里修改。请把它放到自己的私人文件夹里再改。')
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

export function renderStructuredCellMetadataPatch(proposal: StructuredCellChangeProposal) {
  const subject = sparqlSubjectToken(proposal.subject)
  const predicate = sparqlPredicateToken(proposal.predicate)
  // A value may be a literal, `<iri>`, a bare IRI (a vocab term the row is typed with) or a prefixed name.
  // Bare numbers and booleans are SPARQL literals as they are.
  const valueToken = (value: string) => (
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$|^(?:true|false)$/.test(value.trim())
      ? value.trim()
      : toPatchValueToken(value, proposal.documentUri)
  )
  const deleteTriples = proposal.previousValues.map((value) => `  ${subject} ${predicate} ${valueToken(value)} .`)
  const insertTriples = proposal.nextValues.map((value) => `  ${subject} ${predicate} ${valueToken(value)} .`)
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
    // Projection tokens use any well-known prefix (`rdf:type`, `xsd:` datatypes, ...); an undeclared one is a 400.
    ...Object.entries(WELL_KNOWN_PREFIXES).map(([prefix, iri]) => `PREFIX ${prefix}: <${iri}>`),
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

/**
 * The person's own edit (a table cell, a typed whiteboard edge) is written
 * straight to the document. Only changes proposed by AI go through approval.
 * The same Pod and resource guards apply, and an audit record keeps the trail.
 */
export async function writeOwnStructuredCellChange(
  db: SolidDatabase,
  input: {
    actorWebId: string
    documentUri: string
    subject: string
    predicate: string
    previousValues: string[]
    nextValues: string[]
    /**
     * ETag of the document version the person was looking at. The Pod's SPARQL PATCH
     * does not fail when DELETE DATA targets a value that is already gone, so without
     * this a stale edit would silently add a second value.
     */
    expectedEtag?: string | null
    createdAt?: Date
  },
): Promise<void> {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const documentUri = normalizeAbsoluteIri(input.documentUri)
  if (!documentUri.startsWith(`${podBaseUrl}/`)) {
    throw new Error('Refusing to write a structured cell outside the current Pod.')
  }
  if (isLockedVocabRegistryResourceUri(documentUri)) {
    throw new Error('Refusing to write a structured cell into the locked vocab registry.')
  }
  if (isFilesReservedResourceUri(documentUri) && !isMetadataResourceUri(documentUri)) {
    throw new Error('Refusing to write a structured cell into Files-managed resources.')
  }
  if (!isMetadataResourceUri(documentUri) && !isEditableStructuredResourceUri(documentUri)) {
    throw new Error('这个文件在公开区或系统保留区，不能在这里修改。请把它放到自己的私人文件夹里再改。')
  }

  const change = {
    documentUri,
    subject: input.subject,
    predicate: input.predicate,
    previousValues: input.previousValues,
    nextValues: input.nextValues,
  } as StructuredCellChangeProposal
  if (change.previousValues.length === 0 && change.nextValues.length === 0) return
  if (isMetadataResourceUri(documentUri)) {
    await ensureMetadataResourceExists(db, documentUri)
  }
  const response = await getAuthenticatedFetch(db)(documentUri, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/sparql-update',
      ...(input.expectedEtag ? { 'If-Match': input.expectedEtag } : {}),
    },
    body: renderStructuredCellMetadataPatch(change),
  })
  if (response.status === 409 || response.status === 412) {
    // The document changed since the person saw it.
    throw new StructuredCellWriteConflictError()
  }
  if (!response.ok) {
    throw new Error(`Cannot write structured cell: HTTP ${response.status}`)
  }

  const auditPayload = {
    id: crypto.randomUUID(),
    action: 'files.structured-cell.written',
    actor: input.actorWebId,
    actorRole: 'human',
    entry: documentUri,
    toolName: FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
    policyVersion: FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
    createdAt: input.createdAt ?? new Date(),
  }
  assertInsertValuesBelongToCurrentPod(db, auditPayload)
  await db.insert(auditResource).values(auditPayload).execute()
}

export class StructuredCellWriteConflictError extends Error {
  constructor() {
    super('这个单元格刚被别处改过，请刷新后再改。')
    this.name = 'StructuredCellWriteConflictError'
  }
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
