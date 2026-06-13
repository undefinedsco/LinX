import { describe, expect, it } from 'vitest'
import {
  buildLocalWorkspaceId,
  buildLocalWorkspaceUri,
  inferWorkspaceKind,
  normalizeWorkspaceKind,
  parseLocalWorkspaceUri,
  resolveLocalRepoRootUri,
  resolveWorkspaceIdFromUri,
} from './workspace-model'

describe('workspace-model', () => {
  it('builds stable local workspace uri and id from node plus path', () => {
    const uri = buildLocalWorkspaceUri('node-0000', '/Users/alice/repo/linx/')

    expect(uri).toBe('linx://node-0000/Users/alice/repo/linx')
    expect(parseLocalWorkspaceUri(uri)).toEqual({
      nodeId: 'node-0000',
      path: '/Users/alice/repo/linx',
    })
    expect(resolveWorkspaceIdFromUri(uri)).toBe(buildLocalWorkspaceId('node-0000', '/Users/alice/repo/linx'))
  })

  it('resolves pod workspace id from workspace container uri', () => {
    expect(resolveWorkspaceIdFromUri('https://alice.example/.data/workspaces/thread-1/')).toBe('thread-1')
  })

  it('infers folder and worktree kinds from repo/folder paths', () => {
    expect(inferWorkspaceKind({})).toBe('folder')
    expect(inferWorkspaceKind({ repoPath: '/repo/linx' })).toBe('worktree')
    expect(inferWorkspaceKind({
      repoPath: '/repo/linx',
      folderPath: '/repo/linx',
    })).toBe('worktree')
    expect(inferWorkspaceKind({
      repoPath: '/repo/linx',
      folderPath: '/repo/linx-worktrees/feature-a',
    })).toBe('worktree')
  })

  it('normalizes legacy git kind to worktree without keeping git as a public kind', () => {
    expect(normalizeWorkspaceKind('git')).toBe('worktree')
    expect(normalizeWorkspaceKind('worktree')).toBe('worktree')
    expect(normalizeWorkspaceKind('folder')).toBe('folder')
  })

  it('derives local repository root uri for worktree metadata', () => {
    expect(resolveLocalRepoRootUri({
      workspaceUri: buildLocalWorkspaceUri('node-0000', '/repo/linx-worktrees/feature-a'),
      repoPath: '/repo/linx',
    })).toBe('linx://node-0000/repo/linx')
  })
})
