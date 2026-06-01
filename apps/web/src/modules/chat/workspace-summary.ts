import {
  parseLocalWorkspaceUri,
  parseWorkspaceIdFromContainerUri,
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

function resolveLocalKindLabel(kind: 'folder' | 'git' | 'worktree') {
  if (kind === 'worktree') return '本地 worktree'
  if (kind === 'git') return '本地仓库'
  return '本地目录'
}

function resolvePodKindLabel(kind?: string | null) {
  if (kind === 'worktree') return 'Pod worktree'
  if (kind === 'git') return 'Pod 仓库'
  return 'Pod 容器'
}

function inferRuntimeWorkspaceKind(runtimeSession?: RuntimeSessionRecord | null): 'folder' | 'git' | 'worktree' {
  if (!runtimeSession?.repoPath?.trim()) {
    return 'folder'
  }

  if (runtimeSession.folderPath?.trim() && runtimeSession.folderPath.trim() !== runtimeSession.repoPath.trim()) {
    return 'worktree'
  }

  return 'git'
}

function resolvePodWorkspaceSummary(workspaceUri: string, workspaces: WorkspaceRow[]): WorkspaceSummary {
  const workspaceId = parseWorkspaceIdFromContainerUri(workspaceUri)
  const workspace = workspaces.find((item) => item.id === workspaceId || item.root === workspaceUri) ?? null
  const primaryText = workspace?.title?.trim() || workspace?.root?.trim() || workspaceUri
  const root = workspace?.root?.trim()
  const secondaryText = joinMeta([
    root && root !== primaryText ? root : undefined,
    workspace?.branch,
    workspace?.baseRef ? `基于 ${workspace.baseRef}` : undefined,
  ])

  return {
    kindLabel: resolvePodKindLabel(workspace?.kind),
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
  if (localWorkspace || runtimeSession) {
    const workspaceKind = inferRuntimeWorkspaceKind(runtimeSession)
    const primaryText = runtimeSession?.folderPath?.trim() || localWorkspace?.path || workspaceUri || ''
    const secondaryText = joinMeta([
      localWorkspace?.nodeId ? `节点 ${localWorkspace.nodeId}` : undefined,
      runtimeSession?.branch,
      runtimeSession?.baseRef ? `基于 ${runtimeSession.baseRef}` : undefined,
    ])

    if (!primaryText) {
      return null
    }

    return {
      kindLabel: resolveLocalKindLabel(workspaceKind),
      primaryText,
      secondaryText,
    }
  }

  if (!workspaceUri) {
    return null
  }

  return resolvePodWorkspaceSummary(workspaceUri, workspaces ?? [])
}
