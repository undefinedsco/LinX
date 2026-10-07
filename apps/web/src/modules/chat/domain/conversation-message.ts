export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content?: string
  richContent?: string
  status?: 'pending' | 'sending' | 'sent' | 'error'
  createdAt?: string | Date
  updatedAt?: string | Date
}
