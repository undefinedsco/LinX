import { useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import { openFilesExternalUri } from '../../app/platform-actions'
import { useCreateAccessPolicyProposal, useFilesAccessBasics, usePendingAccessPolicyProposals } from '../../data/queries'
import {
  ACCESS_AUDIENCE_OPTIONS,
  ACCESS_ROLE_OPTIONS,
  canCreateAccessPolicyDialogProposal,
  createAccessPolicyDialogControllerState,
  createAccessPolicyDialogProposal,
  getAccessMatrixRows,
  getAccessProposalHelp,
  getAccessPolicySourceRows,
  getCurrentAccessSourceView,
  getCurrentPodPolicyView,
  isAccessDialogAgentWebIdInvalid,
  mergePendingAccessProposals,
  projectAccessPolicyDialogControllerAudienceValue,
  projectAccessPolicyDialogControllerProposalCreated,
  projectAccessPolicyDialogControllerRoleValue,
  projectAccessPolicyDialogDraftPatch,
  projectAccessQueryErrorMessage,
  projectCurrentAccessSourceState,
  resolveAccessProposalPolicyTarget,
} from '../../domain/resource/access-policy-dialog-model'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { resolveFilesResourceSidecars, resolveFilesSidecarOwnerTarget } from '../../domain/resource/resource-semantics'

export type ResourceSidecarActionTarget = Pick<FilesEntry, 'uri' | 'kind' | 'semanticKind'>

export function useAccessPolicyDialogController({
  file,
  onOpenPolicySource,
  open,
}: {
  file: ResourceSidecarActionTarget
  onOpenPolicySource?: (uri: string) => void
  open: boolean
}) {
  const ownerTarget = resolveFilesSidecarOwnerTarget(file)
  const sidecars = resolveFilesResourceSidecars(ownerTarget)
  const accessQuery = useFilesAccessBasics(ownerTarget, open)
  const access = accessQuery.data
  const hydratedPendingProposals = usePendingAccessPolicyProposals(sidecars.ownerUri, open)
  const createAccessProposal = useCreateAccessPolicyProposal()
  const { toast } = useToast()
  const [dialogControllerState, setDialogControllerState] = useState(createAccessPolicyDialogControllerState)
  const accessErrorMessage = projectAccessQueryErrorMessage(accessQuery.error)
  const dialogState = dialogControllerState.draft
  const agentWebIdInvalid = isAccessDialogAgentWebIdInvalid(dialogState)
  const proposalPolicyTarget = resolveAccessProposalPolicyTarget(access, sidecars)
  const canCreateProposal = canCreateAccessPolicyDialogProposal({
    hasAccessQueryError: !!accessQuery.error,
    policyTarget: proposalPolicyTarget,
    state: dialogState,
  })
  const currentPodPolicy = getCurrentPodPolicyView(access, proposalPolicyTarget)
  const currentAccessSource = getCurrentAccessSourceView(access)
  const currentAccessSourceState = projectCurrentAccessSourceState({
    isLoading: accessQuery.isLoading,
    errorMessage: accessErrorMessage,
    currentAccessSource,
  })
  const accessPolicySourceRows = getAccessPolicySourceRows(access, sidecars)
  const accessMatrixRows = getAccessMatrixRows(access)
  const accessProposalHelp = getAccessProposalHelp({
    access,
    policyTarget: proposalPolicyTarget,
    state: dialogState,
  })
  const displayedPendingProposals = mergePendingAccessProposals(
    hydratedPendingProposals.data ?? [],
    dialogControllerState.pendingProposals,
  )
  const hasDisplayedPendingProposals = displayedPendingProposals.length > 0

  function setAudienceValue(value: string) {
    setDialogControllerState((current) => projectAccessPolicyDialogControllerAudienceValue({ current, value }))
  }

  function setRoleValue(value: string) {
    setDialogControllerState((current) => projectAccessPolicyDialogControllerRoleValue({ current, value }))
  }

  function setAgentWebId(value: string) {
    setDialogControllerState((current) => projectAccessPolicyDialogDraftPatch({
      current,
      patch: { agentWebId: value },
    }))
  }

  function setReason(value: string) {
    setDialogControllerState((current) => projectAccessPolicyDialogDraftPatch({
      current,
      patch: { reason: value },
    }))
  }

  function openPolicySource(uri: string) {
    if (onOpenPolicySource) {
      onOpenPolicySource(uri)
      return
    }
    openFilesExternalUri(uri)
  }

  function openCurrentAccessSource() {
    if (!currentAccessSource?.uri) return
    openPolicySource(currentAccessSource.uri)
  }

  async function createPendingProposal() {
    if (!canCreateProposal) return
    const proposal = createAccessPolicyDialogProposal({
      sidecars,
      access,
      policyTarget: proposalPolicyTarget,
      state: dialogState,
    })
    if (!proposal) return

    try {
      await createAccessProposal.mutateAsync(proposal)
    } catch (error) {
      const description = error instanceof Error ? error.message : '创建权限申请失败'
      toast({ description, variant: 'destructive' })
      return
    }

    setDialogControllerState((current) => projectAccessPolicyDialogControllerProposalCreated({
      current,
      proposal,
    }))
  }

  return {
    sidecars,
    access,
    accessErrorMessage,
    currentPodPolicy,
    currentAccessSource,
    currentAccessSourceState,
    canOpenCurrentAccessSource: !!currentAccessSource?.uri,
    accessPolicySourceRows,
    accessMatrixRows,
    displayedPendingProposals,
    hasDisplayedPendingProposals,
    audience: dialogState.audience,
    audienceOptions: ACCESS_AUDIENCE_OPTIONS,
    setAudience: setAudienceValue,
    role: dialogState.role,
    roleOptions: ACCESS_ROLE_OPTIONS,
    setRole: setRoleValue,
    agentWebId: dialogState.agentWebId,
    setAgentWebId,
    reason: dialogState.reason,
    setReason,
    agentWebIdInvalid,
    canCreateProposal,
    isCreatingProposal: createAccessProposal.isPending,
    accessProposalHelp,
    openPolicySource,
    openCurrentAccessSource,
    createPendingProposal,
  }
}
