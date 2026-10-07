import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearChatDraft, loadChatDraft, saveChatDraft } from './draft-store'

describe('chat draft store', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('isolates drafts by account, chat and thread', () => {
    saveChatDraft({ accountScope: 'alice', chatId: 'chat-1', threadId: 'thread-1' }, 'Alice one')
    saveChatDraft({ accountScope: 'alice', chatId: 'chat-1', threadId: 'thread-2' }, 'Alice two')
    saveChatDraft({ accountScope: 'bob', chatId: 'chat-1', threadId: 'thread-1' }, 'Bob one')

    expect(loadChatDraft({ accountScope: 'alice', chatId: 'chat-1', threadId: 'thread-1' })).toBe('Alice one')
    expect(loadChatDraft({ accountScope: 'alice', chatId: 'chat-1', threadId: 'thread-2' })).toBe('Alice two')
    expect(loadChatDraft({ accountScope: 'bob', chatId: 'chat-1', threadId: 'thread-1' })).toBe('Bob one')
  })

  it('clears only the selected conversation draft', () => {
    const first = { accountScope: 'alice', chatId: 'chat-1' }
    const second = { accountScope: 'alice', chatId: 'chat-2' }
    saveChatDraft(first, 'first')
    saveChatDraft(second, 'second')

    clearChatDraft(first)

    expect(loadChatDraft(first)).toBe('')
    expect(loadChatDraft(second)).toBe('second')
  })

  it('does not break chat when browser storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('denied')
    })

    expect(loadChatDraft({ accountScope: 'alice', chatId: 'chat-1' })).toBe('')
    getItem.mockRestore()
  })
})
