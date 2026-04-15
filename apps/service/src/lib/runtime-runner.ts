export type RuntimeThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'
export type RuntimeRunnerType = 'mock' | 'xpod-pty'
export type RuntimeToolType = 'codex' | 'claude' | 'codebuddy' | 'mock'
export type RuntimeWorkspaceScope = 'whole-root' | 'subfolder'

export interface RuntimeWorkspaceGitContext {
  repoPath?: string
  worktreePath?: string
  baseRef?: string
  branch?: string
}

export interface RuntimeWorkspaceCapabilities {
  git?: boolean
  writable?: boolean
}

export interface RuntimeWorkspaceInput {
  /**
   * Runtime create API input shape.
   *
   * This is an execution-time path-workspace contract, not the CSS persistence model.
   * For runtime purposes, a Pod mount that materializes as a local path is just a
   * filesystem workspace like any other local directory.
   *
   * The persisted thread model stores `thread.workspace` as a container/resource URI.
   * Local service code may derive this input from that URI + associated metadata.
   */
  path?: string
  copy?: boolean
}

export interface ResolvedRuntimeWorkspace extends RuntimeWorkspaceInput {
  /**
   * Local-service resolved runtime state.
   *
   * These fields are machine-local execution facts derived from the public runtime
   * input and/or persisted container metadata. They are not intended to be the
   * primary cross-device business truth.
   */
  title?: string
  rootPath?: string
  scope?: RuntimeWorkspaceScope
  git?: RuntimeWorkspaceGitContext
  capabilities?: RuntimeWorkspaceCapabilities
}

export function isResolvedRuntimeWorkspace(
  workspace: RuntimeWorkspaceInput | ResolvedRuntimeWorkspace | undefined,
): workspace is ResolvedRuntimeWorkspace {
  return Boolean(
    workspace && (
      'rootPath' in workspace
      || 'git' in workspace
      || 'capabilities' in workspace
      || 'title' in workspace
    )
  )
}

export interface RuntimeThreadRecord {
  id: string
  threadId: string
  title: string
  workspace?: ResolvedRuntimeWorkspace
  repoPath: string
  worktreePath: string
  mountId?: string
  mountPath?: string
  ownerKey?: string
  ownerWebId?: string
  runnerType: RuntimeRunnerType
  tool: RuntimeToolType
  status: RuntimeThreadStatus
  tokenUsage: number
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  baseRef?: string
  branch?: string
  lastError?: string
}

export type RuntimeThreadEvent =
  | { type: 'meta'; ts: number; threadId: string; runner: string; workdir: string }
  | { type: 'status'; ts: number; threadId: string; status: RuntimeThreadStatus }
  | { type: 'stdout'; ts: number; threadId: string; text: string }
  | { type: 'stderr'; ts: number; threadId: string; text: string }
  | { type: 'assistant_delta'; ts: number; threadId: string; text: string }
  | { type: 'assistant_done'; ts: number; threadId: string; text: string }
  | { type: 'auth_required'; ts: number; threadId: string; method: string; url?: string; message?: string; options?: Array<{ label?: string; url?: string; method?: string }> }
  | { type: 'tool_call'; ts: number; threadId: string; requestId: string; name: string; arguments: string }
  | { type: 'exit'; ts: number; threadId: string; code: number | null; signal?: string }
  | { type: 'error'; ts: number; threadId: string; message: string }

export interface CreateRuntimeThreadInput {
  threadId: string
  title: string
  /**
   * Public runtime create contract.
   *
   * Canonical input is `workspace: { path, copy }`.
   * The richer persisted thread/container model is intentionally separate.
   */
  workspace?: ResolvedRuntimeWorkspace | RuntimeWorkspaceInput
  repoPath?: string
  worktreePath?: string
  mountId?: string
  mountPath?: string
  ownerKey?: string
  ownerWebId?: string
  podBaseUrls?: string[]
  runnerType?: RuntimeRunnerType
  tool?: RuntimeToolType
  baseRef?: string
  branch?: string
}

export interface RuntimeRunnerHost {
  getRecord(): RuntimeThreadRecord
  updateRecord(updates: Partial<RuntimeThreadRecord>): RuntimeThreadRecord
  emitEvent(event: RuntimeThreadEvent): void
}

export interface RuntimeRunner {
  start(): Promise<RuntimeThreadRecord>
  pause(): Promise<RuntimeThreadRecord>
  resume(): Promise<RuntimeThreadRecord>
  stop(): Promise<RuntimeThreadRecord>
  sendMessage(text: string): Promise<RuntimeThreadRecord>
  respondToToolCall(requestId: string, output: string): Promise<RuntimeThreadRecord>
}
