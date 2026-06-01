import { describe, expect, it } from 'vitest'
import type { WorkspaceRow } from '@/lib/data/workspace-model'
import type { RuntimeSessionRecord } from './runtime-client'
import { buildWorkspaceSummary } from './workspace-summary'

function createRuntimeSession(overrides: Partial<RuntimeSessionRecord> = {}): RuntimeSessionRecord {
  return {
    id: 'runtime-1',
    threadId: 'thread-1',
    workspaceUri: 'linx://node-123/repo/linx',
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

function createWorkspace(overrides: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    id: 'ws-1',
    title: 'Pod Workspace',
    workspaceType: 'pod',
    kind: 'folder',
    root: 'https://alice.example/.data/workspaces/ws-1/',
    repoRoot: null,
    baseRef: null,
    branch: null,
    createdAt: new Date('2026-03-27T00:00:00Z'),
    updatedAt: new Date('2026-03-27T00:00:00Z'),
    ...overrides,
  } as WorkspaceRow
}

describe('buildWorkspaceSummary', () => {
  it('builds local workspace summary from runtime session', () => {
    expect(buildWorkspaceSummary({
      workspaceUri: 'linx://node-123/repo/linx',
      runtimeSession: createRuntimeSession(),
    })).toEqual({
      kindLabel: '本地仓库',
      primaryText: '/repo/linx',
      secondaryText: '节点 node-123 · feature/runtime · 基于 HEAD',
    })
  })

  it('detects worktree when folder differs from repo root', () => {
    expect(buildWorkspaceSummary({
      workspaceUri: 'linx://node-123/repo/linx/worktrees/feature-x',
      runtimeSession: createRuntimeSession({
        repoPath: '/repo/linx',
        folderPath: '/repo/linx/worktrees/feature-x',
      }),
    })).toEqual({
      kindLabel: '本地 worktree',
      primaryText: '/repo/linx/worktrees/feature-x',
      secondaryText: '节点 node-123 · feature/runtime · 基于 HEAD',
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
      kindLabel: 'Pod 容器',
      primaryText: 'Pod Workspace',
      secondaryText: 'https://alice.example/.data/workspaces/ws-1/ · main · 基于 origin/main',
    })
  })
})
