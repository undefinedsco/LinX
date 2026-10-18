import { describe, expect, it } from 'vitest'
import type { ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { alternateParents, canonicalBranchRef } from './branches'
import { itemsToAgUiMessages } from './history'

const entry = (id: string, type: 'user_message' | 'assistant_message', extra: Record<string, unknown> = {}) => ({
  uri: `pod/${id}`,
  item: (type === 'user_message'
    ? { id, type, content: [{ type: 'input_text', text: id }], created_at: 1, ...extra }
    : { id, type, content: [{ type: 'output_text', text: id }], created_at: 1, ...extra }) as unknown as ThreadItem,
})

describe('alternateParents', () => {
  it('canonicalises resource-relative ids', () => {
    expect(canonicalBranchRef('chat/m.ttl#user-1')).toBe('user-1')
    expect(canonicalBranchRef('branch-root:chat/m.ttl#user-1')).toBe('branch-root:user-1')
  })

  it('hangs an edited question under the message before it and an old answer under its question', () => {
    const active = [
      entry('q0', 'user_message'),
      entry('a0', 'assistant_message', { parent_item_id: 'q0' }),
      entry('q2', 'user_message', { parent_item_id: 'branch-root:chat/m.ttl#q1' }),
      entry('a2', 'assistant_message', { parent_item_id: 'q2' }),
    ]
    const alternates = [
      entry('chat/m.ttl#q1', 'user_message', { parent_item_id: 'branch-root:chat/m.ttl#q1' }),
      entry('a1', 'assistant_message', { parent_item_id: 'q1' }),
      entry('a2b', 'assistant_message', { parent_item_id: 'q2' }),
    ]
    alternates[0].uri = 'pod/q1'
    const parents = alternateParents(active, itemsToAgUiMessages(active), alternates, itemsToAgUiMessages(alternates))
    expect(Object.fromEntries(parents)).toEqual({ 'pod/q1': 'pod/a0', 'pod/a1': 'pod/q1', 'pod/a2b': 'pod/q2' })
  })

  it('leaves out a version whose place is unknown', () => {
    const active = [entry('q0', 'user_message')]
    const alternates = [entry('x', 'assistant_message', { parent_item_id: 'gone' })]
    expect(alternateParents(active, itemsToAgUiMessages(active), alternates, itemsToAgUiMessages(alternates)).size).toBe(0)
  })
})
