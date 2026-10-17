import { ExportedMessageRepository } from '@assistant-ui/react'
import { fromAgUiMessages } from '@assistant-ui/react-ag-ui'
import type { LoadedConversation } from './agent'
import { withSavedFeedback } from '../ui/message-actions/feedback'

/** The loaded chat as the repository assistant-ui shows (answers, other versions of a message). */
export function loadedToRepository(loaded: LoadedConversation) {
  // W8: remember who wrote each message so group chats can show the speaker.
  const decorate = (messages: typeof loaded.messages) => fromAgUiMessages(messages).map((message) => {
    const maker = message.id ? loaded.makerByUri.get(message.id) : undefined
    const withMaker = maker ? { ...message, metadata: { ...message.metadata, custom: { ...message.metadata?.custom, senderRef: maker } } } : message
    // A reply that failed (as opposed to being stopped) keeps offering 重试 after reload.
    const failure = message.id ? loaded.failedByUri.get(message.id) : undefined
    const saved = withSavedFeedback(withMaker, loaded.feedbackByUri)
    return failure !== undefined && message.role === 'assistant'
      ? { ...saved, status: { type: 'incomplete' as const, reason: 'error' as const, error: failure || '这次没有完成，可以重试。' } }
      : saved
  })
  const shown = decorate(loaded.messages)
  if (loaded.alternates.length === 0) return ExportedMessageRepository.fromArray(shown)
  // Other versions of a message (edits, regenerated answers) hang beside the shown ones.
  const parentById = new Map(loaded.alternates.map(({ message, parentId }) => [message.id, parentId]))
  const hidden = decorate(loaded.alternates.map(({ message }) => message)).flatMap((message) => {
    const parentId = message.id ? parentById.get(message.id) : undefined
    return message.id && parentId !== undefined ? [{ message, parentId }] : []
  })
  const versions = [
    ...shown.map((message, index) => ({ message, parentId: index > 0 ? shown[index - 1].id ?? null : null })),
    ...hidden,
  ]
  // The picker numbers versions in the order they are added: oldest first.
  const writtenAt = (id: string | undefined) => (id ? loaded.createdAtByUri.get(id) ?? 0 : 0)
  versions.sort((left, right) => writtenAt(left.message.id) - writtenAt(right.message.id))
  return ExportedMessageRepository.fromBranchableArray(versions, { headId: shown[shown.length - 1]?.id ?? null })
}
