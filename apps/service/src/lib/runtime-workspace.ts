import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import {
  inferRuntimeWorkspaceKind as inferSharedRuntimeWorkspaceKind,
  isHttpWorkspaceRef,
  isRuntimeWorkspaceKind,
  normalizeRuntimeWorkspaceInput,
} from '@linx/agent-runtime/workspace'
import {
  type CreateRuntimeThreadInput,
  type RuntimeThreadRecord,
  type RuntimeWorkspaceKind,
} from './runtime-runner'

export { isHttpWorkspaceRef, isRuntimeWorkspaceKind }

export function normalizeLocalRuntimePath(value?: string | null): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  return path.resolve(trimmed)
}

export function inferRuntimeWorkspaceKind(input: {
  workspaceKind?: unknown
  workspaceUri?: string | null
  repoPath?: string | null
  folderPath?: string | null
}): RuntimeWorkspaceKind {
  return inferSharedRuntimeWorkspaceKind(input, {
    normalizeLocalPath: normalizeLocalRuntimePath,
  })
}

export function normalizeCreateRuntimeThreadInput(input: CreateRuntimeThreadInput): CreateRuntimeThreadInput & {
  workspaceKind: RuntimeWorkspaceKind
  repoPath?: string
  folderPath?: string
} {
  const normalized = normalizeRuntimeWorkspaceInput(input, {
    normalizeLocalPath: normalizeLocalRuntimePath,
    defaultBaseRef: 'HEAD',
  })

  return {
    ...input,
    workspaceKind: normalized.workspaceKind,
    workspaceUri: normalized.workspaceUri,
    repoPath: normalized.repoPath,
    folderPath: normalized.folderPath,
    baseRef: normalized.baseRef,
    branch: normalized.branch,
  }
}

export function normalizeLoadedRuntimeThreadRecord(record: RuntimeThreadRecord): RuntimeThreadRecord | null {
  if (!record?.id || !record?.threadId || !record?.title) {
    return null
  }

  try {
    const normalized = normalizeCreateRuntimeThreadInput({
      threadId: record.threadId,
      workspaceUri: record.workspaceUri,
      workspaceKind: record.workspaceKind,
      title: record.title,
      repoPath: record.repoPath,
      folderPath: record.folderPath,
      runnerType: record.runnerType,
      tool: record.tool,
      baseRef: record.baseRef,
      branch: record.branch,
    })

    return {
      ...record,
      workspaceKind: normalized.workspaceKind,
      workspaceUri: normalized.workspaceUri,
      repoPath: normalized.repoPath,
      folderPath: normalized.folderPath,
      baseRef: normalized.baseRef,
      branch: normalized.branch,
    }
  } catch {
    return null
  }
}

export function mapPodWorkspaceUriToLocalPath(
  workspaceUri: string,
  env: Partial<Record<'CSS_ROOT_FILE_PATH' | 'CSS_BASE_URL', string | undefined>> = process.env,
): string {
  const rootFilePath = env.CSS_ROOT_FILE_PATH?.trim()
  const baseUrl = env.CSS_BASE_URL?.trim()
  if (!rootFilePath || !baseUrl) {
    throw new Error('Pod workspace requires CSS_ROOT_FILE_PATH and CSS_BASE_URL to resolve a server-side filesystem path.')
  }

  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const workspace = new URL(workspaceUri.endsWith('/') ? workspaceUri : `${workspaceUri}/`)
  if (base.origin !== workspace.origin) {
    throw new Error(`Pod workspace ${workspaceUri} is not served by this xpod origin ${base.origin}.`)
  }

  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
  if (!workspace.pathname.startsWith(basePath)) {
    throw new Error(`Pod workspace ${workspaceUri} is outside this xpod base path ${basePath}.`)
  }

  const relative = decodeURIComponent(workspace.pathname.slice(basePath.length)).replace(/\/+$/g, '')
  const resolvedRoot = path.resolve(rootFilePath)
  const resolved = path.resolve(resolvedRoot, relative)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Pod workspace ${workspaceUri} resolves outside CSS_ROOT_FILE_PATH.`)
  }
  return resolved
}

export function resolveRuntimeThreadWorkdir(record: RuntimeThreadRecord, options: { ensure?: boolean } = {}): string {
  const workspaceKind = inferRuntimeWorkspaceKind(record)
  let workdir: string

  if (workspaceKind === 'pod-container') {
    if (!record.workspaceUri) {
      throw new Error('Pod workspace session is missing workspaceUri.')
    }
    workdir = mapPodWorkspaceUriToLocalPath(record.workspaceUri)
  } else if (workspaceKind === 'local-worktree') {
    workdir = normalizeLocalRuntimePath(record.folderPath)
  } else {
    workdir = normalizeLocalRuntimePath(record.repoPath)
  }

  if (!workdir) {
    throw new Error('Runtime session has no resolvable workspace directory.')
  }

  if (options.ensure) {
    fs.mkdirSync(workdir, { recursive: true })
  }

  return workdir
}

export function runtimeThreadWorkspaceFileUrl(record: RuntimeThreadRecord): string {
  const workspaceKind = inferRuntimeWorkspaceKind(record)
  if (workspaceKind === 'local-worktree') {
    const repoPath = normalizeLocalRuntimePath(record.repoPath)
    if (!repoPath) {
      throw new Error('Local worktree session is missing repoPath.')
    }
    return pathToFileURL(repoPath).href
  }

  return pathToFileURL(resolveRuntimeThreadWorkdir(record)).href
}
