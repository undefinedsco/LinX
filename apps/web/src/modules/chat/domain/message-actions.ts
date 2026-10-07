import type { ConversationMessage } from './conversation-message'

export interface AssistantActionSource {
  id: string
  content: string
  createdAt?: string | Date
}
export interface ActionableMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string | Date
  canEdit: boolean
  canRegenerate: boolean
}

export function projectActionableMessages(
  userMessages: readonly ConversationMessage[],
  assistantMessages: readonly AssistantActionSource[],
): ActionableMessage[] {
  const byId = new Map<string, ActionableMessage>()
  for (const message of userMessages) {
    byId.set(message.id, {
      id: message.id,
      role: 'user',
      content: message.content ?? '',
      createdAt: message.createdAt,
      canEdit: true,
      canRegenerate: true,
    })
  }
  for (const message of assistantMessages) {
    byId.set(message.id, {
      ...message,
      role: 'assistant',
      canEdit: false,
      canRegenerate: false,
    })
  }
  return [...byId.values()].sort((left, right) => (
    new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime()
  ))
}

export function selectActionableMessage(
  messages: readonly ActionableMessage[],
  selectedId?: string | null,
): ActionableMessage | undefined {
  return messages.find((message) => message.id === selectedId) ?? messages[messages.length - 1]
}

export function createMessageQuoteDraft(message: ActionableMessage): string {
  return `> ${message.content}\n\n`
}

export function createMessageDeleteConfirmation(message: ActionableMessage): string {
  const owner = message.role === 'user' ? '用户' : '助手'
  return `确定删除这条${owner}消息吗？相关后续分支也会一并删除。`
}
