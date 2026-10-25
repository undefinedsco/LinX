/**
 * Local ChatKit Fetch Handler
 *
 * Returns a `fetch`-compatible function that intercepts ChatKit requests
 * and routes them to the local (browser-side) ChatKitService + Store.
 *
 * The ChatKit SDK calls `api.fetch(url, init)` — this handler processes
 * the request body locally and returns a proper Response object,
 * completely bypassing the API server.
 */

import type { SolidDatabase } from '@undefineds.co/models'
import { resolveLinxRuntimeApiBaseUrlForIssuerUrl } from '@undefineds.co/models/client'
import { getSolidDataset, universalAccess } from '@inrupt/solid-client'
import {
  discoverAdvertisedAcr,
  mergeAdvertisedAcrGrant,
  saveAdvertisedAcr,
} from '@/lib/solid/advertised-acr'
import { nowTimestamp, type Attachment, type StreamingReq, type ThreadItem, type ThreadMetadata, type ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { LocalChatKitStore } from './store'
import { LocalChatKitService } from './service'
import { getLocalChatKitRuntimeCache } from './runtime-cache'
import type { MatrixInterfaceAccess } from '@/lib/matrix/pod-interface-access'
import { isMatrixUserFacingError } from '../../matrix-service'


export interface LocalChatKitFetchOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  initialThread?: ThreadMetadata
  isAvailable?: () => boolean
  onAttachmentsChange?: (attachments: Attachment[]) => void
  onStreamingChange?: (state: { active: boolean; abort?: () => void }) => void
  onThreadItemsChange?: (items: ThreadItem[]) => void
  onRequestError?: (message: string) => void
  matrixAccess?: MatrixInterfaceAccess
  onMatrixAuthorizationRequired?: () => Promise<void> | void
  onServiceAccessRequired?: () => void
  onServiceAccessRecovered?: () => void
  onChatSummaryChange?: (summary: {
    chatId: string
    messageId: string
    content: string
    createdAt: Date
  }) => Promise<void> | void
}

export function createLocalChatKitFetch(options: LocalChatKitFetchOptions): LocalChatKitFetch {
  const {
    db,
    webId,
    authFetch,
    initialThread,
    isAvailable = () => true,
    onAttachmentsChange,
    onStreamingChange,
    onThreadItemsChange,
    onRequestError,
    matrixAccess,
    onMatrixAuthorizationRequired,
    onServiceAccessRequired,
    onServiceAccessRecovered,
    onChatSummaryChange,
  } = options
  const store = new LocalChatKitStore(
    db,
    webId,
    authFetch,
    initialThread,
    onAttachmentsChange,
    onChatSummaryChange,
    onThreadItemsChange,
  )
  const runtimeCache = getLocalChatKitRuntimeCache(db, webId)
  const service = new LocalChatKitService({
    store,
    db,
    webId,
    authFetch,
    attachmentThreadId: initialThread?.id,
    ...(matrixAccess ? { matrixAccess } : {}),
    ...(onMatrixAuthorizationRequired ? { onMatrixAuthorizationRequired } : {}),
    onServiceAccessRequired: () => {
      runtimeCache.aiServiceAccessBlocked = true
      onServiceAccessRequired?.()
    },
  })
  const activeStreamingControllers = new Set<AbortController>()
  const interruptActiveStreams = () => {
    const reason = new DOMException('Generation stopped by user', 'AbortError')
    for (const controller of activeStreamingControllers) controller.abort(reason)
  }
  const notifyStreamingChange = () => onStreamingChange?.({
    active: activeStreamingControllers.size > 0,
    ...(activeStreamingControllers.size > 0 ? { abort: interruptActiveStreams } : {}),
  })

  const localFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isAvailable()) {
      return unavailableResponse()
    }

    try {
      const inputUrl = typeof _input === 'string' ? _input : _input.toString()
      const attachmentMatch = inputUrl.match(/^local:\/\/chatkit\/attachments\/([^/?#]+)$/)
      if (attachmentMatch && init?.method?.toUpperCase() === 'PUT') {
        if (!init.body) throw new Error('Attachment upload body is missing')
        const attachment = await service.uploadAttachment(
          decodeURIComponent(attachmentMatch[1]),
          init.body,
          new Headers(init.headers).get('Content-Type') ?? undefined,
          init.signal ?? undefined,
        )
        return Response.json(attachment)
      }

      // Read request body
      let body: string
      if (init?.body instanceof ReadableStream) {
        const reader = init.body.getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(value)
        }
        body = new TextDecoder().decode(
          chunks.reduce((acc, chunk) => {
            const merged = new Uint8Array(acc.length + chunk.length)
            merged.set(acc)
            merged.set(chunk, acc.length)
            return merged
          }, new Uint8Array(0)),
        )
      } else if (typeof init?.body === 'string') {
        body = init.body
      } else if (init?.body instanceof ArrayBuffer || init?.body instanceof Uint8Array) {
        body = new TextDecoder().decode(init.body)
      } else {
        body = '{}'
      }

      const requestController = onStreamingChange ? new AbortController() : null
      const abortFromCaller = () => requestController?.abort(init?.signal?.reason)
      if (requestController) {
        init?.signal?.addEventListener('abort', abortFromCaller, { once: true })
        if (init?.signal?.aborted) abortFromCaller()
      }

      const context = { signal: requestController?.signal ?? init?.signal }
      const result = await service.process(body, context)

      if (result.type === 'streaming') {
        if (requestController) activeStreamingControllers.add(requestController)
        notifyStreamingChange()
        // Build a ReadableStream from the async generator
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const chunk of result.stream()) {
                onServiceAccessRecovered?.()
                controller.enqueue(chunk)
              }
              controller.close()
            } catch (err) {
              controller.error(err)
            } finally {
              init?.signal?.removeEventListener('abort', abortFromCaller)
              if (requestController) activeStreamingControllers.delete(requestController)
              notifyStreamingChange()
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      init?.signal?.removeEventListener('abort', abortFromCaller)

      // Non-streaming
      return new Response(result.json, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error: any) {
      // Matrix failures are already worded for the person; logging them would
      // only duplicate the message and risk echoing a server body.
      if (!isMatrixUserFacingError(error)) {
        console.error('[LocalChatKitFetch] Error:', error)
      }
      const message = isMatrixUserFacingError(error)
        ? error.message
        : formatErrorForUser(error, '聊天服务暂时不可用。请稍后重试。')
      // ChatKit renders a fixed generic toast for failed requests, so surface
      // the formatted reason through the host app as well.
      onRequestError?.(message)
      return new Response(
        JSON.stringify({ error: { code: 'local_error', message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
  localFetch.refreshThreadItems = async (threadId: string) => {
    await store.refreshThreadItems(threadId, {})
  }
  localFetch.interrupt = interruptActiveStreams
  localFetch.ensureAiServiceAccess = async () => {
    const podBaseUrl = resolveCurrentPodBaseUrl(db)
    if (!podBaseUrl) throw new Error('无法确定当前空间地址。')
    await ensureAiServiceAccessForSession({ podBaseUrl, webId, authFetch })
    runtimeCache.aiServiceAccessBlocked = false
  }
  localFetch.loadAttachmentObjectUrl = (attachmentId: string) => store.loadAttachmentObjectUrl(attachmentId)
  localFetch.prepareAttachmentForReuse = async (attachment: Attachment) => {
    await store.saveAttachment({ ...attachment, upload_descriptor: null }, {})
    const objectUrl = await store.loadAttachmentObjectUrl(attachment.id)
    return {
      ...attachment,
      upload_descriptor: null,
      ...(attachment.type === 'image' ? { preview_url: objectUrl } : {}),
      download_url: objectUrl,
    }
  }
  localFetch.saveArtifactVersion = async (input: Parameters<LocalChatKitFetch['saveArtifactVersion']>[0]) => {
    const sourceUrl = new URL(input.uri)
    const sourceName = sourceUrl.pathname.split('/').pop() || input.name
    const extensionIndex = sourceName.lastIndexOf('.')
    const stem = extensionIndex > 0 ? sourceName.slice(0, extensionIndex) : sourceName
    const extension = extensionIndex > 0 ? sourceName.slice(extensionIndex) : ''
    const versionName = `${stem}.v-${Date.now()}${extension}`
    sourceUrl.pathname = `${sourceUrl.pathname.slice(0, sourceUrl.pathname.lastIndexOf('/') + 1)}${encodeURIComponent(versionName)}`
    const contentType = input.mimeType || 'text/plain; charset=utf-8'
    const response = await authFetch(sourceUrl.href, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: input.content,
    })
    if (!response.ok) throw new Error(`Artifact version write failed with HTTP ${response.status}`)
    const createdAt = nowTimestamp()
    const thread = await store.loadThread(input.threadId, {})
    const item = {
      id: store.generateItemId('assistant_message', thread, {}),
      thread_id: input.threadId,
      type: 'assistant_message',
      content: [{ type: 'output_text', text: `已将「${input.name}」保存为新版本 ${versionName}。` }],
      status: 'completed',
      created_at: createdAt,
      artifacts: [{
        type: 'artifact',
        name: input.name,
        fileName: input.name,
        resourceUri: sourceUrl.href,
        contentType,
        fileSize: new TextEncoder().encode(input.content).byteLength,
      }],
    } as ThreadItem & { artifacts: unknown[] }
    try {
      await store.addThreadItem(input.threadId, item, {})
    } catch (error) {
      await authFetch(sourceUrl.href, { method: 'DELETE' }).catch(() => undefined)
      throw error
    }
    return { uri: sourceUrl.href, name: versionName, createdAt }
  }
  const conversation: LocalConversationApi = {
    load: (threadId, chatId) => (chatId
      ? service.loadChatConversation(chatId, threadId, {})
      : service.loadConversation(threadId, {})),
    resolveItemUri: (itemId) => service.resolveItemUri(itemId),
    async selectBranch(threadId, itemId, parentItemId) {
      if (!isAvailable()) throw new Error('当前空间连接尚未恢复，请稍后重试。')
      const result = await service.process(JSON.stringify({
        type: 'threads.custom_action',
        params: { action: { type: 'message.select_branch', payload: { thread_id: threadId, item_id: itemId, parent_item_id: parentItemId } } },
      }), {})
      if (result.type === 'streaming') for await (const _event of result.stream()) { /* the choice is saved once the stream ends */ }
    },
    listAttachments: (chatId, threadId) => service.loadChatAttachments(chatId, threadId, {}),
    async uploadAttachment(file, signal) {
      if (!isAvailable()) throw new Error('当前空间连接尚未恢复，请稍后重试。')
      const created = await service.process(JSON.stringify({
        type: 'attachments.create',
        params: { name: file.name, mime_type: file.mimeType, size: file.blob.size },
      }), { signal })
      if (created.type !== 'non_streaming') throw new Error('附件创建失败')
      const attachment = JSON.parse(created.json) as Attachment
      return service.uploadAttachment(attachment.id, file.blob, file.mimeType, signal)
    },
    async feedback(threadId, itemIds, kind) {
      if (!isAvailable()) throw new Error('当前空间连接尚未恢复，请稍后重试。')
      const result = await service.process(JSON.stringify({
        type: 'items.feedback',
        params: { thread_id: threadId, item_ids: itemIds, kind },
      }), {})
      if (result.type !== 'non_streaming') throw new Error('反馈没有保存')
    },
    async *run(request, signal) {
      if (!isAvailable()) throw new Error('当前空间连接尚未恢复，请稍后重试。')
      const controller = new AbortController()
      const abortFromCaller = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', abortFromCaller, { once: true })
      if (signal?.aborted) abortFromCaller()
      activeStreamingControllers.add(controller)
      notifyStreamingChange()
      try {
        for await (const event of service.streamEvents(request, { signal: controller.signal })) {
          onServiceAccessRecovered?.()
          yield event
        }
      } finally {
        signal?.removeEventListener('abort', abortFromCaller)
        activeStreamingControllers.delete(controller)
        notifyStreamingChange()
      }
    },
  }
  localFetch.conversation = conversation
  localFetch.dispose = () => {
    interruptActiveStreams()
    store.dispose()
  }
  return localFetch
}

export async function ensureAiServiceAccessForSession(input: {
  podBaseUrl: string
  webId: string
  authFetch: typeof fetch
}): Promise<void> {
  const runtimeBaseUrl = resolveLinxRuntimeApiBaseUrlForIssuerUrl(new URL(input.podBaseUrl).origin)
  const descriptorUrl = new URL('/api/applets/service-access/ai-connections', runtimeBaseUrl).href
  const response = await input.authFetch(descriptorUrl, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`读取 Xpod AI 授权信息失败（HTTP ${response.status}）。`)
  const payload = await response.json()
  // Interactive Xpod requests can run as the authenticated Pod owner. There
  // is no separate principal to grant in that case; creating ACLs (or empty
  // credential documents) would be unnecessary and can corrupt JSON assets.
  // Keep the strict resource validation for actual delegation below.
  if (payload?.appletId === 'co.undefineds.ai-connections'
    && payload?.service?.webId === input.webId) return
  const descriptor = validateAiServiceAccessDescriptor(payload, input.podBaseUrl)
  for (const resource of descriptor.resources) {
    const granted = await grantAiServiceResourceAccess({
      resource,
      ownerWebId: input.webId,
      serviceWebId: descriptor.service.webId,
      members: resource.members === true,
      authFetch: input.authFetch,
    })
    if (!granted?.read || !granted.append || !granted.write) {
      throw new Error(`未能完成 ${resource.id} 的 AI 服务授权。`)
    }
  }
}

export async function grantAiServiceResourceAccess(input: {
  resource: {
    id: string
    url: string
    access: { read: true; append: true; write: true }
    members?: true
  }
  ownerWebId: string
  serviceWebId: string
  members: boolean
  authFetch: typeof fetch
}): Promise<{ read?: boolean; append?: boolean; write?: boolean } | null> {
  // Resource write access does not grant creation rights on its parent.
  // Initialize as the owner; never overwrite existing or concurrent data.
  const info = await input.authFetch(input.resource.url, { method: 'HEAD' })
  if (info.status === 404) {
    const initialized = await input.authFetch(input.resource.url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        'If-None-Match': '*',
        ...(input.members ? { Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"' } : {}),
      },
      body: '',
    })
    if (!initialized.ok && initialized.status !== 412) {
      throw new Error(`初始化 ${input.resource.id} 失败（HTTP ${initialized.status}）。`)
    }
  } else if (!info.ok) {
    throw new Error(`读取 ${input.resource.id} 失败（HTTP ${info.status}）。`)
  }
  const options = { fetch: input.authFetch }
  if (input.members) {
    return grantXpodAcrAccess(input)
  }
  const existing = await universalAccess.setAgentAccess(
    input.resource.url,
    input.serviceWebId,
    input.resource.access,
    options,
  ).catch(() => null)
  if (existing?.read && existing.append && existing.write) return existing

  // Xpod advertises a per-resource ACR even before that ACR exists. Inrupt's
  // universal helper interprets the missing ACR as WAC and returns null. Create
  // the initial ACP document once; subsequent grants keep using the library so
  // existing policies are preserved.
  const acr = await discoverXpodAcr(input.resource.url, input.authFetch)
  if (acr.exists) return grantXpodAcrAccess(input)
  const initialized = await input.authFetch(acr.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: createInitialServiceAcr({
      resourceUrl: input.resource.url,
      ownerWebId: input.ownerWebId,
      serviceWebId: input.serviceWebId,
      members: input.members,
    }),
  })
  if (initialized.ok) return input.resource.access
  if (initialized.status !== 409 && initialized.status !== 412) {
    throw new Error(`创建 ${input.resource.id} 的 Xpod 访问控制失败（HTTP ${initialized.status}）。`)
  }

  return universalAccess.setAgentAccess(
    input.resource.url,
    input.serviceWebId,
    input.resource.access,
    options,
  )
}

async function grantXpodAcrAccess(input: {
  resource: {
    id: string
    url: string
    access: { read: true; append: true; write: true }
    members?: true
  }
  ownerWebId: string
  serviceWebId: string
  members: boolean
  authFetch: typeof fetch
}): Promise<{ read: true; append: true; write: true }> {
  const state = await discoverXpodAcr(input.resource.url, input.authFetch)
  if (!state.exists) {
    const initialized = await input.authFetch(state.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/turtle' },
      body: createInitialServiceAcr({
        resourceUrl: input.resource.url,
        ownerWebId: input.ownerWebId,
        serviceWebId: input.serviceWebId,
        members: true,
      }),
    })
    if (!initialized.ok) {
      throw new Error(`创建 ${input.resource.id} 的 Xpod 访问控制失败（HTTP ${initialized.status}）。`)
    }
    return input.resource.access
  }

  const acr = await getSolidDataset(state.url, { fetch: input.authFetch })
  const suffix = input.members ? 'Member' : ''
  const merged = await mergeAdvertisedAcrGrant({
    acr,
    acrUrl: state.url,
    agentWebId: input.serviceWebId,
    access: input.resource.access,
    links: input.members ? 'member' : 'access',
    controlKey: `linxService${suffix}`,
  })
  await saveAdvertisedAcr(state.url, merged, input.authFetch)
  return input.resource.access
}

/** Shared Link-header ACR discovery; keeps the existing error surface. */
async function discoverXpodAcr(resourceUrl: string, authFetch: typeof fetch): Promise<{ url: string; exists: boolean }> {
  try {
    return await discoverAdvertisedAcr(resourceUrl, authFetch)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Xpod 资源没有提供访问控制地址。')
  }
}

function createInitialServiceAcr(input: {
  resourceUrl: string
  ownerWebId: string
  serviceWebId: string
  members: boolean
}): string {
  const iri = (value: string) => `<${value.replace(/>/gu, '%3E')}>`
  return [
    '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.',
    '',
    '<#acr> a acp:AccessControlResource;',
    `  acp:resource ${iri(input.resourceUrl)};`,
    `  acp:accessControl <#owner>, <#service>${input.members ? ';\n  acp:memberAccessControl <#owner>, <#service>' : ''}.`,
    '<#owner> a acp:AccessControl; acp:apply <#ownerPolicy>.',
    '<#ownerPolicy> a acp:Policy;',
    '  acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#ownerMatcher>.',
    `<#ownerMatcher> a acp:Matcher; acp:agent ${iri(input.ownerWebId)}.`,
    '<#service> a acp:AccessControl; acp:apply <#servicePolicy>.',
    '<#servicePolicy> a acp:Policy;',
    '  acp:allow acl:Read, acl:Append, acl:Write; acp:anyOf <#serviceMatcher>.',
    `<#serviceMatcher> a acp:Matcher; acp:agent ${iri(input.serviceWebId)}.`,
    '',
  ].join('\n')
}

export type LocalChatKitFetch = typeof fetch & {
  interrupt: () => void
  refreshThreadItems: (threadId: string) => Promise<void>
  ensureAiServiceAccess: () => Promise<void>
  loadAttachmentObjectUrl: (attachmentId: string) => Promise<string>
  prepareAttachmentForReuse: (attachment: Attachment) => Promise<Attachment>
  saveArtifactVersion: (input: {
    threadId: string
    uri: string
    name: string
    mimeType?: string | null
    content: string
  }) => Promise<{ uri: string; name: string; createdAt: number }>
  /**
   * Typed access for the AG-UI conversation surface (the ChatKit wire format
   * is not involved). Same service, same store, same abort handling.
   */
  conversation: LocalConversationApi
  dispose: () => void
}

export interface LocalConversationApi {
  /** With `chatId`, every thread of the chat merged into one timeline. */
  load: (threadId: string, chatId?: string) => Promise<{
    thread: ThreadMetadata
    threadUri: string
    items: Array<{ item: ThreadItem; uri: string; threadId?: string }>
    /** Items of the versions not shown (edited messages, regenerated answers), so the picker can offer them. */
    alternates?: Array<{ item: ThreadItem; uri: string; threadId?: string }>
  }>
  resolveItemUri: (itemId: string) => string
  /** Saves which version of a message is shown (`message.select_branch`), so the choice survives a reload. */
  selectBranch?: (threadId: string, itemId: string, parentItemId: string) => Promise<void>
  /** Every attachment of the chat (all its threads), for the 附件 dialog. */
  listAttachments?: (chatId: string, threadId: string) => Promise<Attachment[]>
  /** Two-phase upload collapsed into one call; returns the stored attachment. */
  uploadAttachment: (file: { name: string; mimeType: string; blob: Blob }, signal?: AbortSignal) => Promise<Attachment>
  run: (request: StreamingReq, signal?: AbortSignal) => AsyncIterable<ThreadStreamEvent>
  /** 👍 / 👎 on saved items; written to the item's rich content in the Pod. */
  feedback?: (threadId: string, itemIds: string[], kind: 'positive' | 'negative') => Promise<void>
}

const AI_SERVICE_RESOURCE_IDS = new Set([
  'providerCredentials',
  'providerDefinitions',
  'gatewayAccessKeys',
  'quotaSnapshots',
])

function validateAiServiceAccessDescriptor(value: unknown, podBaseUrl: string): {
  service: { webId: string }
  resources: Array<{
    id: string
    url: string
    access: { read: true; append: true; write: true }
    members?: true
  }>
} {
  const descriptor = value as Record<string, any>
  const serviceWebId = descriptor?.service?.webId
  const resources = descriptor?.resources
  const podRoot = `${podBaseUrl.replace(/\/$/u, '')}/`
  const podRootUrl = new URL(podRoot)
  if (descriptor?.appletId !== 'co.undefineds.ai-connections'
    || typeof serviceWebId !== 'string'
    || !/^https?:\/\//u.test(serviceWebId)
    || !Array.isArray(resources)
    || resources.length !== AI_SERVICE_RESOURCE_IDS.size) {
    throw new Error('Xpod 返回了无效的 AI 服务授权信息。')
  }
  const seen = new Set<string>()
  for (const resource of resources) {
    const access = resource?.access
    let resourceUrl: URL | null = null
    try {
      resourceUrl = new URL(resource?.url)
    } catch {
      // Rejected by the shared validation branch below.
    }
    if (!AI_SERVICE_RESOURCE_IDS.has(resource?.id)
      || seen.has(resource.id)
      || typeof resource?.url !== 'string'
      || !resourceUrl
      || resourceUrl.href !== resource.url
      || resourceUrl.origin !== podRootUrl.origin
      || !resourceUrl.pathname.startsWith(podRootUrl.pathname)
      || resourceUrl.search !== ''
      || resourceUrl.hash !== ''
      || ((resource.id === 'providerDefinitions') !== resourceUrl.pathname.endsWith('/'))
      || /%2f|%5c|\\/iu.test(resourceUrl.pathname)
      || access?.read !== true
      || access?.append !== true
      || access?.write !== true) {
      throw new Error('Xpod 返回了越界或不完整的 AI 服务授权信息。')
    }
    if ((resource.id === 'providerDefinitions') !== (resource.members === true)) {
      throw new Error('Xpod 返回了越界或不完整的 AI 服务授权信息。')
    }
    seen.add(resource.id)
  }
  return descriptor as ReturnType<typeof validateAiServiceAccessDescriptor>
}

export function unavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'space_unavailable',
        message: '当前空间连接尚未恢复，请稍后重试。',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}
