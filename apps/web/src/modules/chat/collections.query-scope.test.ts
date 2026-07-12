import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { buildChatListQueryKey, buildThreadListQueryKey } from './collections'

describe('chat query account scope', () => {
  it('does not expose cached chat rows from a previous account scope', () => {
    const queryClient = new QueryClient()
    const aliceKey = buildChatListQueryKey('account:alice', '')
    const bobKey = buildChatListQueryKey('account:bob', '')
    queryClient.setQueryData(aliceKey, [{ id: 'alice-chat' }])

    expect(bobKey).not.toEqual(aliceKey)
    expect(queryClient.getQueryData(bobKey)).toBeUndefined()
  })

  it('isolates the same chat id thread cache by database scope', () => {
    expect(buildThreadListQueryKey('database:a', 'chat-1'))
      .not.toEqual(buildThreadListQueryKey('database:b', 'chat-1'))
  })

  it('keeps scoped thread rows reachable by existing chat mutation invalidation', async () => {
    const queryClient = new QueryClient()
    const scopedKey = buildThreadListQueryKey('database:a', 'chat-1')
    queryClient.setQueryData(scopedKey, [{ id: 'thread-1' }])

    await queryClient.invalidateQueries({ queryKey: ['chats', 'chat-1', 'threads'] })

    expect(queryClient.getQueryState(scopedKey)?.isInvalidated).toBe(true)
  })
})
