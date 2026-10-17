import type { FeedbackAdapter } from '@assistant-ui/react'

interface FeedbackTarget {
  submitFeedback: (messageUri: string, kind: 'positive' | 'negative') => Promise<void>
}

/** 👍 / 👎 written through the conversation agent into the message in the Pod. */
export function createFeedbackAdapter(agent: FeedbackTarget): FeedbackAdapter {
  return {
    submit: ({ message, type }) => {
      void agent.submitFeedback(message.id, type).catch(() => undefined)
    },
  }
}

/** assistant-ui keeps the chosen state in `metadata.submittedFeedback`. */
export function withSavedFeedback<T extends { id?: string; role: string; metadata?: Record<string, unknown> }>(
  message: T,
  feedbackByUri: ReadonlyMap<string, 'positive' | 'negative'>,
): T {
  const saved = message.id ? feedbackByUri.get(message.id) : undefined
  if (!saved || message.role !== 'assistant') return message
  return { ...message, metadata: { ...message.metadata, submittedFeedback: { type: saved } } }
}
