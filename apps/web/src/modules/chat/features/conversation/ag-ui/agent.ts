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
import { alternateParents, branchParentOf, canonicalBranchRef } from './branches'

export interface LinxConversationAgentOptions {
  /** ChatKit-store thread id of the topic. */
  localThreadId: string
  /** Topic resource URI: the AG-UI threadId. */
  threadUri: string
  /** When set, history is the whole chat (all its threads merged). */
  chatId?: string
  backend: LocalConversationApi
  /** Per-message options of the composer (e.g. 联网搜索); read once for each new message. */
  takeInferenceOptions?: () => Record<string, unknown> | undefined
}

export interface LoadedConversation {
  messages: AgUiHistoryMessage[]
  /** Pod message URI → local item id, for actions on persisted messages. */
  itemIdByUri: Map<string, string>
  /** Pod message URI → who wrote it (WebID or contact address); resolved to a name only when shown. */
  makerByUri: Map<string, string>
  /** Pod message URI → saved failure text of an answer that did not complete (not a stop). */
  failedByUri: Map<string, string>
  /** Pod message URI → 👍 / 👎 the person already gave that answer. */
  feedbackByUri: Map<string, 'positive' | 'negative'>
  /** Messages of the versions that are not shown, with where they hang in the tree (for the branch picker). */
  alternates: Array<{ message: AgUiHistoryMessage; parentId: string | null }>
  /** Pod message URI → when it was written; versions are numbered oldest first. */
  createdAtByUri: Map<string, number>
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

const ROOT = 'root'

export class LinxConversationAgent extends AbstractAgent {
  private readonly localThreadId: string
  private readonly chatId: string | undefined
  private readonly backend: LocalConversationApi
  private readonly takeInferenceOptions: (() => Record<string, unknown> | undefined) | undefined
  /** Thread each loaded message lives in (older ones may not be the send target). */
  private readonly threadIdByMessageId = new Map<string, string>()
  private readonly itemIdByMessageId = new Map<string, string>()
  /** `parent_item_id` of each message that is one of several versions. */
  private readonly branchParentByMessageId = new Map<string, string>()
  /** Version shown for each branch parent, as far as the service knows. */
  private readonly shownVersionByParent = new Map<string, string>()
  /**
   * Message that came right before a person's message (or 'root') → that
   * person's message. A new message that lands after a non-tail predecessor
   * with a follower is an edit of the follower, not a plain send.
   */
  private readonly userFollowerOf = new Map<string, string>()
  private controller: AbortController | null = null
  private runsStartedCount = 0
  private idleWaiters = new Set<() => void>()
  private stopListeners = new Set<(state: 'idle' | 'stopping') => void>()

  constructor(options: LinxConversationAgentOptions) {
    super({ threadId: options.threadUri })
    this.localThreadId = options.localThreadId
    this.chatId = options.chatId
    this.backend = options.backend
    this.takeInferenceOptions = options.takeInferenceOptions
  }

  /** Reads the topic from the Pod; call once before the first run. */
  async load(): Promise<LoadedConversation> {
    const conversation = await this.backend.load(this.localThreadId, this.chatId)
    this.threadId = conversation.threadUri
    const itemIdByUri = new Map<string, string>()
    const makerByUri = new Map<string, string>()
    const failedByUri = new Map<string, string>()
    const feedbackByUri = new Map<string, 'positive' | 'negative'>()
    const createdAtByUri = new Map<string, number>()
    this.branchParentByMessageId.clear()
    this.shownVersionByParent.clear()
    const alternateEntries = conversation.alternates ?? []
    for (const { item, uri, threadId } of [...conversation.items, ...alternateEntries]) {
      if (threadId) this.threadIdByMessageId.set(uri, threadId)
      itemIdByUri.set(uri, item.id)
      createdAtByUri.set(uri, item.created_at ?? 0)
      const branchParent = branchParentOf(item)
      if (branchParent) this.branchParentByMessageId.set(uri, branchParent)
      const maker = (item as { maker?: unknown }).maker
      if (typeof maker === 'string' && maker) makerByUri.set(uri, maker)
      this.itemIdByMessageId.set(uri, item.id)
      if (item.type === 'assistant_message' && item.status === 'failed') {
        failedByUri.set(uri, item.content.map((part) => part.text ?? '').join(''))
      }
      const feedback = (item as { feedback?: unknown }).feedback
      if (feedback === 'positive' || feedback === 'negative') feedbackByUri.set(uri, feedback)
    }
    for (const { item } of conversation.items) {
      const branchParent = branchParentOf(item)
      if (branchParent) this.shownVersionByParent.set(canonicalBranchRef(branchParent), item.id)
    }
    const messages = itemsToAgUiMessages(conversation.items)
    const alternateMessages = itemsToAgUiMessages(alternateEntries)
    const parents = alternateParents(conversation.items, messages, alternateEntries, alternateMessages)
    const alternates = alternateMessages.flatMap((message) => (
      parents.has(message.id) ? [{ message, parentId: parents.get(message.id) ?? null }] : []
    ))
    this.userFollowerOf.clear()
    let previous = ROOT
    for (const message of messages) {
      if (message.role === 'activity' || message.role === 'tool') continue
      if (message.role === 'user') this.userFollowerOf.set(previous, message.id)
      previous = message.id
    }
    return { messages, itemIdByUri, makerByUri, failedByUri, feedbackByUri, alternates, createdAtByUri }
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

  /** 👍 / 👎 on a saved answer; persisted with the message in the Pod. */
  async submitFeedback(messageUri: string, kind: 'positive' | 'negative'): Promise<void> {
    const itemId = this.itemIdByMessageId.get(messageUri)
    const threadId = this.threadIdByMessageId.get(messageUri) ?? this.localThreadId
    if (!itemId || !this.backend.feedback) throw new Error('这条消息还没保存，稍后再试。')
    await this.backend.feedback(threadId, [itemId], kind)
  }

  /**
   * The versions the person is looking at (the branch picker moved them):
   * saves each changed choice in the Pod so a reload shows the same ones.
   * `visibleMessageIds` is the shown path of the conversation.
   */
  async persistVisibleVersions(visibleMessageIds: readonly string[]): Promise<void> {
    for (const messageId of visibleMessageIds) {
      const parent = this.branchParentByMessageId.get(messageId)
      const itemId = this.itemIdByMessageId.get(messageId)
      if (!parent || !itemId || !this.backend.selectBranch) continue
      const key = canonicalBranchRef(parent)
      if (this.shownVersionByParent.get(key) === itemId) continue
      const threadId = this.threadIdByMessageId.get(messageId) ?? this.localThreadId
      await this.backend.selectBranch(threadId, itemId, parent)
      this.shownVersionByParent.set(key, itemId)
    }
  }

  /** The message just before the new one, as the history stored it. */
  private predecessorOf(messages: RunAgentInput['messages']): string {
    for (let index = messages.length - 2; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role === 'activity' || message.role === 'tool' || message.role === 'system') continue
      return message.id
    }
    return ROOT
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
      // A message sent from the middle of the conversation is an edit of the
      // message that followed that point: it becomes a new branch (spec: 编辑).
      const predecessor = this.predecessorOf(input.messages)
      const edited = this.userFollowerOf.get(predecessor)
      const editedItemId = edited ? this.itemIdByMessageId.get(edited) : undefined
      if (edited && editedItemId && text) {
        return {
          type: 'threads.custom_action',
          params: {
            action: {
              type: 'message.edit',
              payload: { thread_id: this.threadIdByMessageId.get(edited) ?? this.localThreadId, item_id: editedItemId, text, regenerate: true },
            },
          },
        }
      }
      const uploaded = await Promise.all(userFiles(content).map((file) => this.backend.uploadAttachment(file, signal)))
      if (!text && uploaded.length === 0) return null
      return {
        type: 'threads.add_user_message',
        params: {
          thread_id: this.localThreadId,
          input: {
            content: [{ type: 'input_text', text: text || '请看附件。' }],
            attachments: uploaded.map((attachment) => attachment.id),
            inference_options: this.takeInferenceOptions?.() ?? {},
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
            if (event.type === 'thread.item.added') {
              // The service already shows what it just created (an edit, a new answer).
              const added = (event as { item: ThreadItem }).item
              const addedUri = this.backend.resolveItemUri(added.id)
              this.itemIdByMessageId.set(addedUri, added.id)
              if (added.thread_id) this.threadIdByMessageId.set(addedUri, added.thread_id)
              const addedParent = branchParentOf(added)
              if (addedParent) {
                this.branchParentByMessageId.set(addedUri, addedParent)
                this.shownVersionByParent.set(canonicalBranchRef(addedParent), added.id)
              }
            }
            if (event.type === 'thread.item.added' && lastUser) {
              const item = (event as { item: ThreadItem }).item
              if (item.type === 'user_message') {
                this.itemIdByMessageId.set(lastUser.id, item.id)
                const parent = branchParentOf(item)
                if (parent) this.branchParentByMessageId.set(lastUser.id, parent)
                if (item.thread_id) this.threadIdByMessageId.set(lastUser.id, item.thread_id)
                this.userFollowerOf.set(this.predecessorOf(input.messages), lastUser.id)
              }
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
