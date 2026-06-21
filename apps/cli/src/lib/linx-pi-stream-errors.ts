import type { AssistantMessageEventStream } from '@earendil-works/pi-ai'
import { createLinxPiAssistantMessage } from './linx-pi-completion-events.js'
import { formatLinxStreamErrorMessage, isLinxStreamAbortError } from './linx-stream-error-formatting.js'

export function emitLinxPiStreamError(
  stream: AssistantMessageEventStream,
  error: unknown,
  options: { signal?: AbortSignal } = {},
): void {
  const errorMessage = createLinxPiAssistantMessage()
  const aborted = isLinxStreamAbortError(error) || options.signal?.aborted === true
  errorMessage.stopReason = aborted ? 'aborted' : 'error'
  errorMessage.errorMessage = formatLinxStreamErrorMessage(error)
  stream.push({ type: 'error', reason: errorMessage.stopReason, error: errorMessage })
}
