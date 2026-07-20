import { describe, expect, it } from 'vitest'
import { MessageBlockStatus, MessageBlockType } from './components/Messages/message-blocks'
import { adaptPiMessageToBlocks } from './pi-message-adapter'

const timestamp = Date.parse('2026-07-21T00:00:00.000Z')

describe('Pi message presentation adapter', () => {
  it('preserves interleaved thinking, text and tool-call order with stable ids', () => {
    const message = {
      role: 'assistant' as const,
      timestamp,
      provider: 'anthropic',
      model: 'claude-sonnet',
      stopReason: 'toolUse' as const,
      content: [
        { type: 'thinking' as const, thinking: 'Inspect the repository.' },
        { type: 'text' as const, text: 'I will read the file.' },
        { type: 'toolCall' as const, id: 'call-1', name: 'read', arguments: { path: 'README.md' } },
      ],
    }

    const first = adaptPiMessageToBlocks(message, { messageId: 'msg-1', thinkingDuration: 1250 })
    const second = adaptPiMessageToBlocks(message, { messageId: 'msg-1', thinkingDuration: 1250 })

    expect(first.map((block) => block.type)).toEqual([
      MessageBlockType.THINKING,
      MessageBlockType.MAIN_TEXT,
      MessageBlockType.TOOL,
    ])
    expect(second.map((block) => block.id)).toEqual(first.map((block) => block.id))
    expect(first[0]).toMatchObject({ thinkingDuration: 1250, status: MessageBlockStatus.SUCCESS })
    expect(first[1]).toMatchObject({ model: { id: 'claude-sonnet', provider: 'anthropic' } })
    expect(first[2]).toMatchObject({ toolCallId: 'call-1', toolStatus: 'calling' })
  })

  it('maps streaming text and thinking without duplicating content', () => {
    const blocks = adaptPiMessageToBlocks({
      role: 'assistant',
      timestamp,
      content: [
        { type: 'thinking', thinking: 'Working' },
        { type: 'text', text: 'Partial answer' },
      ],
    }, { messageId: 'stream-1', streaming: true })

    expect(blocks).toHaveLength(2)
    expect(blocks.every((block) => block.status === MessageBlockStatus.STREAMING)).toBe(true)
  })

  it('maps successful tool text and image results', () => {
    const blocks = adaptPiMessageToBlocks({
      role: 'toolResult',
      timestamp,
      toolCallId: 'call-2',
      toolName: 'read',
      isError: false,
      content: [
        { type: 'text', text: 'Image loaded' },
        { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
      ],
    }, { messageId: 'tool-result-1' })

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      type: MessageBlockType.TOOL,
      toolStatus: 'done',
      content: 'Image loaded',
    })
    expect(blocks[1]).toMatchObject({
      type: MessageBlockType.IMAGE,
      url: 'data:image/png;base64,aGVsbG8=',
    })
  })

  it('maps tool failures, provider errors and aborted responses distinctly', () => {
    const toolFailure = adaptPiMessageToBlocks({
      role: 'toolResult', timestamp, toolCallId: 'call-3', toolName: 'bash', isError: true,
      content: [{ type: 'text', text: 'exit code 1' }],
    }, { messageId: 'tool-error' })
    const providerFailure = adaptPiMessageToBlocks({
      role: 'assistant', timestamp, content: [], stopReason: 'error', errorMessage: 'rate limited',
    }, { messageId: 'provider-error' })
    const aborted = adaptPiMessageToBlocks({
      role: 'assistant', timestamp, content: [], stopReason: 'aborted', errorMessage: 'cancelled',
    }, { messageId: 'aborted' })

    expect(toolFailure[0]).toMatchObject({ toolStatus: 'error', toolError: 'exit code 1' })
    expect(providerFailure[0]).toMatchObject({ type: MessageBlockType.ERROR, retryable: true })
    expect(aborted[0]).toMatchObject({ type: MessageBlockType.ERROR, retryable: false })
  })

  it('maps user text, image input and redacted thinking safely', () => {
    const user = adaptPiMessageToBlocks({
      role: 'user', timestamp,
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image', mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,Zm9v' },
      ],
    }, { messageId: 'user-1' })
    const redacted = adaptPiMessageToBlocks({
      role: 'assistant', timestamp,
      content: [{ type: 'thinking', thinking: 'opaque', redacted: true }],
    }, { messageId: 'redacted-1' })

    expect(user.map((block) => block.type)).toEqual([MessageBlockType.MAIN_TEXT, MessageBlockType.IMAGE])
    expect(redacted[0]).toMatchObject({
      content: '思考内容已由模型提供方隐藏。',
      metadata: { redacted: true },
    })
  })
})
