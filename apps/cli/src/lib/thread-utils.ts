export interface ThreadLabelInput {
  id: string
  title?: string
  workspace?: string
}

export interface OpenAiMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function toOpenAiMessages(messages: OpenAiMessageInput[]): OpenAiMessageInput[] {
  return messages.map((message) => ({ role: message.role, content: message.content }))
}

export function formatThreadLabel(thread: ThreadLabelInput): string {
  const parts = [thread.id]
  if (thread.title) parts.push(thread.title)
  if (thread.workspace) parts.push(thread.workspace)
  return parts.join(' · ')
}
