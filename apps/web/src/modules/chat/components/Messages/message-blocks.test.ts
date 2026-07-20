import { describe, expect, it } from 'vitest'
import {
  MessageBlockStatus,
  MessageBlockType,
  parseMessageBlocks,
  serializeMessageBlocks,
  type MessageBlock,
} from './message-blocks'

describe('message block persistence adapter', () => {
  it('round-trips the shared models representation without changing durable fields', () => {
    const blocks: MessageBlock[] = [{
      id: 'block-durable',
      messageId: 'message-durable',
      type: MessageBlockType.MAIN_TEXT,
      status: MessageBlockStatus.SUCCESS,
      createdAt: '2026-07-20T10:00:00.000Z',
      content: 'Persist this exact block.',
    }]

    expect(parseMessageBlocks(serializeMessageBlocks(blocks), {
      messageId: 'message-override',
      createdAt: '2026-07-21T10:00:00.000Z',
    })).toEqual(blocks)
  })

  it('fills message identity for legacy rich content without replacing generated block identity', () => {
    const blocks = parseMessageBlocks(JSON.stringify({ thought: 'Legacy reasoning' }), {
      messageId: 'message-legacy',
      createdAt: '2026-07-20T11:00:00.000Z',
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      id: 'legacy-thought',
      messageId: 'message-legacy',
      type: MessageBlockType.THINKING,
      content: 'Legacy reasoning',
      status: MessageBlockStatus.SUCCESS,
    })
  })

  it('returns an empty list for malformed Pod data', () => {
    expect(parseMessageBlocks('{not-json', { messageId: 'message-invalid' })).toEqual([])
  })
})
