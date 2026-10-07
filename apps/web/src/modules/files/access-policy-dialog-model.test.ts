import { describe, expect, it } from 'vitest'
import { createAccessPolicyProposal } from './domain/proposal/access-approval-model'
import {
  ACCESS_AUDIENCE_OPTIONS,
  ACCESS_ROLE_OPTIONS,
  createAccessPolicyDialogProposal,
  createAccessPolicyDialogControllerState,
  getAccessMatrixRows,
  getAccessPolicySourceRows,
  getCurrentAccessSourceView,
  getCurrentPodPolicyView,
  mergePendingAccessProposals,
  pendingAccessProposalFromProposal,
  projectAccessPolicyDialogStateAfterProposalCreate,
  projectAccessPolicyDialogControllerAudienceValue,
  projectAccessPolicyDialogControllerProposalCreated,
  projectAccessPolicyDialogControllerRoleValue,
  projectAccessPolicyDialogDraftPatch,
  projectAccessQueryErrorMessage,
  projectCurrentAccessSourceState,
  projectStagedPendingAccessProposals,
  parseAccessAudience,
  parseAccessRole,
  resolveAccessProposalPolicyTarget,
  type AccessPolicyDialogSidecars,
  type AccessPolicyDialogState,
} from './domain/resource/access-policy-dialog-model'
import type { FilesAccessBasics } from './domain/resource/resource-model'

const sidecars: AccessPolicyDialogSidecars = {
  ownerUri: 'https://pod.example/public/report.md',
  accessPolicyUris: {
    acr: 'https://pod.example/public/report.md.acr',
    acl: 'https://pod.example/public/report.md.acl',
  },
}

function accessBasics(overrides: Partial<FilesAccessBasics> = {}): FilesAccessBasics {
  return {
    ownerUri: sidecars.ownerUri,
    activeSource: null,
    effectiveAccess: null,
    policySummary: null,
    candidates: [],
    ...overrides,
  }
}

const defaultDialogState: AccessPolicyDialogState = {
  audience: 'public',
  role: 'viewer',
  agentWebId: '',
  reason: '',
}

describe('access policy dialog model', () => {
  it('owns access option rows and parses renderer string values', () => {
    expect(ACCESS_AUDIENCE_OPTIONS).toEqual([
      { value: 'public', label: '公开访问' },
      { value: 'authenticated', label: '已登录用户' },
      { value: 'agent', label: 'Agent/WebID' },
    ])
    expect(ACCESS_ROLE_OPTIONS).toEqual([
      { value: 'viewer', label: '查看' },
      { value: 'contributor', label: '贡献' },
      { value: 'editor', label: '编辑' },
      { value: 'manager', label: '管理' },
    ])
    expect(parseAccessAudience('agent')).toBe('agent')
    expect(parseAccessAudience('unknown')).toBe('public')
    expect(parseAccessRole('editor')).toBe('editor')
    expect(parseAccessRole('unknown')).toBe('viewer')
  })

  it('targets a direct active ACL policy for canonical write review', () => {
    const target = resolveAccessProposalPolicyTarget(accessBasics({
      activeSource: {
        provider: 'acl',
        uri: sidecars.accessPolicyUris.acl,
        confidence: 'linked',
        inheritance: 'direct',
      },
    }), sidecars)

    expect(target).toEqual({
      activePolicyUri: sidecars.accessPolicyUris.acl,
      targetPolicyUri: sidecars.accessPolicyUris.acl,
      provider: 'acl',
      isCandidateAcl: false,
      candidateLabel: null,
    })
  })

  it('keeps inherited ACR proposals on the owner ACR candidate', () => {
    const target = resolveAccessProposalPolicyTarget(accessBasics({
      activeSource: {
        provider: 'acr',
        uri: 'https://pod.example/public/.acr',
        confidence: 'linked',
        inheritance: 'inherited-or-candidate',
      },
      candidates: [
        {
          provider: 'acr',
          uri: sidecars.accessPolicyUris.acr,
          existence: {
            uri: sidecars.accessPolicyUris.acr,
            state: 'missing',
          },
        },
        {
          provider: 'acl',
          uri: sidecars.accessPolicyUris.acl,
          existence: {
            uri: sidecars.accessPolicyUris.acl,
            state: 'exists',
          },
        },
      ],
    }), sidecars)

    expect(target).toMatchObject({
      activePolicyUri: null,
      targetPolicyUri: sidecars.accessPolicyUris.acr,
      provider: 'acr',
      candidateLabel: 'ACR',
    })
  })

  it('merges hydrated and local pending proposals without duplicating ids', () => {
    const hydrated = createAccessPolicyProposal({
      ownerUri: sidecars.ownerUri,
      activePolicyUri: sidecars.accessPolicyUris.acl,
      targetPolicyUri: sidecars.accessPolicyUris.acl,
      provider: 'acl',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: 'Hydrated request.',
      createdAt: '2026-06-28T00:00:00.000Z',
    })

    expect(mergePendingAccessProposals([hydrated], [
      pendingAccessProposalFromProposal(hydrated),
      {
        id: 'local',
        audienceLabel: '已登录用户',
        modes: '可查看、可追加',
        reason: 'Local optimistic request.',
        proposalResourceUri: 'https://pod.example/.data/proposals/access/local.ttl',
      },
    ])).toEqual([
      {
        id: 'local',
        audienceLabel: '已登录用户',
        modes: '可查看、可追加',
        reason: 'Local optimistic request.',
        proposalResourceUri: 'https://pod.example/.data/proposals/access/local.ttl',
      },
      pendingAccessProposalFromProposal(hydrated),
    ])
  })

  it('stages local pending proposals and projects the post-create dialog state', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: sidecars.ownerUri,
      activePolicyUri: sidecars.accessPolicyUris.acl,
      targetPolicyUri: sidecars.accessPolicyUris.acl,
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let the agent update the report.',
      createdAt: '2026-06-28T00:00:00.000Z',
    })

    expect(projectStagedPendingAccessProposals({
      current: [{
        id: 'existing',
        audienceLabel: '公开访问',
        modes: '可查看',
        reason: 'Existing request.',
        proposalResourceUri: 'https://pod.example/.data/proposals/access/existing.ttl',
      }],
      proposal,
    })).toEqual([
      pendingAccessProposalFromProposal(proposal),
      {
        id: 'existing',
        audienceLabel: '公开访问',
        modes: '可查看',
        reason: 'Existing request.',
        proposalResourceUri: 'https://pod.example/.data/proposals/access/existing.ttl',
      },
    ])
    expect(projectAccessPolicyDialogStateAfterProposalCreate({
      audience: 'agent',
      role: 'editor',
      agentWebId: 'https://agent.example/profile#me',
      reason: 'Let the agent update the report.',
    })).toEqual({
      audience: 'agent',
      role: 'editor',
      agentWebId: '',
      reason: '',
    })
    expect(projectAccessPolicyDialogStateAfterProposalCreate({
      audience: 'public',
      role: 'viewer',
      agentWebId: 'kept for non-agent draft recovery',
      reason: 'Public access.',
    })).toEqual({
      audience: 'public',
      role: 'viewer',
      agentWebId: 'kept for non-agent draft recovery',
      reason: '',
    })
  })

  it('projects access dialog draft and local pending state transitions as one controller state', () => {
    const initial = createAccessPolicyDialogControllerState()

    expect(initial).toEqual({
      draft: defaultDialogState,
      pendingProposals: [],
    })

    const withAudience = projectAccessPolicyDialogControllerAudienceValue({
      current: initial,
      value: 'agent',
    })
    const withRole = projectAccessPolicyDialogControllerRoleValue({
      current: withAudience,
      value: 'editor',
    })
    const withDraft = projectAccessPolicyDialogDraftPatch({
      current: withRole,
      patch: {
        agentWebId: 'https://agent.example/profile#me',
        reason: 'Let the agent update the report.',
      },
    })
    const proposal = createAccessPolicyProposal({
      ownerUri: sidecars.ownerUri,
      activePolicyUri: sidecars.accessPolicyUris.acl,
      targetPolicyUri: sidecars.accessPolicyUris.acl,
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let the agent update the report.',
      createdAt: '2026-06-28T00:00:00.000Z',
    })
    const afterCreate = projectAccessPolicyDialogControllerProposalCreated({
      current: withDraft,
      proposal,
    })

    expect(withDraft.draft).toEqual({
      audience: 'agent',
      role: 'editor',
      agentWebId: 'https://agent.example/profile#me',
      reason: 'Let the agent update the report.',
    })
    expect(afterCreate).toEqual({
      draft: {
        audience: 'agent',
        role: 'editor',
        agentWebId: '',
        reason: '',
      },
      pendingProposals: [pendingAccessProposalFromProposal(proposal)],
    })
    expect(projectAccessPolicyDialogControllerAudienceValue({
      current: afterCreate,
      value: 'unknown',
    }).draft.audience).toBe('public')
    expect(projectAccessPolicyDialogControllerRoleValue({
      current: afterCreate,
      value: 'unknown',
    }).draft.role).toBe('viewer')
  })

  it('creates the access proposal DTO from dialog state and resolved target', () => {
    const target = resolveAccessProposalPolicyTarget(accessBasics({
      activeSource: {
        provider: 'acl',
        uri: sidecars.accessPolicyUris.acl,
        confidence: 'linked',
        inheritance: 'direct',
      },
    }), sidecars)

    expect(createAccessPolicyDialogProposal({
      sidecars,
      access: null,
      policyTarget: target,
      state: {
        ...defaultDialogState,
        audience: 'agent',
        agentWebId: 'https://agent.example/profile#me',
        role: 'editor',
        reason: 'Let the agent update the report.',
      },
    })).toMatchObject({
      ownerUri: sidecars.ownerUri,
      activePolicyUri: sidecars.accessPolicyUris.acl,
      targetPolicyUri: sidecars.accessPolicyUris.acl,
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let the agent update the report.',
      writesCanonicalPolicy: false,
    })
  })

  it('projects active policy source and candidate source rows for the dialog renderer', () => {
    const access = accessBasics({
      activeSource: {
        provider: 'acr',
        uri: sidecars.accessPolicyUris.acr,
        confidence: 'linked',
        inheritance: 'inherited-or-candidate',
      },
      candidates: [
        {
          provider: 'acr',
          uri: sidecars.accessPolicyUris.acr,
          existence: {
            uri: sidecars.accessPolicyUris.acr,
            state: 'exists',
          },
        },
        {
          provider: 'acl',
          uri: sidecars.accessPolicyUris.acl,
          existence: {
            uri: sidecars.accessPolicyUris.acl,
            state: 'missing',
          },
        },
      ],
    })

    expect(getCurrentPodPolicyView(access, null)).toMatchObject({
      provider: 'acr',
      providerLabel: 'ACR',
      state: '继承策略',
    })
    expect(getCurrentAccessSourceView(access)).toEqual({
      provider: 'acr',
      providerLabel: 'ACR',
      uri: sidecars.accessPolicyUris.acr,
      inheritanceLabel: '继承/候选',
    })
    expect(getAccessPolicySourceRows(access, sidecars)).toEqual([
      {
        provider: 'ACR',
        uri: sidecars.accessPolicyUris.acr,
        state: '已找到',
        canOpen: true,
      },
      {
        provider: 'ACL',
        uri: sidecars.accessPolicyUris.acl,
        state: '未找到',
        canOpen: false,
      },
    ])
  })

  it('projects current access source loading, error, linked, and empty states for the renderer', () => {
    expect(projectAccessQueryErrorMessage(null)).toBeNull()
    expect(projectAccessQueryErrorMessage(new Error('HTTP 403'))).toBe('HTTP 403')
    expect(projectAccessQueryErrorMessage('denied')).toBe('未知错误')

    expect(projectCurrentAccessSourceState({
      isLoading: true,
      errorMessage: null,
      currentAccessSource: null,
    })).toEqual({
      kind: 'loading',
      message: '正在读取权限信息...',
    })

    expect(projectCurrentAccessSourceState({
      isLoading: false,
      errorMessage: 'HTTP 403',
      currentAccessSource: null,
    })).toEqual({
      kind: 'error',
      message: 'HTTP 403',
      title: '权限信息读取失败',
    })

    expect(projectCurrentAccessSourceState({
      isLoading: false,
      errorMessage: null,
      currentAccessSource: {
        provider: 'acl',
        providerLabel: 'ACL',
        uri: sidecars.accessPolicyUris.acl,
        inheritanceLabel: '当前资源',
      },
    })).toEqual({
      description: '已关联当前资源的访问规则',
      kind: 'linked',
      source: {
        provider: 'acl',
        providerLabel: 'ACL',
        uri: sidecars.accessPolicyUris.acl,
        inheritanceLabel: '当前资源',
      },
      statusLabel: '已关联',
    })

    expect(projectCurrentAccessSourceState({
      isLoading: false,
      errorMessage: null,
      currentAccessSource: null,
    })).toEqual({
      kind: 'empty',
      message: '没有发现已关联的权限来源。',
    })
  })

  it('projects access matrix rows from effective access and policy grants', () => {
    expect(getAccessMatrixRows(accessBasics({
      effectiveAccess: {
        user: { read: true, append: true, write: false, control: false },
        public: { read: true, append: false, write: false, control: false },
      },
      policySummary: {
        uri: sidecars.accessPolicyUris.acl,
        provider: 'acl',
        state: 'exists',
        grants: [
          {
            audience: 'authenticated',
            audienceRef: 'authenticated',
            modes: { read: true, append: true, write: false, control: false },
          },
          {
            audience: 'agent',
            audienceRef: 'https://agent.example/profile#me',
            modes: { read: true, append: true, write: true, control: false },
          },
        ],
      },
    }))).toEqual([
      { label: '当前会话', value: '可查看、可追加' },
      { label: 'public', value: '可查看' },
      { label: 'authenticated', value: '可查看、可追加' },
      { label: 'app / agent', value: 'https://agent.example/profile#me · 可查看、可追加、可编辑' },
      { label: 'owner', value: '需读取策略' },
    ])
  })
})
