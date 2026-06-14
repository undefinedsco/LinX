import { describe, expect, it } from 'vitest'
import { buildLocalWorkspaceId, type WorkspaceContainerMetadata } from '@/lib/data/workspace-uri'
import type { RuntimeSessionRecord } from './runtime-client'
import { buildWorkspaceSummary } from './workspace-summary'

function createRuntimeSession(overrides: Partial<RuntimeSessionRecord> = {}): RuntimeSessionRecord {
  return {
    id: 'runtime-1',
    threadId: 'thread-1',
    container: 'linx://device-123/repo/linx',
    title: 'Runtime',
    repoPath: '/repo/linx',
    folderPath: '/repo/linx',
    runnerType: 'xpod-pty',
    tool: 'codex',
    status: 'active',
    tokenUsage: 0,
    createdAt: '2026-03-27T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
    lastActivityAt: '2026-03-27T00:00:00Z',
    baseRef: 'HEAD',
    branch: 'feature/runtime',
    ...overrides,
  }
}

function createWorkspace(overrides: Partial<WorkspaceContainerMetadata> = {}): WorkspaceContainerMetadata {
  return {
    id: 'ws-1',
    title: 'Pod Workspace',
    workspaceType: 'pod',
    kind: 'folder',
    rootUri: 'https://alice.example/.data/workspaces/ws-1/',
    repoRootUri: null,
    baseRef: null,
    branch: null,
    createdAt: new Date('2026-03-27T00:00:00Z'),
    updatedAt: new Date('2026-03-27T00:00:00Z'),
    ...overrides,
  } as WorkspaceContainerMetadata
}

describe('buildWorkspaceSummary', () => {
  it('builds local workspace summary from runtime session', () => {
    expect(buildWorkspaceSummary({
      workspaceUri: 'linx://device-123/repo/linx',
      runtimeSession: createRuntimeSession(),
    })).toEqual({
      kindLabel: '本地 worktree',
      primaryText: '/repo/linx',
      secondaryText: '设备 device-123 · feature/runtime · 基于 HEAD',
    })
  })

  it('detects worktree when folder differs from repo root', () => {
    expect(buildWorkspaceSummary({
      workspaceUri: 'linx://device-123/repo/linx/worktrees/feature-x',
      runtimeSession: createRuntimeSession({
        repoPath: '/repo/linx',
        folderPath: '/repo/linx/worktrees/feature-x',
      }),
    })).toEqual({
      kindLabel: '本地 worktree',
      primaryText: '/repo/linx/worktrees/feature-x',
      secondaryText: '设备 device-123 · feature/runtime · 基于 HEAD',
    })
  })

  it('builds local worktree summary from persisted workspace row without runtime session', () => {
    const workspaceUri = 'linx://device-123/repo/linx/worktrees/feature-x'

    expect(buildWorkspaceSummary({
      workspaceUri,
      workspaces: [createWorkspace({
        id: buildLocalWorkspaceId('device-123', '/repo/linx/worktrees/feature-x'),
        title: 'Feature X',
        workspaceType: 'local',
        kind: 'worktree',
        rootUri: workspaceUri,
        repoRootUri: 'linx://device-123/repo/linx',
        branch: 'feature/x',
        baseRef: 'main',
      })],
    })).toEqual({
      kindLabel: '本地 worktree',
      primaryText: 'Feature X',
      secondaryText: '设备 device-123 · 仓库 linx://device-123/repo/linx · feature/x · 基于 main',
    })
  })

  it('builds pod workspace summary from workspace row', () => {
    expect(buildWorkspaceSummary({
      workspaceUri: 'https://alice.example/.data/workspaces/ws-1/',
      workspaces: [createWorkspace({
        branch: 'main',
        baseRef: 'origin/main',
      })],
    })).toEqual({
      kindLabel: '空间文件夹',
      primaryText: 'Pod Workspace',
      secondaryText: 'https://alice.example/.data/workspaces/ws-1/ · main · 基于 origin/main',
    })
  })
})
