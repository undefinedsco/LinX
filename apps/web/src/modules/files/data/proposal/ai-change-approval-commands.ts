import {
  approvalResource,
  auditResource,
  inboxNotificationResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { readRawTextResource, saveRawTextResource } from '../pod-adapter'
import { isFilesReservedResourceUri } from '../../domain/resource/files-rdf-contract'
import {
  applyAiChangeProposalToContent,
  FILES_AI_CHANGE_APPROVAL_ACTION,
  FILES_AI_CHANGE_APPROVAL_POLICY_VERSION,
  FILES_AI_CHANGE_APPROVAL_TOOL_NAME,
  parseAiChangeProposalTurtle,
  type AiChangeProposal,
} from '../../domain/proposal/ai-change-approval-model'

function resolveRequiredPodBaseUrl(db: SolidDatabase): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Cannot create AI change proposal approval without a current SP Pod URL.')
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

function assertAiChangeProposalRefTargetsCurrentPod(db: SolidDatabase, proposalResourceUri: string): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalUri = normalizeAbsoluteIri(proposalResourceUri)
  if (!proposalUri.startsWith(`${podBaseUrl}/.data/proposals/ai/`)) {
    throw new Error('Refusing to approve AI change proposal outside the current Pod.')
  }
}

function assertAiChangeProposalTargetsCurrentPod(db: SolidDatabase, proposal: AiChangeProposal): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalResourceUri = normalizeAbsoluteIri(proposal.proposalResourceUri)
  const targetResourceUri = normalizeAbsoluteIri(proposal.targetResourceUri)
  const documentUri = proposal.documentUri ? normalizeAbsoluteIri(proposal.documentUri) : null
  const valid =
    proposalResourceUri.startsWith(`${podBaseUrl}/.data/proposals/ai/`) &&
    targetResourceUri.startsWith(`${podBaseUrl}/`) &&
    (!documentUri || documentUri.startsWith(`${podBaseUrl}/`))

  if (!valid) {
    throw new Error('Refusing to approve AI change proposal outside the current Pod.')
  }
  if (isFilesReservedResourceUri(targetResourceUri)) {
    throw new Error('Refusing to approve AI change proposal targeting a reserved Files resource.')
  }
}

function assertAiChangeProposalPending(proposal: AiChangeProposal): void {
  if (proposal.status !== 'pending') {
    throw new Error(`Cannot approve AI change proposal because it is already ${proposal.status}.`)
  }
}

export async function approveAiChangeProposalFromInbox(
  db: SolidDatabase,
  proposalRef: string,
): Promise<AiChangeProposal> {
  const proposalResourceUri = stripFragment(proposalRef)
  assertAiChangeProposalRefTargetsCurrentPod(db, proposalResourceUri)
  const proposalResource = await readRawTextResource(db, proposalResourceUri)
  const proposal = parseAiChangeProposalTurtle(proposalResource.content, proposalResource.uri)
  assertAiChangeProposalTargetsCurrentPod(db, proposal)
  assertAiChangeProposalPending(proposal)
  const target = await readRawTextResource(db, proposal.targetResourceUri)
  await saveRawTextResource(db, target, applyAiChangeProposalToContent(target.content, proposal))
  return proposal
}

export async function createAiChangeProposalInboxApproval(
  db: SolidDatabase,
  input: {
    actorWebId: string
    proposal: AiChangeProposal
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
    toolCallId: `${FILES_AI_CHANGE_APPROVAL_TOOL_NAME}:${approvalId}`,
    toolName: FILES_AI_CHANGE_APPROVAL_TOOL_NAME,
    target: input.proposal.id,
    action: FILES_AI_CHANGE_APPROVAL_ACTION,
    risk: 'medium',
    status: 'pending',
    assignedTo: input.actorWebId,
    policyVersion: FILES_AI_CHANGE_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, approvalPayload)
  await db.insert(approvalResource).values(approvalPayload).execute()

  const auditPayload = {
    id: auditId,
    action: 'files.ai.change.proposal.requested',
    actor: input.actorWebId,
    actorRole: 'human',
    approval: approvalUri,
    entry: input.proposal.proposalResourceUri,
    toolName: FILES_AI_CHANGE_APPROVAL_TOOL_NAME,
    policyVersion: FILES_AI_CHANGE_APPROVAL_POLICY_VERSION,
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
