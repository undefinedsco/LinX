import {
  approvalResource,
  auditResource,
  inboxNotificationResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createRawTextResource, FilesResourceReadError, readRawTextResource, saveRawTextResource } from '../pod-adapter'
import {
  isFilesReservedResourceUri,
} from '../../domain/resource/files-rdf-contract'
import {
  applySourceUpdateProposalToContent,
  FILES_SOURCE_APPROVAL_ACTION,
  FILES_SOURCE_APPROVAL_POLICY_VERSION,
  FILES_SOURCE_APPROVAL_TOOL_NAME,
  parseSourceUpdateProposalTurtle,
  updateSourceLinkedCardDescriptorFromProposal,
  type SourceUpdateProposal,
} from '../../domain/source/source-approval-model'

function resolveRequiredPodBaseUrl(db: SolidDatabase): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Cannot create Ingest proposal approval without a current SP Pod URL.')
  }
  return podBaseUrl
}

function stripFragment(uri: string): string {
  const hashIndex = uri.indexOf('#')
  return hashIndex >= 0 ? uri.slice(0, hashIndex) : uri
}

function normalizeAbsoluteIri(iri: string): string {
  try {
    return new URL(iri).href
  } catch {
    return iri
  }
}

function isSourceLinkedCardDescriptorDocument(proposal: SourceUpdateProposal): boolean {
  if (!proposal.subject) return false
  return normalizeAbsoluteIri(stripFragment(proposal.subject)) === normalizeAbsoluteIri(proposal.documentUri)
}

function assertSourceProposalRefTargetsCurrentPod(db: SolidDatabase, proposalResourceUri: string): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalUri = normalizeAbsoluteIri(proposalResourceUri)
  if (!proposalUri.startsWith(`${podBaseUrl}/.data/proposals/source/`)) {
    throw new Error('Refusing to approve Ingest proposal outside the current Pod.')
  }
}

function assertSourceProposalTargetsCurrentPod(db: SolidDatabase, proposal: SourceUpdateProposal): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalResourceUri = normalizeAbsoluteIri(proposal.proposalResourceUri)
  const documentUri = normalizeAbsoluteIri(proposal.documentUri)
  const targetResourceUri = normalizeAbsoluteIri(proposal.targetResourceUri)
  const sourceIngestManifestUri = normalizeAbsoluteIri(proposal.sourceIngestManifestUri)
  const valid =
    proposalResourceUri.startsWith(`${podBaseUrl}/.data/proposals/source/`) &&
    documentUri.startsWith(`${podBaseUrl}/`) &&
    targetResourceUri.startsWith(`${podBaseUrl}/`) &&
    (
      sourceIngestManifestUri.startsWith(`${podBaseUrl}/.data/ingest/`) ||
      sourceIngestManifestUri.startsWith(`${podBaseUrl}/.data/index/`)
    )

  if (!valid) {
    throw new Error('Refusing to approve Ingest proposal outside the current Pod.')
  }
  if (isFilesReservedResourceUri(targetResourceUri)) {
    throw new Error('Refusing to approve Ingest proposal targeting a reserved Files resource.')
  }
}

function assertSourceProposalPending(proposal: SourceUpdateProposal): void {
  if (proposal.status !== 'pending') {
    throw new Error(`Cannot approve Ingest proposal because it is already ${proposal.status}.`)
  }
}

async function syncSourceLinkedCardDescriptor(
  db: SolidDatabase,
  proposal: SourceUpdateProposal,
): Promise<void> {
  if (!proposal.proposedContent || proposal.operation === 'keep-local') return
  if (!isSourceLinkedCardDescriptorDocument(proposal)) return
  const descriptorResource = await readRawTextResource(db, proposal.documentUri)
  const nextContent = updateSourceLinkedCardDescriptorFromProposal(descriptorResource.content, proposal)
  if (nextContent === descriptorResource.content) return
  await saveRawTextResource(db, descriptorResource, nextContent)
}

function isMissingRawTextResourceError(error: unknown): boolean {
  if (error instanceof FilesResourceReadError && error.kind === 'missing') return true
  return error instanceof Error && /\bHTTP (404|410)\b/.test(error.message)
}

export async function approveSourceUpdateProposalFromInbox(
  db: SolidDatabase,
  proposalRef: string,
): Promise<SourceUpdateProposal> {
  const proposalResourceUri = stripFragment(proposalRef)
  assertSourceProposalRefTargetsCurrentPod(db, proposalResourceUri)
  const proposalResource = await readRawTextResource(db, proposalResourceUri)
  const proposal = parseSourceUpdateProposalTurtle(proposalResource.content, proposalResource.uri)
  assertSourceProposalTargetsCurrentPod(db, proposal)
  assertSourceProposalPending(proposal)
  if (proposal.proposedContent && proposal.operation !== 'keep-local') {
    try {
      const target = await readRawTextResource(db, proposal.targetResourceUri)
      await saveRawTextResource(db, target, applySourceUpdateProposalToContent(target.content, proposal))
    } catch (error) {
      if (!isMissingRawTextResourceError(error)) throw error
      await createRawTextResource(db, {
        uri: proposal.targetResourceUri,
        mimeType: 'text/markdown',
      }, proposal.proposedContent)
    }
  }
  await syncSourceLinkedCardDescriptor(db, proposal)
  return proposal
}

export async function createSourceUpdateProposalInboxApproval(
  db: SolidDatabase,
  input: {
    actorWebId: string
    proposal: SourceUpdateProposal
    createdAt?: Date
  },
): Promise<string> {
  const createdAt = input.createdAt ?? new Date()
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const approvalId = crypto.randomUUID()
  const auditId = crypto.randomUUID()
  const approvalUri = approvalResource.buildIri(podBaseUrl, { id: approvalId, createdAt } as any)

  const approvalPayload = {
    id: approvalId,
    session: input.proposal.id,
    toolCallId: `${FILES_SOURCE_APPROVAL_TOOL_NAME}:${approvalId}`,
    toolName: FILES_SOURCE_APPROVAL_TOOL_NAME,
    target: input.proposal.id,
    action: FILES_SOURCE_APPROVAL_ACTION,
    risk: 'medium',
    status: 'pending',
    assignedTo: input.actorWebId,
    policyVersion: FILES_SOURCE_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, approvalPayload)
  await db.insert(approvalResource).values(approvalPayload).execute()

  const auditPayload = {
    id: auditId,
    action: 'files.source.proposal.requested',
    actor: input.actorWebId,
    actorRole: 'human',
    approval: approvalUri,
    entry: input.proposal.proposalResourceUri,
    toolName: FILES_SOURCE_APPROVAL_TOOL_NAME,
    policyVersion: FILES_SOURCE_APPROVAL_POLICY_VERSION,
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
