import type { FilesEntry } from '../resource/resource-model'
import {
  classifyFilesEntry,
  getEntryName,
  getParentContainerUri,
} from '../resource/resource-semantics'

interface ChatMessageLike {
  id?: string
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  richContent?: string | null
}

export interface ChatArtifactVersion extends FilesEntry {
  versionId: string
  messageId: string | null
  createdAt: string | null
}

interface ChatFileItemLike {
  type?: unknown
  fileName?: unknown
  fileUrl?: unknown
  resourceUri?: unknown
  uri?: unknown
  url?: unknown
  name?: unknown
  title?: unknown
  fileSize?: unknown
  size?: unknown
  mimeType?: unknown
  contentType?: unknown
}

type ChatFileSource = 'message' | 'runtime'

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function parseRichContentItems(richContent: string | null | undefined): unknown[] {
  if (!richContent) return []

  try {
    const parsed = JSON.parse(richContent) as unknown
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const items = (parsed as { items?: unknown }).items
      return Array.isArray(items) ? [parsed, ...items] : [parsed]
    }
  } catch {
    return []
  }

  return []
}

function isChatFileItem(value: unknown): value is ChatFileItemLike {
  if (!value || typeof value !== 'object') return false
  const candidate = value as ChatFileItemLike
  return candidate.type === 'file' && (
    typeof candidate.fileUrl === 'string'
    || typeof candidate.resourceUri === 'string'
    || typeof candidate.uri === 'string'
    || typeof candidate.url === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRuntimeFileRecord(value: unknown): value is ChatFileItemLike {
  if (!isRecord(value)) return false
  const type = typeof value.type === 'string' ? value.type.toLowerCase() : ''
  return (type === 'file' || type === 'artifact' || type === 'image')
    && (
      typeof value.fileUrl === 'string'
      || typeof value.resourceUri === 'string'
      || typeof value.url === 'string'
      || typeof value.uri === 'string'
    )
}

function resolveFileUri(item: ChatFileItemLike): string | null {
  const uri = item.fileUrl ?? item.resourceUri ?? item.uri ?? item.url
  return typeof uri === 'string' && uri.length > 0 ? uri : null
}

function isPodResourceUri(uri: string, podRootUri: string): boolean {
  try {
    const resourceUrl = new URL(uri)
    const podRootUrl = new URL(podRootUri)
    return resourceUrl.href.startsWith(podRootUrl.href)
  } catch {
    return uri.startsWith(podRootUri)
  }
}

function isRuntimeArtifactContainerKey(key: string): boolean {
  return [
    'artifacts',
    'attachments',
    'files',
    'generatedFiles',
    'outputs',
    'resources',
  ].includes(key)
}

function isRuntimeArtifactWrapperKey(key: string): boolean {
  return [
    'content',
    'output',
    'result',
  ].includes(key)
}

function extractRuntimeFileItems(value: unknown, insideArtifactContainer = false): ChatFileItemLike[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractRuntimeFileItems(item, insideArtifactContainer))
  }

  if (!isRecord(value)) return []

  const direct = isRuntimeFileRecord(value) || (insideArtifactContainer && resolveFileUri(value as ChatFileItemLike))
    ? [value as ChatFileItemLike]
    : []
  const nested = Object.entries(value)
    .filter(([key]) => isRuntimeArtifactContainerKey(key) || isRuntimeArtifactWrapperKey(key))
    .flatMap(([key, nestedValue]) => extractRuntimeFileItems(nestedValue, isRuntimeArtifactContainerKey(key)))

  return [...direct, ...nested]
}

function normalizeFileSize(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeMimeType(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function createChatFileEntry(item: ChatFileItemLike, message: ChatMessageLike, podRootUri: string, source: ChatFileSource): FilesEntry | null {
  const uri = resolveFileUri(item)
  if (!uri) return null
  if (!isPodResourceUri(uri, podRootUri)) return null
  const mimeType = normalizeMimeType(item.mimeType ?? item.contentType)
  const modifiedAt = toIsoString(message.updatedAt) ?? toIsoString(message.createdAt)
  const isContainer = uri.endsWith('/')

  return {
    id: uri,
    uri,
    name: [item.fileName, item.name, item.title].find((value): value is string => typeof value === 'string' && value.length > 0) ?? getEntryName(uri),
    kind: isContainer ? 'container' : 'resource',
    semanticKind: classifyFilesEntry(uri, isContainer, podRootUri, mimeType),
    parentUri: getParentContainerUri(uri) ?? podRootUri,
    mimeType,
    size: normalizeFileSize(item.fileSize ?? item.size),
    modifiedAt,
    sourceLabel: source === 'runtime' ? '运行产物' : '聊天引用',
  }
}

function modifiedAtTime(entry: FilesEntry): number {
  if (!entry.modifiedAt) return Number.NEGATIVE_INFINITY
  const parsed = new Date(entry.modifiedAt).getTime()
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

function isLocalProxyEntry(entry: FilesEntry): boolean {
  const uri = entry.uri.toLowerCase()
  const id = entry.id.toLowerCase()
  return uri.startsWith('local-proxy:')
    || id.startsWith('local-proxy:')
    || uri.startsWith('mock:')
    || id.startsWith('mock:')
}

export function projectChatFileEntries(messages: ChatMessageLike[], podRootUri: string): FilesEntry[] {
  const byUri = new Map<string, FilesEntry>()

  for (const message of messages) {
    for (const item of parseRichContentItems(message.richContent)) {
      const fileItems = isChatFileItem(item)
        ? [{ item, source: 'message' as const }]
        : extractRuntimeFileItems(item).map((runtimeItem) => ({ item: runtimeItem, source: 'runtime' as const }))
      for (const fileItem of fileItems) {
        const entry = createChatFileEntry(fileItem.item, message, podRootUri, fileItem.source)
        const existing = entry ? byUri.get(entry.uri) : null
        if (entry && (!existing || modifiedAtTime(entry) > modifiedAtTime(existing))) {
          byUri.set(entry.uri, entry)
        }
      }
    }
  }

  return Array.from(byUri.values())
}

/**
 * Preserve every runtime artifact occurrence instead of collapsing by URI.
 * The file resource remains authoritative; this projection supplies the
 * chronological version rail used by Chat's artifact workspace.
 */
export function projectChatArtifactVersions(
  messages: ChatMessageLike[],
  podRootUri: string,
): ChatArtifactVersion[] {
  const versions: ChatArtifactVersion[] = []

  for (const [messageIndex, message] of messages.entries()) {
    const createdAt = toIsoString(message.updatedAt) ?? toIsoString(message.createdAt)
    const messageId = typeof message.id === 'string' ? message.id : null
    let artifactIndex = 0
    for (const item of parseRichContentItems(message.richContent)) {
      for (const runtimeItem of extractRuntimeFileItems(item)) {
        const entry = createChatFileEntry(runtimeItem, message, podRootUri, 'runtime')
        if (!entry) continue
        versions.push({
          ...entry,
          versionId: `${messageId ?? `message-${messageIndex}`}:${artifactIndex}`,
          messageId,
          createdAt,
        })
        artifactIndex += 1
      }
    }
  }

  return versions.sort((left, right) => {
    const modified = modifiedAtTime(right) - modifiedAtTime(left)
    if (modified !== 0) return modified
    return right.versionId.localeCompare(left.versionId)
  })
}

function chatFilesMergePriority(entry: FilesEntry, chatUris: Set<string>): number {
  if (entry.sourceLabel === '运行产物') return 0
  if (entry.sourceLabel === '聊天引用') return 1
  if (chatUris.has(entry.uri)) return 2
  if (entry.sourceLabel === '当前话题' || entry.sourceLabel === '当前线程') return 3
  return 4
}

export function mergeChatFileEntries(chatEntries: FilesEntry[], workspaceEntries: FilesEntry[]): FilesEntry[] {
  const byUri = new Map<string, FilesEntry>()
  const chatUris = new Set(chatEntries.map((entry) => entry.uri))

  for (const entry of workspaceEntries) {
    if (isLocalProxyEntry(entry)) continue
    byUri.set(entry.uri, entry)
  }

  for (const entry of chatEntries) {
    const existing = byUri.get(entry.uri)
    byUri.set(entry.uri, existing
      ? {
          ...existing,
          sourceLabel: entry.sourceLabel ?? existing.sourceLabel,
        }
      : entry)
  }

  return Array.from(byUri.values()).sort((a, b) => {
    const priority = chatFilesMergePriority(a, chatUris) - chatFilesMergePriority(b, chatUris)
    if (priority !== 0) return priority
    const modified = modifiedAtTime(b) - modifiedAtTime(a)
    if (modified !== 0) return modified
    const name = a.name.localeCompare(b.name)
    return name !== 0 ? name : a.uri.localeCompare(b.uri)
  })
}
