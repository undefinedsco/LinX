export interface ComposerDraft {
  text?: string
  files?: File[]
  attachments?: Array<
    | { type: 'file'; id: string; name: string; mime_type: string }
    | { type: 'image'; id: string; name: string; mime_type: string; preview_url: string }
  >
}

export interface PendingComposerDraft {
  text: string
  attempt: number
  chatId: string
  scopeKey: string
}

export interface SendMessageInput {
  text: string
}

export interface ConversationSurfacePort {
  setThread(threadId: string | null): Promise<void>
  setDraft(draft: ComposerDraft): Promise<void>
  focusComposer(): Promise<void>
  refresh(): Promise<void>
}

export interface WorkbenchCommandContext {
  threadId: string
}

export interface WorkbenchCommandBus {
  send(input: SendMessageInput): Promise<void>
  interrupt(): void
  editMessage(messageId: string, text: string): Promise<void>
  deleteMessage(messageId: string): Promise<void>
  regenerateMessage(messageId: string): Promise<void>
  selectBranch(messageId: string, parentMessageId: string): Promise<void>
  approve(requestId: string): Promise<void>
  reject(requestId: string): Promise<void>
  provideInput(requestId: string, value: unknown): Promise<void>
}
