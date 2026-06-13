import {
  normalizeWorkspaceKind,
  parseLocalWorkspaceUri,
  parseWorkspaceIdFromContainerUri,
  resolveWorkspaceIdFromUri,
  type WorkspaceRow,
} from '@/lib/data/workspace-model'
import type { RuntimeSessionRecord } from './runtime-client'

export interface WorkspaceSummary {
  kindLabel: string
  primaryText: string
  secondaryText?: string
}

function joinMeta(parts: Array<string | null | undefined>): string | undefined {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)

  return normalized.length > 0 ? normalized.join(' · ') : undefined
}

function resolveLocalKindLabel(kind: 'folder' | 'worktree') {
  if (kind === 'worktree') return '本地 worktree'
  return '本地目录'
}

function resolvePodKindLabel(kind?: string | null) {
  if (kind === 'worktree') return '空间 worktree'
  return '空间文件夹'
}

function resolveWorkspaceKindLabel(workspace?: WorkspaceRow | null, fallbackUri?: string | null) {
  const kind = normalizeWorkspaceKind(workspace?.kind)
  const workspaceType = workspace?.workspaceType ?? (parseLocalWorkspaceUri(fallbackUri) ? 'local' : 'pod')
  if (workspaceType === 'local') {
    return resolveLocalKindLabel(kind)
  }
  return resolvePodKindLabel(kind)
}

function resolveRuntimeDisplayKind(runtimeSession?: RuntimeSessionRecord | null): 'folder' | 'worktree' {
  if (!runtimeSession?.repoPath?.trim()) {
    return 'folder'
  }
  return 'worktree'
}

function resolveStoredWorkspaceSummary(workspaceUri: string, workspaces: WorkspaceRow[]): WorkspaceSummary {
  const workspaceId = resolveWorkspaceIdFromUri(workspaceUri) ?? parseWorkspaceIdFromContainerUri(workspaceUri)
  const workspace = workspaces.find((item) => item.id === workspaceId || item.rootUri === workspaceUri) ?? null
  const primaryText = workspace?.title?.trim() || workspace?.rootUri?.trim() || workspaceUri
  const rootUri = workspace?.rootUri?.trim()
  const secondaryText = joinMeta([
    rootUri && rootUri !== primaryText ? rootUri : undefined,
    workspace?.workspaceType === 'local' && workspace?.repoRootUri ? `仓库 ${workspace.repoRootUri}` : undefined,
    workspace?.branch,
    workspace?.baseRef ? `基于 ${workspace.baseRef}` : undefined,
  ])

  return {
    kindLabel: resolveWorkspaceKindLabel(workspace, workspaceUri),
    primaryText,
    secondaryText,
  }
}

export function buildWorkspaceSummary({
  workspaceUri,
  workspaces,
  runtimeSession,
}: {
  workspaceUri?: string | null
  workspaces?: WorkspaceRow[]
  runtimeSession?: RuntimeSessionRecord | null
}): WorkspaceSummary | null {
  if (!workspaceUri && !runtimeSession) {
    return null
  }

  const localWorkspace = parseLocalWorkspaceUri(workspaceUri)
  const storedWorkspaceId = resolveWorkspaceIdFromUri(workspaceUri)
  const storedWorkspace = storedWorkspaceId
    ? workspaces?.find((item) => item.id === storedWorkspaceId || item.rootUri === workspaceUri)
    : null
  if (localWorkspace || runtimeSession) {
    const workspaceKind = resolveRuntimeDisplayKind(runtimeSession)
    const primaryText = storedWorkspace?.title?.trim()
      || runtimeSession?.folderPath?.trim()
      || localWorkspace?.path
      || workspaceUri
      || ''
    const secondaryText = joinMeta([
      localWorkspace?.nodeId ? `节点 ${localWorkspace.nodeId}` : undefined,
      storedWorkspace?.repoRootUri ? `仓库 ${storedWorkspace.repoRootUri}` : undefined,
      runtimeSession?.branch,
      !runtimeSession?.branch ? storedWorkspace?.branch : undefined,
      runtimeSession?.baseRef ? `基于 ${runtimeSession.baseRef}` : undefined,
      !runtimeSession?.baseRef && storedWorkspace?.baseRef ? `基于 ${storedWorkspace.baseRef}` : undefined,
    ])

    if (!primaryText) {
      return null
    }

    return {
      kindLabel: storedWorkspace ? resolveWorkspaceKindLabel(storedWorkspace, workspaceUri) : resolveLocalKindLabel(workspaceKind),
      primaryText,
      secondaryText,
    }
  }

  if (!workspaceUri) {
    return null
  }

  return resolveStoredWorkspaceSummary(workspaceUri, workspaces ?? [])
}
