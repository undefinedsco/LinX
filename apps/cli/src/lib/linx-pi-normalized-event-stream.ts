import type { AssistantMessage, AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { AutoModeNormalizedEvent } from './auto-mode/types.js'

export async function emitNormalizedBackendEventsToPiStream(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  source?: AsyncIterable<AutoModeNormalizedEvent> | Iterable<AutoModeNormalizedEvent>,
): Promise<void> {
  let text = ''
  let textStarted = false

  if (source) {
    for await (const event of source) {
      if (event.type === 'assistant.delta') {
        if (!textStarted) {
          message.content = [{ type: 'text', text: '' }]
          stream.push({ type: 'text_start', contentIndex: 0, partial: { ...message } })
          textStarted = true
        }

        text += event.text
        message.content = [{ type: 'text', text }]
        stream.push({
          type: 'text_delta',
          contentIndex: 0,
          delta: event.text,
          partial: { ...message },
        })
        continue
      }

      if (event.type === 'assistant.done') {
        break
      }
    }
  }

  if (textStarted) {
    stream.push({
      type: 'text_end',
      contentIndex: 0,
      content: text,
      partial: { ...message },
    })
  }

  stream.push({
    type: 'done',
    reason: 'stop',
    message,
  })
}
