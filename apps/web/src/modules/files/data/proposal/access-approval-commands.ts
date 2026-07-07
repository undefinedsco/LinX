import {
  approvalResource,
  auditResource,
  inboxNotificationResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createRawTextResource, readRawTextResource, saveRawTextResource } from '../pod-adapter'
import {
  FILES_ACCESS_APPROVAL_ACTION,
  FILES_ACCESS_APPROVAL_POLICY_VERSION,
  FILES_ACCESS_APPROVAL_TOOL_NAME,
  applyAccessPolicyProposalToAclTurtle,
  parseAccessPolicyProposalTurtle,
  type AccessPolicyProposal,
} from '../../domain/proposal/access-approval-model'
import { stripProposalFragment } from '../../domain/proposal/proposal-status'

function resolveRequiredPodBaseUrl(db: SolidDatabase): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Cannot create access proposal approval without a current SP Pod URL.')
  }
  return podBaseUrl
}

function normalizeAbsoluteIri(iri: string): string {
  try {
    return new URL(iri).href
  } catch {
    return iri
  }
}

function assertAccessProposalRefTargetsCurrentPod(db: SolidDatabase, proposalResourceUri: string): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalUri = normalizeAbsoluteIri(proposalResourceUri)
  if (!proposalUri.startsWith(`${podBaseUrl}/.data/proposals/access/`)) {
    throw new Error('Refusing to approve access policy proposal outside the current Pod.')
  }
}

function assertAccessProposalTargetsCurrentPod(db: SolidDatabase, proposal: AccessPolicyProposal): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const proposalResourceUri = normalizeAbsoluteIri(proposal.proposalResourceUri)
  const ownerUri = normalizeAbsoluteIri(proposal.ownerUri)
  const targetPolicyUri = normalizeAbsoluteIri(proposal.targetPolicyUri)
  const activePolicyUri = proposal.activePolicyUri ? normalizeAbsoluteIri(proposal.activePolicyUri) : null
  const valid =
    proposalResourceUri.startsWith(`${podBaseUrl}/.data/proposals/access/`) &&
    ownerUri.startsWith(`${podBaseUrl}/`) &&
    targetPolicyUri.startsWith(`${podBaseUrl}/`) &&
    (!activePolicyUri || activePolicyUri.startsWith(`${podBaseUrl}/`))

  if (!valid) {
    throw new Error('Refusing to approve access policy proposal outside the current Pod.')
  }
}

function assertAccessProposalPending(proposal: AccessPolicyProposal): void {
  if (proposal.status !== 'pending') {
    throw new Error(`Cannot approve access policy proposal because it is already ${proposal.status}.`)
  }
}

function isMissingResourceError(error: unknown) {
  return error instanceof Error && /HTTP\s+(404|410)/.test(error.message)
}

function assertConfirmedWacAclProposal(proposal: AccessPolicyProposal): void {
  if (
    proposal.provider !== 'acl' ||
    !proposal.activePolicyUri ||
    proposal.targetPolicyUri !== proposal.activePolicyUri
  ) {
    throw new Error('Refusing to apply access proposal without a confirmed linked WAC ACL policy.')
  }
}

function isReviewOnlyAccessPolicyProposal(proposal: AccessPolicyProposal): boolean {
  return proposal.provider === 'acr' || proposal.targetPolicyUri.endsWith('.acr') || proposal.activePolicyUri?.endsWith('.acr') === true
}

export async function approveAccessPolicyProposalFromInbox(
  db: SolidDatabase,
  proposalRef: string,
): Promise<AccessPolicyProposal> {
  const proposalResourceUri = stripProposalFragment(proposalRef)
  assertAccessProposalRefTargetsCurrentPod(db, proposalResourceUri)
  const proposalResource = await readRawTextResource(db, proposalResourceUri)
  const proposal = parseAccessPolicyProposalTurtle(proposalResource.content, proposalResource.uri)
  assertAccessProposalTargetsCurrentPod(db, proposal)
  assertAccessProposalPending(proposal)
  if (isReviewOnlyAccessPolicyProposal(proposal)) {
    throw new Error('ACR access proposal cannot be approved automatically because ACP policy application is not supported yet.')
  }
  assertConfirmedWacAclProposal(proposal)
  const nextPolicyContent = (existingContent: string) => applyAccessPolicyProposalToAclTurtle(existingContent, proposal)

  try {
    const policy = await readRawTextResource(db, proposal.targetPolicyUri)
    await saveRawTextResource(db, policy, nextPolicyContent(policy.content))
  } catch (error) {
    if (!isMissingResourceError(error)) throw error
    await createRawTextResource(db, {
      uri: proposal.targetPolicyUri,
      mimeType: 'text/turtle',
    }, nextPolicyContent(''))
  }

  return proposal
}

export async function createAccessPolicyProposalInboxApproval(
  db: SolidDatabase,
  input: {
    actorWebId: string
    proposal: AccessPolicyProposal
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
    toolCallId: `${FILES_ACCESS_APPROVAL_TOOL_NAME}:${approvalId}`,
    toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
    target: input.proposal.id,
    action: FILES_ACCESS_APPROVAL_ACTION,
    risk: input.proposal.role === 'manager' || input.proposal.role === 'editor' ? 'high' : 'medium',
    status: 'pending',
    assignedTo: input.actorWebId,
    policyVersion: FILES_ACCESS_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, approvalPayload)
  await db.insert(approvalResource).values(approvalPayload).execute()

  const auditPayload = {
    id: auditId,
    action: 'files.access.proposal.requested',
    actor: input.actorWebId,
    actorRole: 'human',
    approval: approvalUri,
    entry: input.proposal.proposalResourceUri,
    toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
    policyVersion: FILES_ACCESS_APPROVAL_POLICY_VERSION,
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
