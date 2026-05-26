import { describe, expect, it, vi } from 'vitest'
import { assertInsertValuesBelongToCurrentPod, assertUpdateValuesBelongToCurrentPod } from './pod-write-guard'

const selectedSpPodUrl = 'https://node-0000.undefineds.co/alice/'

describe('pod write guard', () => {
  it('allows insert rows with actor WebIDs outside the current SP', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'chat/default/index.ttl#this',
      actor: 'https://id.undefineds.co/alice/profile/card#me',
      maker: 'https://id.undefineds.co/alice/profile/card#me',
      participants: ['https://id.undefineds.co/alice/profile/card#me'],
      avatarUrl: 'https://cdn.example/avatar.png',
      provider: 'https://api.openai.com/',
      baseUrl: 'https://api.openai.com/v1',
    })).not.toThrow()
  })

  it('refuses insert rows whose subject IRI points outside the selected SP', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'https://id.undefineds.co/alice/.data/chat/cloud/index.ttl#this',
      title: 'Wrong space',
    })).toThrow('outside the current SP')
  })

  it('refuses nested LinX business resource refs outside the selected SP', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'approval-1',
      actor: 'https://id.undefineds.co/alice/profile/card#me',
      metadata: {
        thread: 'https://id.undefineds.co/alice/.data/chat/default/index.ttl#thread-1',
      },
    })).toThrow('outside the current SP')
  })

  it('allows nested LinX business resource refs under the selected SP', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'approval-1',
      actor: 'https://id.undefineds.co/alice/profile/card#me',
      metadata: {
        thread: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#thread-1',
      },
    })).not.toThrow()
  })

  it('refuses insert rows when the current SP Pod URL is unavailable', () => {
    const db = createDb(null)

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'chat/default/index.ttl#this',
    })).toThrow('without a current SP Pod URL')
  })

  it('refuses update rows that would repoint a business relation to another SP', () => {
    const db = createDb()

    expect(() => assertUpdateValuesBelongToCurrentPod(db as any, {
      thread: 'https://id.undefineds.co/alice/.data/chat/default/index.ttl#thread-1',
    })).toThrow('outside the current SP')
  })

  it('refuses future task/run/issue/reply relations outside the selected SP', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'run/default/2026/05/26/runs.ttl#run-1',
      task: 'https://id.undefineds.co/alice/.data/task/index.ttl#task-1',
      run: 'https://node-0000.undefineds.co/alice/.data/chat/default/2026/05/26/runs.ttl#run-1',
      replyTo: 'https://node-0000.undefineds.co/alice/.data/chat/default/2026/05/26/messages.ttl#msg-1',
      parentIssue: 'https://node-0000.undefineds.co/alice/.data/issues/issue-1.ttl#this',
    })).toThrow('outside the current SP')
  })

  it('allows future task/run/issue/reply relations inside the selected SP', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'run/default/2026/05/26/runs.ttl#run-1',
      task: 'https://node-0000.undefineds.co/alice/.data/task/index.ttl#task-1',
      run: 'https://node-0000.undefineds.co/alice/.data/chat/default/2026/05/26/runs.ttl#run-1',
      replyTo: 'https://node-0000.undefineds.co/alice/.data/chat/default/2026/05/26/messages.ttl#msg-1',
      parentIssue: 'https://node-0000.undefineds.co/alice/.data/issues/issue-1.ttl#this',
    })).not.toThrow()
  })

  it('guards workspace and favorite URI fields as storage resources', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'workspace-1',
      targetUri: 'https://id.undefineds.co/alice/.data/chat/default/index.ttl#this',
    })).toThrow('outside the current SP')
    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'workspace-1',
      rootUri: 'https://id.undefineds.co/alice/.data/workspaces/ws-1/',
    })).toThrow('outside the current SP')
    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'workspace-1',
      repoRootUri: 'https://id.undefineds.co/alice/.data/repos/repo-1/',
    })).toThrow('outside the current SP')
  })

  it('allows workspace and favorite URI fields under the selected SP or non-storage local URIs', () => {
    const db = createDb()

    expect(() => assertInsertValuesBelongToCurrentPod(db as any, {
      id: 'workspace-1',
      targetUri: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
      rootUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/ws-1/',
      repoRootUri: 'linx://repository/local',
    })).not.toThrow()
  })
})

function createDb(podUrl: string | null = selectedSpPodUrl) {
  return {
    getDialect: vi.fn(() => ({
      getPodUrl: vi.fn(() => podUrl),
    })),
  }
}
