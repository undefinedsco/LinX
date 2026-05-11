import { describe, expect, it } from 'vitest'
import { resolveInboxObjectTarget, resolveInboxScene, resolveInboxWorkspaceTarget } from './scene-restore'

describe('inbox scene restoration', () => {
  it('derives workspace and file target from thread context', () => {
    const item = {
      id: 'audit:file-1',
      kind: 'audit',
      category: 'audit',
      chatId: 'chat-1',
      threadId: 'thread-1',
      thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      about: 'https://alice.example/.data/workspaces/ws-1/output/report.md',
      audit: {
        context: JSON.stringify({
          threadUri: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
        }),
      },
    }

    const scene = resolveInboxScene(item as any, [
      {
        id: 'thread-1',
        chatId: 'chat-1',
        workspace: 'https://alice.example/.data/workspaces/ws-1/',
      },
    ] as any)

    expect(scene.workspace).toBe('https://alice.example/.data/workspaces/ws-1/')
    expect(resolveInboxWorkspaceTarget(scene)).toEqual({
      mode: 'workspace',
      treeNodeId: 'workspace:https://alice.example/.data/workspaces/ws-1/',
      fileId: null,
    })
    expect(resolveInboxObjectTarget(scene)).toEqual({
      kind: 'files',
      mode: 'resource',
      treeNodeId: 'container:https://alice.example/.data/workspaces/ws-1/output/',
      fileId: 'https://alice.example/.data/workspaces/ws-1/output/report.md',
    })
  })

  it('maps related approval uri back to approval card', () => {
    const scene = resolveInboxScene({
      id: 'audit:approval-1',
      kind: 'audit',
      category: 'audit',
      audit: {
        approval: 'https://alice.example/.data/approvals/approval-1.ttl#this',
        context: null,
      },
    } as any, [])

    expect(resolveInboxObjectTarget(scene)).toEqual({
      kind: 'approval',
      approvalItemId: 'approval:approval-1',
    })
  })

  it('maps local workspace to local files tree node', () => {
    const scene = resolveInboxScene({
      id: 'audit:local-1',
      kind: 'audit',
      category: 'audit',
      chatId: 'chat-2',
      threadId: 'thread-2',
      audit: {
        context: JSON.stringify({
          workspace: 'linx://node-123/repo/linx',
        }),
      },
    } as any, [])

    expect(resolveInboxWorkspaceTarget(scene)).toEqual({
      mode: 'workspace',
      treeNodeId: 'local-workspace:linx://node-123/repo/linx',
      fileId: null,
    })
  })
})
