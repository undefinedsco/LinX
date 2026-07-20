import {
  MessageBlockStatus,
  MessageBlockType,
  createMessageBlock,
  parseMessageBlocks as parseModelMessageBlocks,
  serializeMessageBlocks,
  type BaseMessageBlock,
  type CitationMessageBlock,
  type CodeMessageBlock,
  type ErrorMessageBlock,
  type FileMessageBlock,
  type ImageMessageBlock,
  type MainTextMessageBlock,
  type MessageBlock,
  type PlaceholderMessageBlock,
  type ThinkingMessageBlock,
  type ToolMessageBlock,
} from '@undefineds.co/models'

export {
  MessageBlockStatus,
  MessageBlockType,
  createMessageBlock,
  serializeMessageBlocks,
}

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
}

export type ToolApprovalMessageBlock = Extract<
  MessageBlock,
  { type: MessageBlockType.TOOL_APPROVAL }
>

export type TaskProgressMessageBlock = Extract<
  MessageBlock,
  { type: MessageBlockType.TASK_PROGRESS }
>

interface ParseMessageBlocksOptions {
  messageId?: string
  createdAt?: string | Date
}

function normalizeDate(value: string | Date | undefined, index: number): string {
  const base = value instanceof Date ? value : value ? new Date(value) : new Date()
  return new Date(base.getTime() + index).toISOString()
}

/**
 * Read the shared models representation and only fill fields missing from legacy
 * payloads. Persisted block ids and timestamps are deliberately preserved.
 */
export function parseMessageBlocks(
  richContent: string | null | undefined,
  options: ParseMessageBlocksOptions = {},
): MessageBlock[] {
  return parseModelMessageBlocks(richContent).map((block, index) => ({
    ...block,
    id: block.id || `${options.messageId || 'message'}-${block.type}-${index}`,
    messageId: block.messageId || options.messageId || '',
    createdAt: block.createdAt || normalizeDate(options.createdAt, index),
  }))
}
