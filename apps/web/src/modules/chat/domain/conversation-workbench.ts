export interface PendingComposerDraft {
  text: string
  attempt: number
  chatId: string
  scopeKey: string
  /** Send the text right after filling it in (welcome composer: one send is enough). */
  autoSend?: boolean
}
