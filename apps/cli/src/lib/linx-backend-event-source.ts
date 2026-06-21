import type { AutoModeNormalizedEvent } from './auto-mode/types.js'

export interface LinxBackendEventSourceBackend {
  sendTurn(input: string): Promise<void>
  subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
}

export async function* createLinxBackendEventSource(
  backend: LinxBackendEventSourceBackend,
  prompt: string,
): AsyncIterable<AutoModeNormalizedEvent> {
  const queue: AutoModeNormalizedEvent[] = []
  let notify: (() => void) | null = null
  let done = false
  const unsubscribe = backend.subscribe((event) => {
    queue.push(event)
    notify?.()
    notify = null
    if (event.type === 'assistant.done') {
      done = true
    }
  })

  try {
    await backend.sendTurn(prompt)
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve
        })
        continue
      }

      const event = queue.shift()
      if (event) {
        yield event
      }
    }
  } finally {
    unsubscribe()
  }
}
