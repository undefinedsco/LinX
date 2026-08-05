import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  buildChatListQueryKey,
  buildMessageListQueryKey,
  buildThreadIndexQueryKey,
  buildThreadListQueryKey,
} from './collections'
import { readFileSync } from 'node:fs'

describe('chat query account scope', () => {
  it('does not erase live-query errors in chat list hooks', () => {
    const source = readFileSync('src/modules/chat/data/collections.ts', 'utf8')
    for (const hookName of ['useChatList', 'useThreadList', 'useThreadIndex', 'useMessageList']) {
      const start = source.indexOf(`export function ${hookName}`)
      const end = source.indexOf('\nexport function ', start + 1)
      const hookSource = source.slice(start, end < 0 ? source.length : end)
      expect(hookSource, hookName).not.toContain('error: null')
    }
  })

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

  it('isolates the runtime thread index by account scope', () => {
    expect(buildThreadIndexQueryKey('account:alice'))
      .not.toEqual(buildThreadIndexQueryKey('account:bob'))
  })

  it('isolates message caches even when chat and thread ids are reused', () => {
    expect(buildMessageListQueryKey('account:alice', 'chat-1', 'thread-1'))
      .not.toEqual(buildMessageListQueryKey('account:bob', 'chat-1', 'thread-1'))
  })

  it('routes destructive mutations through the same parameterized collections as reads', () => {
    const source = readFileSync('src/modules/chat/data/collections.ts', 'utf8')
    const deleteThreadStart = source.indexOf('async deleteThread(')
    const deleteMessageStart = source.indexOf('async deleteMessage(', deleteThreadStart)
    const deleteThreadSource = source.slice(deleteThreadStart, deleteMessageStart)
    const deleteMessageEnd = source.indexOf('\n  // ==========================================================================', deleteMessageStart)
    const deleteMessageSource = source.slice(deleteMessageStart, deleteMessageEnd)

    expect(deleteThreadSource).toContain('scopedMessageCollection')
    expect(deleteThreadSource).toContain('scopedThreadCollection')
    expect(deleteThreadSource).toContain('while (messages.length > 0)')
    expect(deleteMessageSource).toContain('scopedMessageCollection')
  })
})
