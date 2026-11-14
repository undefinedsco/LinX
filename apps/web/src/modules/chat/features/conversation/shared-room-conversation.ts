import type { Session } from '@inrupt/solid-client-authn-browser'
import type { StreamingReq, ThreadItem, ThreadMetadata, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import type { MatrixInterfaceAccess, MatrixInterfaceCredential } from '@/lib/matrix/pod-interface-access'
import type { LocalConversationApi } from '../../services/chatkit-local/fetch-handler'
import { openSharedRoomRuntime, type SharedRoomRuntime } from '../../data/shared-room-runtime'
import type { SharedRoomReference } from '../../data/shared-room-reference'
import { ownerMessageEntries, ownerThreadMetadata } from '../../data/shared-room-reference'

/** No Matrix credential yet: the surface must show the authorization banner. */
export class SharedRoomAuthorizationRequiredError extends Error {
  readonly code = 'shared_room_authorization_required'
  constructor() {
    super('群聊服务还没有授权，请先授权。')
    this.name = 'SharedRoomAuthorizationRequiredError'
  }
}

export interface SharedRoomLoaded {
  thread: ThreadMetadata
  threadUri: string
  items: Array<{ item: ThreadItem; uri: string }>
}

/**
 * Shared-room conversation adapter for the existing AG-UI surface.
 *
 * Owner messages are read from the owner's canonical thread through the
 * room-scoped DB; `run` sends through Bob's own Matrix service and yields the
 * sent item. New owner messages are detected by ONE coalesced poll and
 * announced to the surface, which imports the loaded thread into assistant-ui.
 */
export interface SharedRoomConversationOptions {
  session: Session
  reference: SharedRoomReference
  matrixAccess: MatrixInterfaceAccess
  pollIntervalMs?: number
  openRuntime?: typeof openSharedRoomRuntime
  /** Receives true read/permission failures (403 etc.) for the banner. */
  onError?: (error: Error) => void
}

export interface SharedRoomConversation extends LocalConversationApi {
  load: () => Promise<SharedRoomLoaded>
  refresh: () => Promise<SharedRoomLoaded>
  /** Called when the poll sees owner changes. Returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

function credentialScope(credential: MatrixInterfaceCredential | null): string {
  return credential
    ? [credential.webId, credential.accountOrigin, credential.origin, credential.podUrl, credential.apiKey].join('\n')
    : ''
}

function itemText(item: ThreadItem): string {
  return item.type === 'user_message' || item.type === 'assistant_message'
    ? item.content.map((part) => part.text ?? '').join('')
    : ''
}

function signatureOf(loaded: SharedRoomLoaded): string {
  return loaded.items
    .map((entry) => `${entry.uri}\u0000${itemText(entry.item)}`)
    .join('\n')
}

export function createSharedRoomConversation(options: SharedRoomConversationOptions): SharedRoomConversation {
  const { reference, matrixAccess, session } = options
  const pollIntervalMs = options.pollIntervalMs ?? 4_000
  const cacheTtlMs = options.pollIntervalMs === 0 ? 0 : 1_000
  const openRuntime = options.openRuntime ?? openSharedRoomRuntime
  const itemIdToUri = new Map<string, string>()
  let runtime: SharedRoomRuntime | null = null
  let runtimeScope = ''
  let opening: Promise<SharedRoomRuntime> | null = null
  let openingScope = ''
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let ticking = false
  let cache: { loaded: SharedRoomLoaded; scope: string; at: number } | null = null
  let lastSignature = ''
  const listeners = new Set<() => void>()

  const currentCredential = (): MatrixInterfaceCredential => {
    const current = matrixAccess.get()
    if (!current) throw new SharedRoomAuthorizationRequiredError()
    return current
  }

  const ensureRuntime = async (): Promise<SharedRoomRuntime> => {
    if (disposed) throw new Error('共享群聊已关闭。')
    const credential = currentCredential()
    const scope = credentialScope(credential)
    if (runtime && runtimeScope === scope) return runtime
    if (opening && openingScope === scope) return await opening
    // Credential rotation/account switch invalidates the previous room DB.
    runtime = null
    runtimeScope = ''
    cache = null
    openingScope = scope
    opening = openRuntime({ reference, session, credential })
      .then((opened) => {
        if (disposed) throw new Error('共享群聊已关闭。')
        runtime = opened
        runtimeScope = scope
        return opened
      })
      .finally(() => {
        opening = null
      })
    return await opening
  }

  const toLoaded = (rows: Parameters<typeof ownerMessageEntries>[0]): SharedRoomLoaded => {
    const entries = ownerMessageEntries(rows, reference)
    return {
      thread: ownerThreadMetadata(reference),
      threadUri: reference.threadIri,
      items: entries.map((entry) => {
        itemIdToUri.set(entry.item.id, entry.uri)
        return { item: entry.item, uri: entry.uri }
      }),
    }
  }

  const loadFresh = async (): Promise<SharedRoomLoaded> => {
    const active = await ensureRuntime()
    const rows = await active.loadMessages()
    const loaded = toLoaded(rows as Parameters<typeof ownerMessageEntries>[0])
    const credential = currentCredential()
    cache = { loaded, scope: credentialScope(credential), at: Date.now() }
    return loaded
  }

  const load = async (): Promise<SharedRoomLoaded> => {
    const scope = credentialScope(matrixAccess.get())
    if (cache && cache.scope === scope && Date.now() - cache.at <= cacheTtlMs) return cache.loaded
    return await loadFresh()
  }

  const announce = () => {
    for (const listener of [...listeners]) {
      if (disposed) return
      if (!listeners.has(listener)) continue
      listener()
    }
  }

  const schedule = () => {
    if (disposed || listeners.size === 0 || pollIntervalMs <= 0 || timer) return
    timer = setTimeout(() => {
      timer = null
      void tick()
    }, pollIntervalMs)
  }

  const tick = async () => {
    // A revoked selection/subscription must not keep polling.
    if (disposed || listeners.size === 0) return
    if (ticking) {
      // Coalesce overlapping polls into one in-flight read.
      schedule()
      return
    }
    ticking = true
    try {
      const loaded = await loadFresh()
      if (disposed || listeners.size === 0) return
      const signature = signatureOf(loaded)
      if (signature !== lastSignature) {
        lastSignature = signature
        announce()
      }
    } catch (cause) {
      if (disposed) return
      options.onError?.(cause instanceof Error ? cause : new Error('读取共享群聊失败。'))
    } finally {
      ticking = false
      schedule()
    }
  }

  const conversation: SharedRoomConversation = {
    load: async () => await load(),
    resolveItemUri: (itemId) => itemIdToUri.get(itemId) ?? itemId,
    uploadAttachment: async () => { throw new Error('共享群聊暂不支持附件。') },
    async *run(request: StreamingReq, signal?: AbortSignal): AsyncIterable<ThreadStreamEvent> {
      if (request.type !== 'threads.add_user_message') {
        throw new Error('共享群聊只支持发送消息。')
      }
      const input = request.params?.input
      const text = Array.isArray(input?.content)
        ? input.content.map((part: { text?: string }) => part.text ?? '').join('').trim()
        : ''
      if (!text) return
      if (signal?.aborted) return
      const active = await ensureRuntime()
      if (signal?.aborted) return
      const sent = await active.send(text)
      // A just-sent event has no RDF resource yet: its id stays the event id,
      // never a fabricated message IRI.
      const item: ThreadItem = {
        id: sent.eventId,
        thread_id: reference.threadIri,
        type: 'user_message',
        content: [{ type: 'input_text', text }],
        created_at: Math.floor(Date.now() / 1000),
      }
      yield { type: 'thread.created', thread: ownerThreadMetadata(reference) }
      yield { type: 'thread.item.added', item }
      yield { type: 'thread.item.done', item }
      try {
        const refreshed = await loadFresh()
        lastSignature = signatureOf(refreshed)
        announce()
      } catch (cause) {
        options.onError?.(cause instanceof Error ? cause : new Error('读取共享群聊失败。'))
      }
    },
    refresh: async () => {
      const loaded = await loadFresh()
      lastSignature = signatureOf(loaded)
      announce()
      return loaded
    },
    subscribe: (listener) => {
      listeners.add(listener)
      schedule()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer) {
          clearTimeout(timer)
          timer = null
        }
      }
    },
    dispose: () => {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      listeners.clear()
      itemIdToUri.clear()
      cache = null
      runtime = null
    },
  }
  return conversation
}
