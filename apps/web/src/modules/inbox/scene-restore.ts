import {
  extractApprovalIdFromApprovalRef,
  extractChatThreadRef,
  resolveThreadChatId,
  type ThreadRow,
} from '@undefineds.co/models'
import { isLocalWorkspaceUri } from '@/lib/data/workspace-model'
import {
  createContainerNodeId,
  createLocalWorkspaceNodeId,
  createWorkspaceNodeId,
  getParentContainerUri,
  normalizeContainerUri,
} from '@/modules/files/browser'
import type { InboxItem } from './collections'

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

function parseApprovalId(uri: string | null | undefined): string | null {
  return extractApprovalIdFromApprovalRef(uri)
}

function findThreadRow(
  threads: ThreadRow[],
  chatId: string | null,
  threadId: string | null,
): ThreadRow | null {
  if (!threadId) return null

  const exact = threads.find((thread) => thread.id === threadId && (!chatId || resolveThreadChatId(thread) === chatId))
  if (exact) return exact
  return threads.find((thread) => thread.id === threadId) ?? null
}

function extractThread(item: InboxItem): string | null {
  return item.thread ?? null
}

function extractAbout(item: InboxItem): string | null {
  return item.about ?? null
}

function normalizeWorkspaceLikeUri(uri: string | null): string | null {
  if (!uri) return null
  return isLocalWorkspaceUri(uri) ? uri : normalizeContainerUri(uri)
}

export function resolveInboxScene(item: InboxItem, threads: ThreadRow[]): InboxSceneTarget {
  const thread = extractThread(item)
  const threadRef = extractChatThreadRef(thread)
  const chatId = item.chatId ?? threadRef.chatId
  const threadId = item.threadId ?? threadRef.threadId
  const threadRow = findThreadRow(threads, chatId ?? null, threadId ?? null)
  const workspace = normalizeWorkspaceLikeUri(threadRow?.workspace ?? null)
  const about = extractAbout(item) ?? thread
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

  const approvalId = parseApprovalId(scene.about)
  if (approvalId) {
    return { kind: 'approval', approvalItemId: `approval:${approvalId}` }
  }

  const threadRef = extractChatThreadRef(scene.about)
  if (threadRef.chatId && threadRef.threadId) {
    return { kind: 'chat' }
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
