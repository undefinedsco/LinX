import {
  parseMessageBlocks as parseSharedMessageBlocks,
  type MessageBlock,
} from '@undefineds.co/models'

export {
  MessageBlockStatus,
  MessageBlockType,
  createMessageBlock,
  serializeMessageBlocks,
} from '@undefineds.co/models'

export type {
  BaseMessageBlock,
  CitationMessageBlock,
  CodeMessageBlock,
  ErrorMessageBlock,
  FileMessageBlock,
  ImageMessageBlock,
  MainTextMessageBlock,
  MessageBlock,
  PlaceholderMessageBlock,
  ThinkingMessageBlock,
  ToolMessageBlock,
} from '@undefineds.co/models'

export type ToolApprovalMessageBlock = Extract<MessageBlock, { type: 'tool_approval' }>
export type TaskProgressMessageBlock = Extract<MessageBlock, { type: 'task_progress' }>

interface ParseMessageBlocksOptions {
  messageId?: string
  createdAt?: string | Date
}

function normalizeCreatedAt(value?: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.length > 0) return value
  return new Date().toISOString()
}

function resolveCreatedAt(base: string, index: number): string {
  return new Date(new Date(base).getTime() + index).toISOString()
}

export function parseMessageBlocks(
  richContent: string | null | undefined,
  options: ParseMessageBlocksOptions = {},
): MessageBlock[] {
  const blocks = parseSharedMessageBlocks(richContent)
  if (!options.messageId && !options.createdAt) return blocks

  const messageId = options.messageId ?? ''
  const createdAt = normalizeCreatedAt(options.createdAt)
  return blocks.map((block, index) => {
    if (block.messageId) return block
    return {
      ...block,
      id: `${messageId || 'message'}-${block.type}-${index}`,
      messageId,
      createdAt: resolveCreatedAt(createdAt, index),
    }
  })
}
