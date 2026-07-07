import {
  createAccessPolicyProposal,
  type AccessPolicyProposal,
  type AccessProposalAudience,
  type AccessProposalRole,
} from '../proposal/access-approval-model'
import type { FilesAccessBasics } from './resource-model'
import type { FilesResourceSidecars } from './resource-semantics'

export type AccessAudience = AccessProposalAudience
export type AccessRole = AccessProposalRole

export type AccessPolicyDialogSidecars = Pick<FilesResourceSidecars, 'ownerUri' | 'accessPolicyUris'>

export type PendingAccessProposal = {
  id: string
  audienceLabel: string
  modes: string
  reason: string
  proposalResourceUri: string
}

export type AccessPolicyDialogState = {
  audience: AccessAudience
  role: AccessRole
  agentWebId: string
  reason: string
}

export type AccessPolicyDialogControllerState = {
  draft: AccessPolicyDialogState
  pendingProposals: PendingAccessProposal[]
}

export type AccessProposalPolicyTarget = {
  activePolicyUri: string | null
  targetPolicyUri: string
  provider: AccessPolicyProposal['provider']
  isCandidateAcl: boolean
  candidateLabel: 'ACL' | 'ACR' | null
}

type AccessModes = {
  read: boolean
  append: boolean
  write: boolean
  control?: boolean
}

export type CurrentAccessSourceView = {
  provider: 'acr' | 'acl' | 'unknown'
  providerLabel: string
  uri: string
  inheritanceLabel: string
}

export type CurrentAccessSourceState =
  | {
    kind: 'loading'
    message: string
  }
  | {
    kind: 'error'
    title: string
    message: string
  }
  | {
    kind: 'linked'
    description: string
    source: CurrentAccessSourceView
    statusLabel: string
  }
  | {
    kind: 'empty'
    message: string
  }

export type AccessPolicySourceRowView = {
  provider: 'ACR' | 'ACL'
  uri: string
  state: string
  canOpen: boolean
}

export type AccessMatrixRowView = {
  label: string
  value: string
}

export const ACCESS_ROLE_MODES: Record<AccessRole, string> = {
  viewer: '可查看',
  contributor: '可查看、可追加',
  editor: '可查看、可追加、可编辑',
  manager: '可查看、可追加、可编辑、可管理权限',
}

export const ACCESS_ROLE_MODE_TOKENS: Record<AccessRole, string[]> = {
  viewer: ['read'],
  contributor: ['read', 'append'],
  editor: ['read', 'append', 'write'],
  manager: ['read', 'append', 'write', 'control'],
}

export const ACCESS_PROVIDER_LABELS: Record<'acr' | 'acl' | 'unknown', string> = {
  acr: 'ACR',
  acl: 'ACL',
  unknown: '未知',
}

export const ACCESS_SOURCE_STATE_LABELS: Record<string, string> = {
  exists: '已找到',
  missing: '未找到',
  inaccessible: '不可访问',
  unknown: '未知',
}

export const ACCESS_AUDIENCE_LABELS: Record<AccessAudience, string> = {
  public: '公开访问',
  authenticated: '已登录用户',
  agent: 'Agent/WebID',
}

export const ACCESS_AUDIENCE_OPTIONS: readonly {
  value: AccessAudience
  label: string
}[] = [
  { value: 'public', label: ACCESS_AUDIENCE_LABELS.public },
  { value: 'authenticated', label: ACCESS_AUDIENCE_LABELS.authenticated },
  { value: 'agent', label: ACCESS_AUDIENCE_LABELS.agent },
]

export const ACCESS_ROLE_OPTIONS: readonly {
  value: AccessRole
  label: string
}[] = [
  { value: 'viewer', label: '查看' },
  { value: 'contributor', label: '贡献' },
  { value: 'editor', label: '编辑' },
  { value: 'manager', label: '管理' },
]

export function parseAccessAudience(value: string): AccessAudience {
  return ACCESS_AUDIENCE_OPTIONS.some((option) => option.value === value)
    ? value as AccessAudience
    : 'public'
}

export function parseAccessRole(value: string): AccessRole {
  return ACCESS_ROLE_OPTIONS.some((option) => option.value === value)
    ? value as AccessRole
    : 'viewer'
}

export function createAccessPolicyDialogControllerState(): AccessPolicyDialogControllerState {
  return {
    draft: {
      audience: 'public',
      role: 'viewer',
      agentWebId: '',
      reason: '',
    },
    pendingProposals: [],
  }
}

export function projectAccessPolicyDialogDraftPatch({
  current,
  patch,
}: {
  current: AccessPolicyDialogControllerState
  patch: Partial<AccessPolicyDialogState>
}): AccessPolicyDialogControllerState {
  return {
    ...current,
    draft: {
      ...current.draft,
      ...patch,
    },
  }
}

export function projectAccessPolicyDialogControllerAudienceValue({
  current,
  value,
}: {
  current: AccessPolicyDialogControllerState
  value: string
}): AccessPolicyDialogControllerState {
  return projectAccessPolicyDialogDraftPatch({
    current,
    patch: { audience: parseAccessAudience(value) },
  })
}

export function projectAccessPolicyDialogControllerRoleValue({
  current,
  value,
}: {
  current: AccessPolicyDialogControllerState
  value: string
}): AccessPolicyDialogControllerState {
  return projectAccessPolicyDialogDraftPatch({
    current,
    patch: { role: parseAccessRole(value) },
  })
}

export function isValidAgentWebId(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isAccessDialogAgentWebIdInvalid(state: AccessPolicyDialogState) {
  const trimmedAgentWebId = state.agentWebId.trim()
  return state.audience === 'agent' && trimmedAgentWebId.length > 0 && !isValidAgentWebId(trimmedAgentWebId)
}

export function resolveAccessProposalPolicyTarget(
  access: FilesAccessBasics | null | undefined,
  sidecars: AccessPolicyDialogSidecars,
): AccessProposalPolicyTarget | null {
  const candidateAcrSource = access?.candidates.find((candidate) => (
    candidate.provider === 'acr' &&
    candidate.uri === sidecars.accessPolicyUris.acr &&
    candidate.existence.state === 'exists'
  )) ?? null
  const candidateInheritedAcrSource = access?.activeSource?.provider === 'acr' && access.activeSource.inheritance !== 'direct'
    ? access.candidates.find((candidate) => (
        candidate.provider === 'acr' &&
        candidate.uri === sidecars.accessPolicyUris.acr &&
        (candidate.existence.state === 'exists' || candidate.existence.state === 'missing')
      )) ?? null
    : null
  const candidateAclSource = access?.candidates.find((candidate) => (
    candidate.provider === 'acl' &&
    candidate.uri === sidecars.accessPolicyUris.acl &&
    (candidate.existence.state === 'exists' || candidate.existence.state === 'missing')
  )) ?? null

  if (access?.activeSource?.uri && access.activeSource.inheritance === 'direct') {
    return {
      activePolicyUri: access.activeSource.uri,
      targetPolicyUri: access.activeSource.uri,
      provider: access.activeSource.provider,
      isCandidateAcl: false,
      candidateLabel: null,
    }
  }

  if (candidateInheritedAcrSource) {
    return {
      activePolicyUri: null,
      targetPolicyUri: candidateInheritedAcrSource.uri,
      provider: 'acr',
      isCandidateAcl: false,
      candidateLabel: 'ACR',
    }
  }

  if (candidateAcrSource) {
    return {
      activePolicyUri: null,
      targetPolicyUri: candidateAcrSource.uri,
      provider: 'acr',
      isCandidateAcl: false,
      candidateLabel: 'ACR',
    }
  }

  if (candidateAclSource) {
    return {
      activePolicyUri: null,
      targetPolicyUri: candidateAclSource.uri,
      provider: 'acl',
      isCandidateAcl: true,
      candidateLabel: 'ACL',
    }
  }

  return null
}

export function canApplyAccessPolicyDialogProposal(access: FilesAccessBasics | null | undefined) {
  return access?.activeSource?.provider === 'acl' && !!access.activeSource.uri && access.activeSource.inheritance === 'direct'
}

export function canCreateAccessPolicyDialogProposal({
  hasAccessQueryError,
  policyTarget,
  state,
}: {
  hasAccessQueryError: boolean
  policyTarget: AccessProposalPolicyTarget | null
  state: AccessPolicyDialogState
}) {
  const trimmedAgentWebId = state.agentWebId.trim()
  return !hasAccessQueryError
    && !!policyTarget
    && (state.audience !== 'agent' || (trimmedAgentWebId.length > 0 && !isAccessDialogAgentWebIdInvalid(state)))
}

export function getAccessProposalAudienceLabel(state: AccessPolicyDialogState) {
  return state.audience === 'agent'
    ? state.agentWebId.trim() || 'Agent/WebID'
    : ACCESS_AUDIENCE_LABELS[state.audience]
}

export function getCurrentPodPolicyView(
  access: FilesAccessBasics | null | undefined,
  policyTarget: AccessProposalPolicyTarget | null,
) {
  const provider = access?.activeSource?.provider ?? policyTarget?.provider ?? 'unknown'
  return {
    provider,
    providerLabel: ACCESS_PROVIDER_LABELS[provider],
    state: access?.activeSource
      ? (access.activeSource.inheritance === 'direct' ? '直接策略' : '继承策略')
      : policyTarget?.candidateLabel
        ? '候选策略'
        : '未确认',
    description: access?.activeSource
      ? '此资源使用已关联的访问规则。'
      : policyTarget?.candidateLabel
        ? `发现候选 ${policyTarget.candidateLabel}，尚未关联为当前权限来源。`
        : '等待 Pod 确认策略来源',
  }
}

export function getCurrentAccessSourceView(access: FilesAccessBasics | null | undefined): CurrentAccessSourceView | null {
  if (!access?.activeSource) return null
  return {
    provider: access.activeSource.provider,
    providerLabel: ACCESS_PROVIDER_LABELS[access.activeSource.provider],
    uri: access.activeSource.uri,
    inheritanceLabel: access.activeSource.inheritance === 'direct' ? '当前资源' : '继承/候选',
  }
}

export function projectAccessQueryErrorMessage(error: unknown): string | null {
  if (!error) return null
  return error instanceof Error ? error.message : '未知错误'
}

export function projectCurrentAccessSourceState({
  isLoading,
  errorMessage,
  currentAccessSource,
}: {
  isLoading: boolean
  errorMessage: string | null
  currentAccessSource: CurrentAccessSourceView | null
}): CurrentAccessSourceState {
  if (isLoading) {
    return {
      kind: 'loading',
      message: '正在读取权限信息...',
    }
  }

  if (errorMessage) {
    return {
      kind: 'error',
      title: '权限信息读取失败',
      message: errorMessage,
    }
  }

  if (currentAccessSource) {
    return {
      description: '已关联当前资源的访问规则',
      kind: 'linked',
      source: currentAccessSource,
      statusLabel: '已关联',
    }
  }

  return {
    kind: 'empty',
    message: '没有发现已关联的权限来源。',
  }
}

export function getAccessPolicySourceRows(
  access: FilesAccessBasics | null | undefined,
  sidecars: AccessPolicyDialogSidecars,
): AccessPolicySourceRowView[] {
  return [
    {
      provider: 'ACR',
      uri: sidecars.accessPolicyUris.acr,
      state: accessSourceStateLabel(access, 'acr', sidecars.accessPolicyUris.acr),
      canOpen: canOpenAccessPolicySource(access, sidecars.accessPolicyUris.acr),
    },
    {
      provider: 'ACL',
      uri: sidecars.accessPolicyUris.acl,
      state: accessSourceStateLabel(access, 'acl', sidecars.accessPolicyUris.acl),
      canOpen: canOpenAccessPolicySource(access, sidecars.accessPolicyUris.acl),
    },
  ]
}

function accessSourceStateLabel(
  access: FilesAccessBasics | null | undefined,
  provider: 'acr' | 'acl',
  uri: string,
) {
  const state = access?.candidates.find((candidate) => candidate.provider === provider && candidate.uri === uri)?.existence.state ?? 'unknown'
  return ACCESS_SOURCE_STATE_LABELS[state]
}

function canOpenAccessPolicySource(access: FilesAccessBasics | null | undefined, uri: string) {
  const candidate = access?.candidates.find((source) => source.uri === uri)
  return access?.activeSource?.uri === uri && candidate?.existence.state === 'exists'
}

function formatAccessLine(label: string, access?: AccessModes | null) {
  if (!access) return `${label}：未知`
  const modes = [
    access.read ? '可查看' : null,
    access.append ? '可追加' : null,
    access.write ? '可编辑' : null,
    access.control ? '可管理权限' : null,
  ].filter(Boolean)
  return `${label}：${modes.length > 0 ? modes.join('、') : '无'}`
}

export function formatAccessModes(access?: AccessModes | null) {
  if (!access) return '需读取策略'
  return formatAccessLine('', access).replace(/^：/, '')
}

export function getAccessMatrixRows(access: FilesAccessBasics | null | undefined): AccessMatrixRowView[] {
  const grants = access?.policySummary?.grants ?? []
  const publicGrant = grants.find((grant) => grant.audience === 'public')
  const authenticatedGrant = grants.find((grant) => grant.audience === 'authenticated')
  const agentGrants = grants.filter((grant) => grant.audience === 'agent')
  return [
    { label: '当前会话', value: formatAccessModes(access?.effectiveAccess?.user) },
    { label: 'public', value: formatAccessModes(access?.effectiveAccess?.public ?? publicGrant?.modes) },
    { label: 'authenticated', value: formatAccessModes(authenticatedGrant?.modes) },
    {
      label: 'app / agent',
      value: agentGrants.length > 0
        ? agentGrants.map((grant) => `${grant.audienceRef} · ${formatAccessModes(grant.modes)}`).join('\n')
        : '需读取策略',
    },
    { label: 'owner', value: '需读取策略' },
  ]
}

export function getAccessProposalHelp({
  access,
  policyTarget,
  state,
}: {
  access: FilesAccessBasics | null | undefined
  policyTarget: AccessProposalPolicyTarget | null
  state: AccessPolicyDialogState
}) {
  const proposalAudienceLabel = getAccessProposalAudienceLabel(state)
  if (access?.activeSource?.provider === 'acr') {
    return `申请预览：${proposalAudienceLabel} · ${ACCESS_ROLE_MODES[state.role]}。ACR 申请会进入审批链，暂不直接写入策略。`
  }
  if (canApplyAccessPolicyDialogProposal(access)) {
    return `申请预览：${proposalAudienceLabel} · ${ACCESS_ROLE_MODES[state.role]}`
  }
  if (policyTarget?.candidateLabel) {
    return `申请预览：${proposalAudienceLabel} · ${ACCESS_ROLE_MODES[state.role]}。候选 ${policyTarget.candidateLabel}，确认前不会写入策略。`
  }
  return '需要先确认已关联的 ACL/ACR 策略来源，才能提交权限变更申请。'
}

export function createAccessPolicyDialogProposal({
  sidecars,
  access,
  policyTarget,
  state,
}: {
  sidecars: AccessPolicyDialogSidecars
  access: FilesAccessBasics | null | undefined
  policyTarget: AccessProposalPolicyTarget | null
  state: AccessPolicyDialogState
}) {
  if (!policyTarget) return null
  const trimmedAgentWebId = state.agentWebId.trim()
  return createAccessPolicyProposal({
    ownerUri: sidecars.ownerUri,
    activePolicyUri: policyTarget.activePolicyUri ?? access?.activeSource?.uri ?? null,
    targetPolicyUri: policyTarget.targetPolicyUri,
    provider: policyTarget.provider,
    audience: state.audience,
    audienceRef: state.audience === 'agent' ? trimmedAgentWebId : state.audience,
    role: state.role,
    modes: ACCESS_ROLE_MODE_TOKENS[state.role],
    reason: state.reason,
  })
}

export function pendingAccessProposalFromProposal(proposal: AccessPolicyProposal): PendingAccessProposal {
  return {
    id: proposal.id,
    audienceLabel: proposal.audience === 'agent' ? proposal.audienceRef : ACCESS_AUDIENCE_LABELS[proposal.audience],
    modes: ACCESS_ROLE_MODES[proposal.role],
    reason: proposal.reason.trim() || '未填写说明。',
    proposalResourceUri: proposal.proposalResourceUri,
  }
}

export function projectStagedPendingAccessProposals({
  current,
  proposal,
}: {
  current: readonly PendingAccessProposal[]
  proposal: AccessPolicyProposal
}): PendingAccessProposal[] {
  if (current.some((candidate) => candidate.id === proposal.id)) {
    return [...current]
  }
  return [
    pendingAccessProposalFromProposal(proposal),
    ...current,
  ]
}

export function projectAccessPolicyDialogStateAfterProposalCreate(
  state: AccessPolicyDialogState,
): AccessPolicyDialogState {
  return {
    ...state,
    agentWebId: state.audience === 'agent' ? '' : state.agentWebId,
    reason: '',
  }
}

export function projectAccessPolicyDialogControllerProposalCreated({
  current,
  proposal,
}: {
  current: AccessPolicyDialogControllerState
  proposal: AccessPolicyProposal
}): AccessPolicyDialogControllerState {
  return {
    draft: projectAccessPolicyDialogStateAfterProposalCreate(current.draft),
    pendingProposals: projectStagedPendingAccessProposals({
      current: current.pendingProposals,
      proposal,
    }),
  }
}

export function mergePendingAccessProposals(
  hydrated: AccessPolicyProposal[],
  local: PendingAccessProposal[],
): PendingAccessProposal[] {
  const proposals = hydrated.map(pendingAccessProposalFromProposal)
  const seen = new Set(proposals.map((proposal) => proposal.id))
  for (const proposal of local) {
    if (seen.has(proposal.id)) continue
    seen.add(proposal.id)
    proposals.unshift(proposal)
  }
  return proposals
}
