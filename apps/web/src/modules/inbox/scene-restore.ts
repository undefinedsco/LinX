import type { ThreadRow } from '@undefineds.co/models'
import { isLocalWorkspaceUri } from '@/lib/data/workspace-model'
import {
  createContainerNodeId,
  createLocalWorkspaceNodeId,
  createWorkspaceNodeId,
  getParentContainerUri,
  normalizeContainerUri,
} from '@/modules/files/browser'
import type { InboxItem } from './collections'

interface ParsedAuditContext {
  [key: string]: unknown
}

export interface InboxSceneTarget {
  chatId: string | null
  threadId: string | null
  thread: string | null
  workspace: string | null
  container: string | null
  about: string | null
  approvalId: string | null
  approvalItemId: string | null
}

export interface InboxFilesTarget {
  mode: 'workspace' | 'container' | 'resource'
  treeNodeId: string
  fileId: string | null
}

export type InboxObjectTarget =
  | { kind: 'chat' }
  | { kind: 'approval'; approvalItemId: string }
  | ({ kind: 'files' } & InboxFilesTarget)

const CHAT_THREAD_URI_PATTERN = /\.data\/chat\/([^/]+)\/index\.ttl#(.+)$/
const APPROVAL_URI_PATTERN = /\.data\/approvals\/([^/#]+)\.ttl(?:#.*)?$/

function parseAuditContext(value: string | null | undefined): ParsedAuditContext | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as ParsedAuditContext
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function extractContextString(context: ParsedAuditContext | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = context?.[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function parseChatThreadUri(uri: string | null | undefined): { chatId: string | null; threadId: string | null } {
  if (!uri) return { chatId: null, threadId: null }

  const match = uri.match(CHAT_THREAD_URI_PATTERN)
  return {
    chatId: match?.[1] ?? null,
    threadId: match?.[2] ?? null,
  }
}

function parseApprovalId(uri: string | null | undefined): string | null {
  if (!uri) return null
  return uri.match(APPROVAL_URI_PATTERN)?.[1] ?? null
}

function findThreadRow(
  threads: ThreadRow[],
  chatId: string | null,
  threadId: string | null,
): ThreadRow | null {
  if (!threadId) return null

  const exact = threads.find((thread) => thread.id === threadId && (!chatId || thread.chatId === chatId))
  if (exact) return exact
  return threads.find((thread) => thread.id === threadId) ?? null
}

function extractThread(item: InboxItem, context: ParsedAuditContext | null): string | null {
  return item.thread ?? extractContextString(context, ['thread', 'threadUri'])
}

function extractAbout(item: InboxItem, context: ParsedAuditContext | null): string | null {
  return item.about
    ?? extractContextString(context, [
      'about',
      'aboutUri',
      'target',
      'targetUri',
      'object',
      'objectUri',
      'resource',
      'resourceUri',
      'file',
      'fileUri',
      'container',
      'containerUri',
      'workspace',
      'workspaceUri',
      'result',
      'resultUri',
      'output',
      'outputUri',
    ])
    ?? null
}

function normalizeWorkspaceLikeUri(uri: string | null): string | null {
  if (!uri) return null
  return isLocalWorkspaceUri(uri) ? uri : normalizeContainerUri(uri)
}

export function resolveInboxScene(item: InboxItem, threads: ThreadRow[]): InboxSceneTarget {
  const context = parseAuditContext(item.audit?.context)
  const thread = extractThread(item, context)
  const threadRef = parseChatThreadUri(thread)
  const chatId = item.chatId ?? threadRef.chatId
  const threadId = item.threadId ?? threadRef.threadId
  const threadRow = findThreadRow(threads, chatId ?? null, threadId ?? null)
  const workspace = normalizeWorkspaceLikeUri(
    threadRow?.workspace ?? extractContextString(context, ['workspace', 'workspaceUri', 'container', 'containerUri']),
  )
  const about = extractAbout(item, context) ?? thread
  const approvalId = item.approvalId ?? item.approval?.id ?? parseApprovalId(item.audit?.approval ?? null)

  return {
    chatId: chatId ?? null,
    threadId: threadId ?? null,
    thread,
    workspace,
    container: workspace,
    about,
    approvalId,
    approvalItemId: approvalId ? `approval:${approvalId}` : null,
  }
}

export function resolveInboxWorkspaceTarget(scene: InboxSceneTarget): InboxFilesTarget | null {
  if (!scene.workspace) return null

  if (isLocalWorkspaceUri(scene.workspace)) {
    return {
      mode: 'workspace',
      treeNodeId: createLocalWorkspaceNodeId(scene.workspace),
      fileId: null,
    }
  }

  return {
    mode: 'workspace',
    treeNodeId: createWorkspaceNodeId(scene.workspace),
    fileId: null,
  }
}

export function resolveInboxObjectTarget(scene: InboxSceneTarget): InboxObjectTarget | null {
  if (!scene.about) {
    return scene.approvalItemId
      ? { kind: 'approval', approvalItemId: scene.approvalItemId }
      : null
  }

  const threadRef = parseChatThreadUri(scene.about)
  if (threadRef.chatId || threadRef.threadId) {
    return { kind: 'chat' }
  }

  const approvalId = parseApprovalId(scene.about)
  if (approvalId) {
    return { kind: 'approval', approvalItemId: `approval:${approvalId}` }
  }

  if (isLocalWorkspaceUri(scene.about)) {
    return {
      kind: 'files',
      mode: 'workspace',
      treeNodeId: createLocalWorkspaceNodeId(scene.about),
      fileId: null,
    }
  }

  const normalizedAbout = scene.about.endsWith('/') ? normalizeContainerUri(scene.about) : scene.about
  if (normalizedAbout.endsWith('/')) {
    return {
      kind: 'files',
      mode: scene.workspace && normalizedAbout === scene.workspace ? 'workspace' : 'container',
      treeNodeId: scene.workspace && normalizedAbout === scene.workspace
        ? createWorkspaceNodeId(normalizedAbout)
        : createContainerNodeId(normalizedAbout),
      fileId: null,
    }
  }

  const parentUri = getParentContainerUri(normalizedAbout)
  if (!parentUri) return null

  return {
    kind: 'files',
    mode: 'resource',
    treeNodeId: createContainerNodeId(parentUri),
    fileId: normalizedAbout,
  }
}
