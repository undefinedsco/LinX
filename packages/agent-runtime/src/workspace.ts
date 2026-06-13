export type RuntimeWorkspaceKind = 'local-folder' | 'local-worktree' | 'pod-container'

export interface RuntimeWorkspaceInput {
  workspaceKind?: unknown
  workspaceUri?: string | null
  repoPath?: string | null
  folderPath?: string | null
  baseRef?: string | null
  branch?: string | null
}

export interface NormalizedRuntimeWorkspaceInput {
  workspaceKind: RuntimeWorkspaceKind
  workspaceUri?: string
  repoPath?: string
  folderPath?: string
  baseRef: string
  branch?: string
}

export interface NormalizeRuntimeWorkspaceOptions {
  normalizeLocalPath?: (value?: string | null) => string
  defaultBaseRef?: string
}

export interface RuntimeWorkspaceSessionLike {
  cwd?: string | null
  repoPath?: string | null
  folderPath?: string | null
  workspaceUri?: string | null
}

function trim(value?: string | null): string {
  return value?.trim() || ''
}

function normalizeLocalPath(value?: string | null): string {
  return trim(value)
}

export function isRuntimeWorkspaceKind(value: unknown): value is RuntimeWorkspaceKind {
  return value === 'local-folder' || value === 'local-worktree' || value === 'pod-container'
}

export function isHttpWorkspaceRef(value?: string | null): boolean {
  const candidate = trim(value)
  if (!candidate) return false
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function inferRuntimeWorkspaceKind(
  input: RuntimeWorkspaceInput,
  options: NormalizeRuntimeWorkspaceOptions = {},
): RuntimeWorkspaceKind {
  if (isRuntimeWorkspaceKind(input.workspaceKind)) {
    return input.workspaceKind
  }

  const normalize = options.normalizeLocalPath ?? normalizeLocalPath
  const repoPath = normalize(input.repoPath)
  if (isHttpWorkspaceRef(input.workspaceUri) && !repoPath) {
    return 'pod-container'
  }

  const folderPath = normalize(input.folderPath)
  return repoPath && folderPath && folderPath !== repoPath ? 'local-worktree' : 'local-folder'
}

export function normalizeRuntimeWorkspaceInput(
  input: RuntimeWorkspaceInput,
  options: NormalizeRuntimeWorkspaceOptions = {},
): NormalizedRuntimeWorkspaceInput {
  const normalize = options.normalizeLocalPath ?? normalizeLocalPath
  const workspaceKind = inferRuntimeWorkspaceKind(input, options)
  const workspaceUri = trim(input.workspaceUri) || undefined
  const repoPath = normalize(input.repoPath) || undefined
  const folderPathInput = normalize(input.folderPath) || undefined
  const baseRef = trim(input.baseRef) || options.defaultBaseRef || 'HEAD'
  const branch = trim(input.branch) || undefined

  if (workspaceKind === 'pod-container') {
    if (!workspaceUri || !isHttpWorkspaceRef(workspaceUri)) {
      throw new Error('Pod workspace session requires an http(s) workspaceUri.')
    }

    return {
      workspaceKind,
      workspaceUri,
      repoPath,
      folderPath: folderPathInput,
      baseRef,
      branch,
    }
  }

  if (!repoPath) {
    throw new Error('Local runtime session requires repoPath.')
  }

  const folderPath = folderPathInput || repoPath
  return {
    workspaceKind: folderPath !== repoPath ? 'local-worktree' : 'local-folder',
    workspaceUri,
    repoPath,
    folderPath,
    baseRef,
    branch,
  }
}

export function isRuntimeSessionInWorkspace(
  session: RuntimeWorkspaceSessionLike,
  workspacePath: string,
  options: NormalizeRuntimeWorkspaceOptions = {},
): boolean {
  const normalize = options.normalizeLocalPath ?? normalizeLocalPath
  const expected = normalize(workspacePath)
  if (!expected) return false

  const candidates = [session.cwd, session.folderPath, session.repoPath]
    .map((value) => normalize(value))
    .filter(Boolean)
  return candidates.some((candidate) => candidate === expected)
}

export function filterRuntimeSessionsForWorkspace<T extends RuntimeWorkspaceSessionLike>(
  sessions: T[],
  workspacePath: string,
  options: NormalizeRuntimeWorkspaceOptions = {},
): T[] {
  return sessions.filter((session) => isRuntimeSessionInWorkspace(session, workspacePath, options))
}
