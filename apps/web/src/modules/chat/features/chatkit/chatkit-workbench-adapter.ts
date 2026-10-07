import type {
  ConversationSurfacePort,
  WorkbenchCommandBus,
  WorkbenchCommandContext,
} from '../../domain/conversation-workbench'
import type { UseChatKitReturn } from '@openai/chatkit-react'

type ChatKitWorkbenchClient = Pick<
  UseChatKitReturn,
  'setThreadId' | 'setComposerValue' | 'focusComposer' | 'fetchUpdates' | 'sendUserMessage' | 'sendCustomAction'
>

interface ChatKitWorkbenchAdapterOptions {
  client: ChatKitWorkbenchClient
  context: () => WorkbenchCommandContext
  interrupt: () => void
  approve?: (requestId: string) => Promise<void>
  reject?: (requestId: string) => Promise<void>
  provideInput?: (requestId: string, value: unknown) => Promise<void>
}

export interface ChatKitWorkbenchAdapter {
  surface: ConversationSurfacePort
  commands: WorkbenchCommandBus
}

export function createChatKitWorkbenchAdapter({
  client,
  context,
  interrupt,
  approve,
  reject,
  provideInput,
}: ChatKitWorkbenchAdapterOptions): ChatKitWorkbenchAdapter {
  const messageAction = (action: string, payload: Record<string, unknown>) => client.sendCustomAction({
    type: action,
    payload: {
      action,
      thread_id: context().threadId,
      ...payload,
    },
  })
  const unsupported = (command: string) => Promise.reject(new Error(`${command} is not connected to the active runtime`))

  return {
    surface: {
      setThread: (threadId) => client.setThreadId(threadId),
      setDraft: (draft) => client.setComposerValue(draft),
      focusComposer: () => client.focusComposer(),
      refresh: () => client.fetchUpdates(),
    },
    commands: {
      send: (input) => client.sendUserMessage(input),
      interrupt,
      editMessage: (messageId, text) => messageAction('message.edit', {
        item_id: messageId,
        text,
        regenerate: true,
      }),
      deleteMessage: (messageId) => messageAction('message.delete', { item_id: messageId }),
      regenerateMessage: (messageId) => messageAction('message.regenerate', { item_id: messageId }),
      selectBranch: (messageId, parentMessageId) => messageAction('message.select_branch', {
        item_id: messageId,
        parent_item_id: parentMessageId,
      }),
      approve: (requestId) => approve?.(requestId) ?? unsupported('approve'),
      reject: (requestId) => reject?.(requestId) ?? unsupported('reject'),
      provideInput: (requestId, value) => provideInput?.(requestId, value) ?? unsupported('provideInput'),
    },
  }
}
