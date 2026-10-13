/**
 * The browser-local chat loop speaks ChatKit stream events. The conversation
 * surface only speaks AG-UI (spec §3.1), so this is the thin translation:
 * ChatKit events → normalized LinX runtime events → AG-UI.
 *
 * ID mapping: threadId = topic URI, runId = a URI derived from the topic,
 * messageId = the Pod message URI of the persisted item.
 */
import {
  LinxAgUiMapper,
  type AgUiEvent,
  type LinxAgUiSourceEvent,
  type LinxSource,
} from '@linx/agent-runtime/ag-ui'
import type { ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'

export interface ThreadEventTranslatorOptions {
  threadUri: string
  runId: string
  resolveItemUri: (itemId: string) => string
}

function assistantText(item: ThreadItem): string {
  if (item.type !== 'assistant_message') return ''
  return item.content.map((part) => part.text ?? '').join('')
}

/** Citations of an answer (K5): web pages and Pod files the model used. */
export function sourcesOfItem(item: ThreadItem): LinxSource[] {
  if (item.type !== 'assistant_message') return []
  const seen = new Set<string>()
  const sources: LinxSource[] = []
  for (const part of item.content) {
    for (const annotation of part.annotations ?? []) {
      const source = annotation.source
      const uri = source?.url
      if (!uri || seen.has(uri)) continue
      seen.add(uri)
      sources.push({ uri, title: source.title || source.filename || uri })
    }
  }
  return sources
}

function toolArguments(item: Extract<ThreadItem, { type: 'client_tool_call' }>): Record<string, unknown> {
  return item.arguments && typeof item.arguments === 'object' ? item.arguments : {}
}

export class ThreadEventTranslator {
  private readonly mapper: LinxAgUiMapper
  private readonly resolveItemUri: (itemId: string) => string
  private readonly uriByItemId = new Map<string, string>()
  private readonly sourcesSent = new Set<string>()

  constructor(options: ThreadEventTranslatorOptions) {
    this.mapper = new LinxAgUiMapper({ threadId: options.threadUri, runId: options.runId })
    this.resolveItemUri = options.resolveItemUri
  }

  get finished(): boolean {
    return this.mapper.isFinished
  }

  start(): AgUiEvent[] {
    return this.mapper.start()
  }

  /** The Pod URI of an item, kept stable for the whole run once first seen. */
  private uriOf(itemId: string): string {
    const known = this.uriByItemId.get(itemId)
    if (known) return known
    const uri = this.resolveItemUri(itemId)
    this.uriByItemId.set(itemId, uri)
    return uri
  }

  private map(event: LinxAgUiSourceEvent): AgUiEvent[] {
    return this.mapper.map(event)
  }

  push(event: ThreadStreamEvent): AgUiEvent[] {
    switch (event.type) {
      case 'thread.item.added': {
        const item = (event as { item: ThreadItem }).item
        if (item.type === 'assistant_message') {
          return this.map({ type: 'message.started', payload: { messageId: this.uriOf(item.id) } })
        }
        if (item.type === 'client_tool_call') return this.toolCall(item)
        return []
      }
      case 'thread.item.updated': {
        const { item_id: itemId, update } = event as { item_id: string; update: { type: string; delta?: string } }
        if (update.type === 'assistant_message.content_part.text_delta' && update.delta) {
          return this.map({
            endpoint: 'linx',
            type: 'message.delta',
            payload: { messageId: this.uriOf(itemId), text: update.delta },
          })
        }
        return []
      }
      case 'thread.item.done': {
        const item = (event as { item: ThreadItem }).item
        if (item.type === 'assistant_message') return this.assistantDone(item)
        if (item.type === 'client_tool_call') return this.toolResult(item)
        return []
      }
      case 'progress_update': {
        const text = (event as { text?: string }).text
        return text ? this.map({ type: 'step.progress', payload: { title: text } }) : []
      }
      case 'error': {
        const error = (event as { error?: { message?: string; code?: string } }).error
        return this.mapper.fail(error?.message ?? '这次没有完成', error?.code)
      }
      default:
        return []
    }
  }

  private toolCall(item: Extract<ThreadItem, { type: 'client_tool_call' }>): AgUiEvent[] {
    return this.map({
      endpoint: 'linx',
      type: 'tool.call',
      payload: { toolCallId: item.call_id || item.id, toolName: item.name, arguments: toolArguments(item) },
    })
  }

  private toolResult(item: Extract<ThreadItem, { type: 'client_tool_call' }>): AgUiEvent[] {
    if (item.output === undefined || item.output === null) return []
    return this.map({
      type: 'tool.result',
      payload: {
        toolCallId: item.call_id || item.id,
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
      },
    })
  }

  private assistantDone(item: Extract<ThreadItem, { type: 'assistant_message' }>): AgUiEvent[] {
    const messageId = this.uriOf(item.id)
    const out = this.map({
      endpoint: 'linx',
      type: 'message.completed',
      payload: { messageId, text: assistantText(item) },
    })
    if (!this.sourcesSent.has(item.id)) {
      const sources = sourcesOfItem(item)
      if (sources.length > 0) {
        this.sourcesSent.add(item.id)
        out.push(...this.map({ type: 'sources', payload: { messageId, sources } }))
      }
    }
    return out
  }

  /** The stream ended normally. */
  end(): AgUiEvent[] {
    return this.mapper.finish()
  }

  /** The person pressed stop: ask first, then confirm. */
  stop(): AgUiEvent[] {
    return [
      ...this.map({ type: 'session.stopping' }),
      ...this.mapper.finish({ type: 'cancelled' }),
    ]
  }

  fail(message: string): AgUiEvent[] {
    return this.mapper.fail(message)
  }
}
