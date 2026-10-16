/**
 * The AG-UI agent behind the conversation surface. It runs the browser-local
 * chat loop and speaks nothing but AG-UI events (spec §3.1). Cards do not
 * travel through here as actions: they write their Pod resource and the
 * runtime follows the resource.
 */
import { AbstractAgent, type BaseEvent, type RunAgentInput } from '@ag-ui/client'
import { Observable } from 'rxjs'
import type { AgUiEvent } from '@linx/agent-runtime/ag-ui'
import type { StreamingReq, ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import type { LocalConversationApi } from '../../../services/chatkit-local/fetch-handler'
import { ThreadEventTranslator } from './thread-events'
import { itemsToAgUiMessages, type AgUiHistoryMessage } from './history'

export interface LinxConversationAgentOptions {
  /** ChatKit-store thread id of the topic. */
  localThreadId: string
  /** Topic resource URI: the AG-UI threadId. */
  threadUri: string
  /** When set, history is the whole chat (all its threads merged). */
  chatId?: string
  backend: LocalConversationApi
}

export interface LoadedConversation {
  messages: AgUiHistoryMessage[]
  /** Pod message URI → local item id, for actions on persisted messages. */
  itemIdByUri: Map<string, string>
  /** Pod message URI → who wrote it (WebID or contact address); resolved to a name only when shown. */
  makerByUri: Map<string, string>
}

interface UserContentPart {
  type?: string
  text?: string
  source?: { type?: string; value?: string; mimeType?: string }
  metadata?: { filename?: string }
}
type UserContent = string | UserContentPart[] | undefined

function userText(content: UserContent): string {
  if (typeof content === 'string') return content
  return (content ?? []).flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])).join('\n')
}

/** Files the person attached in the composer arrive as base64 media parts. */
export function userFiles(content: UserContent): Array<{ name: string; mimeType: string; blob: Blob }> {
  if (typeof content === 'string') return []
  return (content ?? []).flatMap((part) => {
    if (part.source?.type !== 'data' || !part.source.value) return []
    const mimeType = part.source.mimeType || 'application/octet-stream'
    try {
      const binary = atob(part.source.value)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      return [{ name: part.metadata?.filename || '附件', mimeType, blob: new Blob([bytes], { type: mimeType }) }]
    } catch {
      return []
    }
  })
}

export class LinxConversationAgent extends AbstractAgent {
  private readonly localThreadId: string
  private readonly chatId: string | undefined
  private readonly backend: LocalConversationApi
  /** Thread each loaded message lives in (older ones may not be the send target). */
  private readonly threadIdByMessageId = new Map<string, string>()
  private readonly itemIdByMessageId = new Map<string, string>()
  private controller: AbortController | null = null
  private runsStartedCount = 0
  private idleWaiters = new Set<() => void>()
  private stopListeners = new Set<(state: 'idle' | 'stopping') => void>()

  constructor(options: LinxConversationAgentOptions) {
    super({ threadId: options.threadUri })
    this.localThreadId = options.localThreadId
    this.chatId = options.chatId
    this.backend = options.backend
  }

  /** Reads the topic from the Pod; call once before the first run. */
  async load(): Promise<LoadedConversation> {
    const conversation = await this.backend.load(this.localThreadId, this.chatId)
    this.threadId = conversation.threadUri
    const itemIdByUri = new Map<string, string>()
    const makerByUri = new Map<string, string>()
    for (const { item, uri, threadId } of conversation.items) {
      if (threadId) this.threadIdByMessageId.set(uri, threadId)
      itemIdByUri.set(uri, item.id)
      const maker = (item as { maker?: unknown }).maker
      if (typeof maker === 'string' && maker) makerByUri.set(uri, maker)
      this.itemIdByMessageId.set(uri, item.id)
    }
    return { messages: itemsToAgUiMessages(conversation.items), itemIdByUri, makerByUri }
  }

  /**
   * `load()` that survives a send overtaking it. The Pod read can be slower
   * than the person's first message; importing that stale result would wipe
   * their message from the screen, so once a run has started it is awaited and
   * the topic is read again.
   */
  async loadSettled(): Promise<LoadedConversation> {
    let started = this.runsStartedCount
    let loaded = await this.load()
    while (this.runsStartedCount !== started) {
      await this.whenIdle()
      started = this.runsStartedCount
      loaded = await this.load()
    }
    return loaded
  }

  /** How many runs have started; lets a slow history load notice a send that overtook it. */
  get runsStarted(): number {
    return this.runsStartedCount
  }

  /** Resolves once no run is in flight. */
  whenIdle(): Promise<void> {
    if (!this.controller) return Promise.resolve()
    return new Promise((resolve) => { this.idleWaiters.add(resolve) })
  }

  /** A stop was asked for; the run is "stopped" only once the stream really ended. */
  onStopRequested(listener: (state: 'idle' | 'stopping') => void): () => void {
    this.stopListeners.add(listener)
    return () => this.stopListeners.delete(listener)
  }

  override abortRun(): void {
    if (this.controller && !this.controller.signal.aborted) {
      for (const listener of this.stopListeners) listener('stopping')
      this.controller.abort(new DOMException('Generation stopped by user', 'AbortError'))
    }
    super.abortRun()
  }

  private async buildRequest(input: RunAgentInput, signal: AbortSignal): Promise<StreamingReq | null> {
    const last = input.messages[input.messages.length - 1]
    if (!last) return null
    if (last.role === 'user') {
      const knownItemId = this.itemIdByMessageId.get(last.id)
      // A user message that is already in the Pod, with the run asked again:
      // regenerate the answer rather than sending the question twice.
      if (knownItemId) {
        return {
          type: 'threads.custom_action',
          params: { action: { type: 'message.regenerate', payload: { thread_id: this.threadIdByMessageId.get(last.id) ?? this.localThreadId, item_id: knownItemId } } },
        }
      }
      const content = last.content as UserContent
      const text = userText(content).trim()
      const uploaded = await Promise.all(userFiles(content).map((file) => this.backend.uploadAttachment(file, signal)))
      if (!text && uploaded.length === 0) return null
      return {
        type: 'threads.add_user_message',
        params: {
          thread_id: this.localThreadId,
          input: {
            content: [{ type: 'input_text', text: text || '请看附件。' }],
            attachments: uploaded.map((attachment) => attachment.id),
            inference_options: {},
          },
        },
      }
    }
    return null
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const controller = new AbortController()
      this.controller = controller
      this.runsStartedCount += 1
      const runId = `${this.threadId}-run-${crypto.randomUUID()}`
      const translator = new ThreadEventTranslator({
        threadUri: this.threadId,
        runId,
        resolveItemUri: (itemId) => this.backend.resolveItemUri(itemId),
      })
      const emit = (events: AgUiEvent[]) => {
        for (const event of events) subscriber.next(event as unknown as BaseEvent)
      }
      const lastUser = [...input.messages].reverse().find((message) => message.role === 'user')

      void (async () => {
        emit(translator.start())
        try {
          const request = await this.buildRequest(input, controller.signal)
          if (!request) {
            emit(translator.end())
            return
          }
          for await (const event of this.backend.run(request, controller.signal) as AsyncIterable<ThreadStreamEvent>) {
            if (event.type === 'thread.item.added' && lastUser) {
              const item = (event as { item: ThreadItem }).item
              if (item.type === 'user_message') this.itemIdByMessageId.set(lastUser.id, item.id)
            }
            emit(translator.push(event))
          }
          emit(controller.signal.aborted ? translator.stop() : translator.end())
        } catch (error) {
          if (controller.signal.aborted) emit(translator.stop())
          else emit(translator.fail(error instanceof Error ? error.message : '这次没有完成'))
        } finally {
          if (this.controller === controller) this.controller = null
          for (const listener of this.stopListeners) listener('idle')
          if (!this.controller) {
            const waiters = [...this.idleWaiters]
            this.idleWaiters.clear()
            for (const resolve of waiters) resolve()
          }
          subscriber.complete()
        }
      })()

      return () => {
        if (!controller.signal.aborted) controller.abort()
      }
    })
  }
}
