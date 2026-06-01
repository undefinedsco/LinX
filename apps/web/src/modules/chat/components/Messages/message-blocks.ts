import {
  RichContentItemType,
  parseMessageRichContentItems,
  serializeMessageRichContent,
  type MessageRichContentItem,
  type RichContentModelRef,
  type TaskProgressRichContentItem,
  type TaskProgressStepStatus,
  type ToolApprovalRichContentItem,
  type ToolApprovalStatus,
  type ToolCallRichContentItem,
  type ToolCallStatus,
  type ToolRisk,
} from '@undefineds.co/models'

export enum MessageBlockType {
  UNKNOWN = 'unknown',
  MAIN_TEXT = 'main_text',
  THINKING = 'thinking',
  IMAGE = 'image',
  CODE = 'code',
  TOOL = 'tool',
  TOOL_APPROVAL = 'tool_approval',
  TASK_PROGRESS = 'task_progress',
  FILE = 'file',
  ERROR = 'error',
  CITATION = 'citation',
}

export enum MessageBlockStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  STREAMING = 'streaming',
  SUCCESS = 'success',
  ERROR = 'error',
  PAUSED = 'paused',
}

export interface BaseMessageBlock {
  id: string
  messageId: string
  type: MessageBlockType
  createdAt: string
  updatedAt?: string
  status: MessageBlockStatus
  model?: RichContentModelRef
  metadata?: Record<string, unknown>
  error?: {
    code?: string
    message: string
    details?: unknown
  }
}

export interface PlaceholderMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.UNKNOWN
}

export interface MainTextMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.MAIN_TEXT
  content: string
  knowledgeBaseIds?: string[]
  citationReferences?: Array<{
    citationItemId?: string
    url?: string
    title?: string
  }>
}

export interface ThinkingMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.THINKING
  content: string
  thinkingDuration?: number
}

export interface CodeMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.CODE
  content: string
  language: string
  executable?: boolean
  executionResult?: {
    output?: string
    error?: string
    exitCode?: number
  }
}

export interface ImageMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.IMAGE
  url?: string
  filePath?: string
}

export interface ToolMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.TOOL
  toolCallId?: string
  toolId: string
  toolName: string
  arguments?: Record<string, unknown>
  content?: string | object
  toolStatus?: ToolCallStatus
  result?: unknown
  toolError?: string
  duration?: number
  metadata?: BaseMessageBlock['metadata'] & {
    isMcp?: boolean
    mcpServer?: string
  }
}

export interface ToolApprovalMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.TOOL_APPROVAL
  toolCallId: string
  toolName: string
  toolDescription: string
  arguments: Record<string, unknown>
  risk: ToolRisk
  approvalStatus: ToolApprovalStatus
  approvedBy?: string
  approvedAt?: string
  decisionBy?: string
  decisionRole?: 'human' | 'secretary' | 'system'
  onBehalfOf?: string
  reason?: string
  policyVersion?: string
  inboxItemId?: string
}

export interface TaskProgressMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.TASK_PROGRESS
  task: string
  /** @deprecated Use `task`; retained only for older richContent payloads. */
  taskId?: string
  title: string
  steps: Array<{
    id: string
    label: string
    status: TaskProgressStepStatus
    detail?: string
    duration?: number
  }>
  currentStep: number
  totalSteps: number
}

export interface CitationMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.CITATION
  webSearch?: {
    query: string
    results: Array<{
      title: string
      url: string
      snippet?: string
      favicon?: string
    }>
  }
  knowledge?: Array<{
    id: string
    title: string
    content: string
    source?: string
  }>
}

export interface FileMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.FILE
  fileName: string
  fileUrl: string
  fileSize?: number
  mimeType?: string
}

export interface ErrorMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.ERROR
  message: string
  retryable?: boolean
}

export type MessageBlock =
  | PlaceholderMessageBlock
  | MainTextMessageBlock
  | ThinkingMessageBlock
  | CodeMessageBlock
  | ImageMessageBlock
  | ToolMessageBlock
  | ToolApprovalMessageBlock
  | TaskProgressMessageBlock
  | FileMessageBlock
  | ErrorMessageBlock
  | CitationMessageBlock

interface ParseMessageBlocksOptions {
  messageId?: string
  createdAt?: string | Date
}

function normalizeCreatedAt(value?: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return new Date().toISOString()
}

function resolveCreatedAt(base: string, index: number): string {
  return new Date(new Date(base).getTime() + index).toISOString()
}

function createBlockId(messageId: string, index: number, type: string): string {
  return `${messageId || 'message'}-${type}-${index}`
}

function mapToolStatusToBlockStatus(status?: ToolCallStatus): MessageBlockStatus {
  switch (status) {
    case 'calling':
    case 'running':
      return MessageBlockStatus.PROCESSING
    case 'waiting_approval':
      return MessageBlockStatus.PENDING
    case 'error':
      return MessageBlockStatus.ERROR
    case 'done':
    default:
      return MessageBlockStatus.SUCCESS
  }
}

function mapApprovalStatusToBlockStatus(status: ToolApprovalStatus): MessageBlockStatus {
  switch (status) {
    case 'pending':
      return MessageBlockStatus.PENDING
    case 'rejected':
      return MessageBlockStatus.ERROR
    case 'approved':
    case 'auto_approved':
    default:
      return MessageBlockStatus.SUCCESS
  }
}

function mapItemToBlock(
  item: MessageRichContentItem,
  index: number,
  options: ParseMessageBlocksOptions,
): MessageBlock {
  const messageId = options.messageId ?? ''
  const createdAt = resolveCreatedAt(normalizeCreatedAt(options.createdAt), index)

  switch (item.type) {
    case RichContentItemType.MAIN_TEXT:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.MAIN_TEXT,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        content: item.content,
        knowledgeBaseIds: item.knowledgeBaseIds,
        citationReferences: item.citationReferences,
      }
    case RichContentItemType.THINKING:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.THINKING,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        content: item.content,
        thinkingDuration: item.thinkingDuration,
      }
    case RichContentItemType.CODE:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.CODE,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        content: item.content,
        language: item.language,
        executable: item.executable,
        executionResult: item.executionResult,
      }
    case RichContentItemType.IMAGE:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.IMAGE,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        url: item.url,
        filePath: item.filePath,
      }
    case RichContentItemType.TOOL: {
      const toolItem = item as ToolCallRichContentItem
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.TOOL,
        createdAt,
        status: mapToolStatusToBlockStatus(toolItem.status),
        model: item.model,
        metadata: item.metadata,
        toolCallId: toolItem.toolCallId,
        toolId: toolItem.toolCallId ?? toolItem.toolName,
        toolName: toolItem.toolName,
        arguments: toolItem.arguments,
        content:
          typeof toolItem.result === 'string' || (toolItem.result && typeof toolItem.result === 'object')
            ? (toolItem.result as string | object)
            : toolItem.error,
        toolStatus: toolItem.status,
        result: toolItem.result,
        toolError: toolItem.error,
        duration: toolItem.duration,
        error: toolItem.error
          ? {
              message: toolItem.error,
            }
          : undefined,
      }
    }
    case RichContentItemType.TOOL_APPROVAL: {
      const approvalItem = item as ToolApprovalRichContentItem
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.TOOL_APPROVAL,
        createdAt,
        status: mapApprovalStatusToBlockStatus(approvalItem.status),
        model: item.model,
        metadata: item.metadata,
        toolCallId: approvalItem.toolCallId,
        toolName: approvalItem.toolName,
        toolDescription: approvalItem.toolDescription,
        arguments: approvalItem.arguments,
        risk: approvalItem.risk,
        approvalStatus: approvalItem.status,
        approvedBy: approvalItem.approvedBy,
        approvedAt: approvalItem.approvedAt,
        decisionBy: approvalItem.decisionBy,
        decisionRole: approvalItem.decisionRole,
        onBehalfOf: approvalItem.onBehalfOf,
        reason: approvalItem.reason,
        policyVersion: approvalItem.policyVersion,
        inboxItemId: approvalItem.inboxItemId,
      }
    }
    case RichContentItemType.TASK_PROGRESS: {
      const progressItem = item as TaskProgressRichContentItem
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.TASK_PROGRESS,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        task: progressItem.task ?? progressItem.taskId,
        taskId: progressItem.taskId,
        title: progressItem.title,
        steps: progressItem.steps,
        currentStep: progressItem.currentStep,
        totalSteps: progressItem.totalSteps,
      }
    }
    case RichContentItemType.FILE:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.FILE,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        fileName: item.fileName,
        fileUrl: item.fileUrl,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
      }
    case RichContentItemType.ERROR:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.ERROR,
        createdAt,
        status: MessageBlockStatus.ERROR,
        model: item.model,
        metadata: item.metadata,
        message: item.message,
        retryable: item.retryable,
        error: item.code || item.details
          ? {
              code: item.code,
              message: item.message,
              details: item.details,
            }
          : undefined,
      }
    case RichContentItemType.CITATION:
      return {
        id: createBlockId(messageId, index, item.type),
        messageId,
        type: MessageBlockType.CITATION,
        createdAt,
        status: MessageBlockStatus.SUCCESS,
        model: item.model,
        metadata: item.metadata,
        webSearch: item.webSearch,
        knowledge: item.knowledge,
      }
  }
}

function mapBlockToItem(block: MessageBlock): MessageRichContentItem | null {
  switch (block.type) {
    case MessageBlockType.UNKNOWN:
      return null
    case MessageBlockType.MAIN_TEXT:
      return {
        type: RichContentItemType.MAIN_TEXT,
        model: block.model,
        metadata: block.metadata,
        content: block.content,
        knowledgeBaseIds: block.knowledgeBaseIds,
        citationReferences: block.citationReferences,
      }
    case MessageBlockType.THINKING:
      return {
        type: RichContentItemType.THINKING,
        model: block.model,
        metadata: block.metadata,
        content: block.content,
        thinkingDuration: block.thinkingDuration,
      }
    case MessageBlockType.CODE:
      return {
        type: RichContentItemType.CODE,
        model: block.model,
        metadata: block.metadata,
        content: block.content,
        language: block.language,
        executable: block.executable,
        executionResult: block.executionResult,
      }
    case MessageBlockType.IMAGE:
      return {
        type: RichContentItemType.IMAGE,
        model: block.model,
        metadata: block.metadata,
        url: block.url,
        filePath: block.filePath,
      }
    case MessageBlockType.TOOL:
      return {
        type: RichContentItemType.TOOL,
        model: block.model,
        metadata: block.metadata,
        toolCallId: block.toolCallId ?? block.toolId,
        toolName: block.toolName,
        arguments: block.arguments ?? {},
        status: block.toolStatus ?? (block.status === MessageBlockStatus.ERROR ? 'error' : 'done'),
        result: block.result ?? block.content,
        error: block.toolError ?? block.error?.message,
        duration: block.duration,
      }
    case MessageBlockType.TOOL_APPROVAL:
      return {
        type: RichContentItemType.TOOL_APPROVAL,
        model: block.model,
        metadata: block.metadata,
        toolCallId: block.toolCallId,
        toolName: block.toolName,
        toolDescription: block.toolDescription,
        arguments: block.arguments,
        risk: block.risk,
        status: block.approvalStatus,
        approvedBy: block.approvedBy,
        approvedAt: block.approvedAt,
        decisionBy: block.decisionBy,
        decisionRole: block.decisionRole,
        onBehalfOf: block.onBehalfOf,
        reason: block.reason,
        policyVersion: block.policyVersion,
        inboxItemId: block.inboxItemId,
      }
    case MessageBlockType.TASK_PROGRESS:
      return {
        type: RichContentItemType.TASK_PROGRESS,
        model: block.model,
        metadata: block.metadata,
        task: block.task,
        title: block.title,
        steps: block.steps,
        currentStep: block.currentStep,
        totalSteps: block.totalSteps,
      }
    case MessageBlockType.FILE:
      return {
        type: RichContentItemType.FILE,
        model: block.model,
        metadata: block.metadata,
        fileName: block.fileName,
        fileUrl: block.fileUrl,
        fileSize: block.fileSize,
        mimeType: block.mimeType,
      }
    case MessageBlockType.ERROR:
      return {
        type: RichContentItemType.ERROR,
        model: block.model,
        metadata: block.metadata,
        message: block.message,
        retryable: block.retryable,
        code: block.error?.code,
        details: block.error?.details,
      }
    case MessageBlockType.CITATION:
      return {
        type: RichContentItemType.CITATION,
        model: block.model,
        metadata: block.metadata,
        webSearch: block.webSearch,
        knowledge: block.knowledge,
      }
  }
}

export function createMessageBlock<T extends MessageBlock>(
  type: T['type'],
  messageId: string,
  partial: Omit<T, 'id' | 'messageId' | 'type' | 'createdAt' | 'status'>,
): T {
  return {
    id: `${messageId || 'message'}-${type}-${Date.now()}`,
    messageId,
    type,
    createdAt: new Date().toISOString(),
    status: MessageBlockStatus.PENDING,
    ...partial,
  } as T
}

export function parseMessageBlocks(
  richContent: string | null | undefined,
  options: ParseMessageBlocksOptions = {},
): MessageBlock[] {
  return parseMessageRichContentItems(richContent).map((item, index) => mapItemToBlock(item, index, options))
}

export function serializeMessageBlocks(blocks: MessageBlock[]): string {
  const items = blocks
    .map(mapBlockToItem)
    .filter((item): item is MessageRichContentItem => item !== null)
  return serializeMessageRichContent({ items })
}
