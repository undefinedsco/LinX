import {
  MessageBlockStatus,
  MessageBlockType,
  type MessageBlock,
} from './components/Messages/message-blocks'

type PiTextContent = { type: 'text'; text: string }
type PiThinkingContent = { type: 'thinking'; thinking: string; redacted?: boolean }
type PiImageContent = { type: 'image'; data: string; mimeType: string }
type PiToolCall = { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }

export type PiMessageLike =
  | {
      role: 'user'
      content: string | Array<PiTextContent | PiImageContent>
      timestamp: number
    }
  | {
      role: 'assistant'
      content: Array<PiTextContent | PiThinkingContent | PiToolCall>
      timestamp: number
      stopReason?: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
      errorMessage?: string
      model?: string
      provider?: string
    }
  | {
      role: 'toolResult'
      toolCallId: string
      toolName: string
      content: Array<PiTextContent | PiImageContent>
      isError: boolean
      timestamp: number
    }

export interface AdaptPiMessageOptions {
  messageId: string
  streaming?: boolean
  thinkingDuration?: number
}

type MessageBlockInput<T extends MessageBlock = MessageBlock> = T extends MessageBlock
  ? Omit<T, 'id' | 'messageId' | 'createdAt'>
  : never

function blockTime(timestamp: number, index: number): string {
  return new Date(timestamp + index).toISOString()
}

function imageDataUrl(image: PiImageContent): string {
  if (image.data.startsWith('data:')) return image.data
  return `data:${image.mimeType};base64,${image.data}`
}

/**
 * Converts Pi's provider-neutral message parts into LinX's durable presentation
 * blocks. This adapter deliberately knows nothing about Pi UI or session storage.
 */
export function adaptPiMessageToBlocks(
  message: PiMessageLike,
  options: AdaptPiMessageOptions,
): MessageBlock[] {
  const { messageId } = options
  const blocks: MessageBlock[] = []
  const add = (block: MessageBlockInput) => {
    const index = blocks.length
    blocks.push({
      ...block,
      id: `${messageId}-${block.type}-${index}`,
      messageId,
      createdAt: blockTime(message.timestamp, index),
    } as MessageBlock)
  }

  if (message.role === 'user') {
    const content = typeof message.content === 'string'
      ? [{ type: 'text' as const, text: message.content }]
      : message.content
    for (const part of content) {
      if (part.type === 'text' && part.text) {
        add({ type: MessageBlockType.MAIN_TEXT, status: MessageBlockStatus.SUCCESS, content: part.text })
      } else if (part.type === 'image' && part.data) {
        add({
          type: MessageBlockType.IMAGE,
          status: MessageBlockStatus.SUCCESS,
          url: imageDataUrl(part),
          metadata: { mimeType: part.mimeType },
        })
      }
    }
    return blocks
  }

  if (message.role === 'toolResult') {
    const text = message.content
      .filter((part): part is PiTextContent => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    add({
      type: MessageBlockType.TOOL,
      status: message.isError ? MessageBlockStatus.ERROR : MessageBlockStatus.SUCCESS,
      toolCallId: message.toolCallId,
      toolId: message.toolCallId,
      toolName: message.toolName,
      toolStatus: message.isError ? 'error' : 'done',
      content: text,
      ...(message.isError ? { toolError: text } : { result: text }),
    })
    for (const image of message.content.filter((part): part is PiImageContent => part.type === 'image')) {
      add({
        type: MessageBlockType.IMAGE,
        status: MessageBlockStatus.SUCCESS,
        url: imageDataUrl(image),
        metadata: { mimeType: image.mimeType, toolCallId: message.toolCallId },
      })
    }
    return blocks
  }

  for (const part of message.content) {
    if (part.type === 'text' && part.text) {
      add({
        type: MessageBlockType.MAIN_TEXT,
        status: options.streaming ? MessageBlockStatus.STREAMING : MessageBlockStatus.SUCCESS,
        content: part.text,
        model: message.model && message.provider
          ? { id: message.model, name: message.model, provider: message.provider }
          : undefined,
      })
    } else if (part.type === 'thinking' && part.thinking) {
      add({
        type: MessageBlockType.THINKING,
        status: options.streaming ? MessageBlockStatus.STREAMING : MessageBlockStatus.SUCCESS,
        content: part.redacted ? '思考内容已由模型提供方隐藏。' : part.thinking,
        thinkingDuration: options.thinkingDuration,
        metadata: part.redacted ? { redacted: true } : undefined,
      })
    } else if (part.type === 'toolCall') {
      add({
        type: MessageBlockType.TOOL,
        status: MessageBlockStatus.PROCESSING,
        toolCallId: part.id,
        toolId: part.id,
        toolName: part.name,
        arguments: part.arguments,
        toolStatus: 'calling',
      })
    }
  }

  if ((message.stopReason === 'error' || message.stopReason === 'aborted') && message.errorMessage) {
    add({
      type: MessageBlockType.ERROR,
      status: MessageBlockStatus.ERROR,
      message: message.errorMessage,
      retryable: message.stopReason === 'error',
      metadata: { stopReason: message.stopReason },
    })
  }
  return blocks
}
