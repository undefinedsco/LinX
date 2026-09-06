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
import {
  addUrl,
  buildThing,
  createThing,
  getSolidDataset,
  getThingAll,
  getUrlAll,
  saveSolidDatasetAt,
  solidDatasetAsTurtle,
  setThing,
  universalAccess,
} from '@inrupt/solid-client'
import { nowTimestamp, type Attachment, type ThreadItem, type ThreadMetadata } from '@/lib/vendor/xpod-chatkit'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { LocalChatKitStore } from './store'
import { LocalChatKitService } from './service'
import { getLocalChatKitRuntimeCache } from './runtime-cache'
import {
  enqueueChatGeneration,
  listChatGenerationOutbox,
  markChatGenerationAttempt,
  nextChatGenerationAttemptAt,
  removeChatGeneration,
} from './generation-outbox'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const ACP = 'http://www.w3.org/ns/solid/acp#'
const ACL = 'http://www.w3.org/ns/auth/acl#'
const ACP_ACCESS_CONTROL_RESOURCE = `${ACP}AccessControlResource`
const ACP_ACCESS_CONTROL_LINK = `${ACP}accessControl`
const ACP_MEMBER_ACCESS_CONTROL = `${ACP}memberAccessControl`
const ACP_ACCESS_CONTROL = `${ACP}AccessControl`
const ACP_APPLY = `${ACP}apply`
const ACP_POLICY = `${ACP}Policy`
const ACP_ALLOW = `${ACP}allow`
const ACP_ANY_OF = `${ACP}anyOf`
const ACP_MATCHER = `${ACP}Matcher`
const ACP_AGENT = `${ACP}agent`
const ACL_READ = `${ACL}Read`
const ACL_APPEND = `${ACL}Append`
const ACL_WRITE = `${ACL}Write`

export interface LocalChatKitFetchOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  initialThread?: ThreadMetadata
  isAvailable?: () => boolean
  onAttachmentsChange?: (attachments: Attachment[]) => void
  onStreamingChange?: (state: { active: boolean; abort?: () => void }) => void
  onThreadItemsChange?: (items: ThreadItem[]) => void
  onOutboxChange?: (count: number) => void
  onServiceAccessRequired?: () => void
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
    onOutboxChange,
    onServiceAccessRequired,
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
  const replayDeferredUserItemIds = new Set<string>()
  const outboxThreadId = initialThread?.id
  const notifyOutboxChange = () => {
    onOutboxChange?.(listChatGenerationOutbox(webId, outboxThreadId).length)
  }
  const service = new LocalChatKitService({
    store,
    db,
    webId,
    authFetch,
    onGenerationDeferred: (entry) => {
      replayDeferredUserItemIds.add(entry.userItemId)
      enqueueChatGeneration({
        accountScope: webId,
        threadId: entry.threadId,
        userItemId: entry.userItemId,
        inferenceOptions: entry.inferenceOptions,
      })
      notifyOutboxChange()
    },
    onServiceAccessRequired: () => {
      runtimeCache.aiServiceAccessBlocked = true
      onServiceAccessRequired?.()
    },
  })
  let outboxFlushPromise: Promise<{ completed: number; pending: number }> | null = null
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
      console.error('[LocalChatKitFetch] Error:', error)
      const message = formatErrorForUser(error, '聊天服务暂时不可用。请稍后重试。')
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
  localFetch.getOutboxSize = () => listChatGenerationOutbox(webId, outboxThreadId).length
  localFetch.getOutboxRetryAt = () => nextChatGenerationAttemptAt(webId, outboxThreadId)
  const flushOutbox = async (force: boolean) => {
    let completed = 0

    // A missing service grant cannot heal through retries. Keep the durable
    // queue intact and wait for the explicit grant flow instead of repeatedly
    // loading credentials and calling the provider in the background.
    if (runtimeCache.aiServiceAccessBlocked) {
      const pending = listChatGenerationOutbox(webId, outboxThreadId).length
      notifyOutboxChange()
      return { completed, pending }
    }

    for (const entry of listChatGenerationOutbox(webId, outboxThreadId)) {
      if (!force && (entry.nextAttemptAt ?? entry.queuedAt) > Date.now()) break
      markChatGenerationAttempt(webId, entry.id)
      replayDeferredUserItemIds.delete(entry.userItemId)
      try {
        const result = await service.process(JSON.stringify({
          type: 'threads.custom_action',
          params: {
            action: {
              type: 'message.regenerate',
              payload: {
                action: 'message.regenerate',
                thread_id: entry.threadId,
                item_id: entry.userItemId,
              },
            },
          },
        }), {})

        if (result.type === 'streaming') {
          const decoder = new TextDecoder()
          let payload = ''
          for await (const chunk of result.stream()) {
            payload += decoder.decode(chunk, { stream: true })
          }
          payload += decoder.decode()
          for (const line of payload.split(/\r?\n/u)) {
            if (!line.startsWith('data:')) continue
            try {
              const event = JSON.parse(line.slice(5).trim()) as { type?: string; error?: { message?: string } }
              if (event.type === 'error') {
                throw new Error(event.error?.message ?? 'Queued generation failed')
              }
            } catch (error) {
              if (error instanceof SyntaxError) continue
              throw error
            }
          }
        }

        if (replayDeferredUserItemIds.has(entry.userItemId)) break
        removeChatGeneration(webId, entry.id)
        completed += 1
        notifyOutboxChange()
      } catch (error) {
        if (isStaleGenerationEntryError(error)) {
          // The original user item was deleted or replaced while the browser
          // was offline. Retrying it can never succeed, so drop only this
          // permanent queue entry; provider/network failures remain retryable.
          removeChatGeneration(webId, entry.id)
          notifyOutboxChange()
          continue
        }
        console.warn('[LocalChatKitFetch] Queued generation replay failed:', error)
        break
      }
    }

    const pending = listChatGenerationOutbox(webId, outboxThreadId).length
    notifyOutboxChange()
    return { completed, pending }
  }
  localFetch.flushOutbox = (options?: { force?: boolean }) => {
    if (outboxFlushPromise) return outboxFlushPromise
    outboxFlushPromise = flushOutbox(options?.force ?? false).finally(() => {
      outboxFlushPromise = null
    })
    return outboxFlushPromise
  }
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
  const descriptor = validateAiServiceAccessDescriptor(await response.json(), input.podBaseUrl)
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

async function grantAiServiceResourceAccess(input: {
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

  let acr = await getSolidDataset(state.url, { fetch: input.authFetch })
  const root = getThingAll(acr).find((thing) => getUrlAll(thing, RDF_TYPE).includes(ACP_ACCESS_CONTROL_RESOURCE))
  if (!root) throw new Error('Xpod 访问控制文档缺少根资源。')
  const suffix = input.members ? 'Member' : ''
  const controlUrl = `${state.url}#linxService${suffix}Access`
  const policyUrl = `${state.url}#linxService${suffix}Policy`
  const matcherUrl = `${state.url}#linxService${suffix}Matcher`
  acr = setThing(acr, addUrl(root, input.members ? ACP_MEMBER_ACCESS_CONTROL : ACP_ACCESS_CONTROL_LINK, controlUrl))
  acr = setThing(acr, buildThing(createThing({ url: controlUrl }))
    .addUrl(RDF_TYPE, ACP_ACCESS_CONTROL)
    .addUrl(ACP_APPLY, policyUrl)
    .build())
  acr = setThing(acr, buildThing(createThing({ url: policyUrl }))
    .addUrl(RDF_TYPE, ACP_POLICY)
    .addUrl(ACP_ALLOW, ACL_READ)
    .addUrl(ACP_ALLOW, ACL_APPEND)
    .addUrl(ACP_ALLOW, ACL_WRITE)
    .addUrl(ACP_ANY_OF, matcherUrl)
    .build())
  acr = setThing(acr, buildThing(createThing({ url: matcherUrl }))
    .addUrl(RDF_TYPE, ACP_MATCHER)
    .addUrl(ACP_AGENT, input.serviceWebId)
    .build())
  try {
    await saveSolidDatasetAt(state.url, acr, { fetch: input.authFetch })
  } catch {
    // Xpod stores ACP documents as Turtle but does not support the N3 Patch
    // emitted by solid-client for an existing ACR. Preserve the complete
    // dataset and replace it atomically instead of dropping owner policies.
    const updated = await input.authFetch(state.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/turtle' },
      body: await solidDatasetAsTurtle(acr),
    })
    if (!updated.ok) {
      throw new Error(`更新 ${input.resource.id} 的 Xpod 访问控制失败（HTTP ${updated.status}）。`)
    }
  }
  return input.resource.access
}

async function discoverXpodAcr(resourceUrl: string, authFetch: typeof fetch): Promise<{ url: string; exists: boolean }> {
  const info = await authFetch(resourceUrl, { method: 'HEAD' })
  if (info.status !== 200 && info.status !== 404) {
    throw new Error(`读取 Xpod 资源授权信息失败（HTTP ${info.status}）。`)
  }
  const match = info.headers.get('Link')?.match(/<([^>]+)>\s*;\s*rel=["']acl["']/iu)
  if (!match?.[1]) throw new Error('Xpod 资源没有提供访问控制地址。')

  const discovered = new URL(match[1], resourceUrl)
  const expected = new URL(`${resourceUrl}.acr`)
  if (discovered.href !== expected.href) {
    throw new Error('Xpod 返回了越界的访问控制地址。')
  }
  const current = await authFetch(discovered.href, { headers: { Accept: 'text/turtle' } })
  if (current.status !== 404 && !current.ok) {
    throw new Error(`读取 Xpod 访问控制文档失败（HTTP ${current.status}）。`)
  }
  return { url: discovered.href, exists: current.ok }
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

function isStaleGenerationEntryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /^Item not found:/u.test(message)
}

export type LocalChatKitFetch = typeof fetch & {
  interrupt: () => void
  refreshThreadItems: (threadId: string) => Promise<void>
  getOutboxSize: () => number
  getOutboxRetryAt: () => number | null
  flushOutbox: (options?: { force?: boolean }) => Promise<{ completed: number; pending: number }>
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
  dispose: () => void
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
