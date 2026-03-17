import {
  chatTable,
  messageTable,
  threadTable,
} from '@linx/models'

export const Chat = chatTable
export const Thread = threadTable
export const Message = messageTable

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const

export const MessageStatus = {
  COMPLETED: 'completed',
  IN_PROGRESS: 'in_progress',
  INCOMPLETE: 'incomplete',
  FAILED: 'failed',
} as const

export interface Attachment {
  attachment_id: string
  [key: string]: unknown
}

export interface ThreadStatus {
  type: string
}

export interface ThreadMetadata {
  id: string
  title?: string
  status: ThreadStatus
  created_at: number
  updated_at: number
  metadata?: Record<string, unknown>
}

export interface InputTextContentPart {
  type: 'input_text'
  text: string
}

export interface OutputTextContentPart {
  type: 'output_text'
  text: string
  annotations?: unknown[]
}

export interface ClientToolCallItem {
  id: string
  thread_id: string
  type: 'client_tool_call'
  name: string
  arguments: string
  call_id: string
  status?: string
  output?: string
  created_at: number
}

export interface UserMessageItem {
  id: string
  thread_id: string
  type: 'user_message'
  content: InputTextContentPart[]
  attachments?: Attachment[]
  created_at: number
}

export interface AssistantMessageItem {
  id: string
  thread_id: string
  type: 'assistant_message'
  content: OutputTextContentPart[]
  attachments?: Attachment[]
  status?: string
  created_at: number
}

export type ThreadItem = UserMessageItem | AssistantMessageItem | ClientToolCallItem

export type StoreItemType = ThreadItem['type']

export interface Page<T> {
  data: T[]
  has_more: boolean
  first_id?: string
  last_id?: string
}

export type StoreContext = Record<string, unknown>

export interface ChatKitStore<TContext extends StoreContext = StoreContext> {
  generateThreadId(context: TContext): string
  generateItemId(itemType: StoreItemType, thread: ThreadMetadata, context: TContext): string
  loadThread(threadId: string, context: TContext): Promise<ThreadMetadata>
  saveThread(thread: ThreadMetadata, context: TContext): Promise<void>
  loadThreads(limit: number, after: string | undefined, order: 'asc' | 'desc', context: TContext): Promise<Page<ThreadMetadata>>
  deleteThread(threadId: string, context: TContext): Promise<void>
  loadThreadItems(
    threadId: string,
    after: string | undefined,
    limit: number,
    order: 'asc' | 'desc',
    context: TContext,
  ): Promise<Page<ThreadItem>>
  addThreadItem(threadId: string, item: ThreadItem, context: TContext): Promise<void>
  saveItem(threadId: string, item: ThreadItem, context: TContext): Promise<void>
  loadItem(threadId: string, itemId: string, context: TContext): Promise<ThreadItem>
  deleteThreadItem(threadId: string, itemId: string, context: TContext): Promise<void>
  saveAttachment(attachment: Attachment, context: TContext): Promise<void>
  loadAttachment(attachmentId: string, context: TContext): Promise<Attachment>
  deleteAttachment(attachmentId: string, context: TContext): Promise<void>
}

export interface ThreadItemAddedEvent {
  type: 'thread.item.added'
  item: ThreadItem
}

export interface ThreadItemUpdatedEvent {
  type: 'thread.item.updated'
  item_id: string
  update: {
    type: string
    part_index?: number
    delta?: string
    [key: string]: unknown
  }
}

export interface ThreadItemDoneEvent {
  type: 'thread.item.done'
  item: ThreadItem
}

export interface ThreadCreatedEvent {
  type: 'thread.created'
  thread: ThreadMetadata
}

export interface ThreadUpdatedEvent {
  type: 'thread.updated'
  thread: ThreadMetadata
}

export interface ErrorEvent {
  type: 'error'
  error: {
    code: string
    message: string
  }
}

export type ThreadStreamEvent =
  | ThreadCreatedEvent
  | ThreadUpdatedEvent
  | ThreadItemAddedEvent
  | ThreadItemUpdatedEvent
  | ThreadItemDoneEvent
  | ErrorEvent
  | { type: string; [key: string]: unknown }

export interface StreamingReq {
  type: 'threads.create' | 'threads.add_user_message' | 'threads.add_client_tool_output' | 'threads.retry_after_item' | 'threads.custom_action'
  params: any
  metadata?: Record<string, unknown>
}

export interface NonStreamingReq {
  type: 'threads.get_by_id' | 'threads.list' | 'items.list' | 'items.feedback' | 'attachments.create' | 'attachments.delete' | 'threads.update' | 'threads.delete'
  params: any
}

export type ChatKitReq = StreamingReq | NonStreamingReq

const STREAMING_REQUEST_TYPES = new Set<StreamingReq['type']>([
  'threads.create',
  'threads.add_user_message',
  'threads.add_client_tool_output',
  'threads.retry_after_item',
  'threads.custom_action',
])

export function isStreamingReq(request: { type?: string }): request is StreamingReq {
  return typeof request.type === 'string' && STREAMING_REQUEST_TYPES.has(request.type as StreamingReq['type'])
}

export function nowTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function extractUserMessageText(content: Array<{ type?: string; text?: string }>): string {
  return content
    .filter((part) => part.type === 'input_text')
    .map((part) => part.text ?? '')
    .join('\n')
}
