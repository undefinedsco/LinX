import { describe, expect, it } from 'vitest'
import { __chatKitStoreTestInternals } from '../store'

describe('LocalChatKitStore group chat mapping', () => {
  it('preserves sender and routing metadata when loading Pod messages for group chats', () => {
    const item = __chatKitStoreTestInternals.messageRecordToItem({
      id: 'msg-1',
      role: 'assistant',
      content: 'I found two issues.',
      status: 'sent',
      createdAt: '2026-03-18T00:00:01.000Z',
      senderName: 'Codex',
      senderAvatarUrl: 'https://example.test/codex.png',
      routedBy: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
      routeTargetAgentId: 'linx-watch-codex-agent',
      coordinationId: 'watch-demo',
    }, 'thread-1') as any

    expect(item.type).toBe('assistant_message')
    expect(item.metadata).toMatchObject({
      senderName: 'Codex',
      senderAvatarUrl: 'https://example.test/codex.png',
      routedBy: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
      routeTargetAgentId: 'linx-watch-codex-agent',
      coordinationId: 'watch-demo',
    })
  })
})
