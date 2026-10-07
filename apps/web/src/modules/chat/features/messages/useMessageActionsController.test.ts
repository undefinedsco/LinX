import { describe, expect, it } from 'vitest'
import type { ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { canonicalChatKitItemId, resolveActionUserMessageId } from './useMessageActionsController'

describe('canonicalChatKitItemId', () => {
  it('treats a full RDF subject and its base-relative id as the same item', () => {
    expect(canonicalChatKitItemId('chat/__secretary__/2026/08/23/messages.ttl#user-message-1'))
      .toBe('user-message-1')
    expect(canonicalChatKitItemId('user-message-1')).toBe('user-message-1')
  })

  it('keeps ids without a fragment unchanged', () => {
    expect(canonicalChatKitItemId('assistant-message-1')).toBe('assistant-message-1')
  })
})

describe('resolveActionUserMessageId', () => {
  it('resolves an assistant selection to the user message that owns its answer branch', () => {
    const items = [{
      id: 'https://pod.example/messages.ttl#assistant-2',
      type: 'assistant_message',
      parent_item_id: 'https://pod.example/messages.ttl#user-1',
    }] as unknown as ThreadItem[]

    expect(resolveActionUserMessageId({ id: 'assistant-2', role: 'assistant' }, items))
      .toBe('https://pod.example/messages.ttl#user-1')
  })

  it('keeps a selected user message as the branch owner', () => {
    expect(resolveActionUserMessageId({ id: 'user-1', role: 'user' }, []))
      .toBe('user-1')
  })
})
