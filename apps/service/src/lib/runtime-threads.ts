import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import {
  type CreateRuntimeThreadInput,
  type RuntimeRunner,
  type RuntimeRunnerHost,
  type RuntimeThreadEvent,
  type RuntimeThreadRecord,
  type ResolvedRuntimeWorkspace,
  isResolvedRuntimeWorkspace,
} from './runtime-runner'
import type { PodMountRecord } from './mount/types'
import { MockRuntimeRunner } from './runtime-runner-mock'
import { XpodPtyRuntimeRunner } from './xpod-chatkit-runtime'
import { getPodMountModule } from './mount/module'

const CONFIG_DIR = path.join(process.env.HOME || '', 'Library', 'Application Support', 'LinX')
const STORE_PATH = path.join(CONFIG_DIR, 'runtime-threads.json')
const MAX_LOG_EVENTS = 500
const RUNTIME_COPY_ROOT = path.join(CONFIG_DIR, 'runtime-copies')

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function ensureRuntimeCopyRoot() {
  ensureConfigDir()
  if (!fs.existsSync(RUNTIME_COPY_ROOT)) {
    fs.mkdirSync(RUNTIME_COPY_ROOT, { recursive: true })
  }
}

function getRuntimeWorkspacePath(input: CreateRuntimeThreadInput): string | undefined {
  return input.workspace?.path ?? input.mountPath ?? input.worktreePath ?? input.repoPath
}

function getExplicitPublicWorkspacePath(input: CreateRuntimeThreadInput): string | undefined {
  return input.workspace?.path ?? input.mountPath
}

function getWorkspaceCopyFlag(input: CreateRuntimeThreadInput): boolean {
  return input.workspace?.copy === true
}

function hasGitMetadata(input: CreateRuntimeThreadInput): boolean {
  const workspace = input.workspace
  const resolvedWorkspace = isResolvedRuntimeWorkspace(workspace) ? workspace : undefined
  return Boolean(
    resolvedWorkspace?.git?.repoPath
    || resolvedWorkspace?.git?.worktreePath
    || input.repoPath
    || input.worktreePath
    || input.baseRef
    || input.branch,
  )
}

function pathExists(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath)
  } catch {
    return false
  }
}

function resolveDirectoryCandidate(targetPath: string): string | null {
  if (pathExists(targetPath) && fs.statSync(targetPath).isDirectory()) {
    return targetPath
  }
  const parentDir = path.dirname(targetPath)
  if (pathExists(parentDir) && fs.statSync(parentDir).isDirectory()) {
    return parentDir
  }
  return null
}

function findGitRepoRoot(startPath?: string): string | null {
  if (!startPath) return null

  let current = resolveDirectoryCandidate(startPath)
  while (current) {
    const gitDir = path.join(current, '.git')
    if (pathExists(gitDir)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return null
}

function deriveCopiedWorktreePath(recordId: string): string {
  ensureRuntimeCopyRoot()
  return path.join(RUNTIME_COPY_ROOT, recordId)
}

function mapWorkspacePathIntoWorktree(workspacePath: string, repoPath: string, worktreePath: string): string {
  const relative = path.relative(repoPath, workspacePath)
  if (!relative || relative === '.') {
    return worktreePath
  }
  return path.join(worktreePath, relative)
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = path.resolve(candidatePath)
  const normalizedRoot = path.resolve(rootPath)
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
}

function findBestMountForPath(records: PodMountRecord[], candidatePath?: string): PodMountRecord | null {
  if (!candidatePath) return null

  const matches = records.filter((record) => isPathWithinRoot(candidatePath, record.rootPath))
  if (matches.length === 0) return null

  return matches.sort((a, b) => b.rootPath.length - a.rootPath.length)[0] ?? null
}

function buildWorkspace(
  input: CreateRuntimeThreadInput,
  workspaceRootPath?: string,
  podMountRootPath?: string,
  mountId?: string,
  resolvedGit?: ResolvedRuntimeWorkspace['git'],
): ResolvedRuntimeWorkspace | undefined {
  const workspacePath = getRuntimeWorkspacePath(input)
  const explicitWorkspace = input.workspace
  const resolvedExplicitWorkspace = isResolvedRuntimeWorkspace(explicitWorkspace) ? explicitWorkspace : undefined
  const explicitMountPath = resolvedExplicitWorkspace?.rootPath && podMountRootPath && resolvedExplicitWorkspace.rootPath === podMountRootPath
    ? resolvedExplicitWorkspace.rootPath
    : undefined
  if (explicitWorkspace) {
    const resolvedWorkspaceRootPath = resolvedExplicitWorkspace?.rootPath
      ?? workspaceRootPath
      ?? resolvedExplicitWorkspace?.git?.worktreePath
      ?? resolvedExplicitWorkspace?.git?.repoPath
    return {
      ...explicitWorkspace,
      path: explicitWorkspace.path ?? workspacePath ?? resolvedWorkspaceRootPath,
      copy: explicitWorkspace.copy,
      title: resolvedExplicitWorkspace?.title ?? input.title,
      rootPath: explicitMountPath ?? resolvedWorkspaceRootPath,
      git: resolvedGit ?? resolvedExplicitWorkspace?.git,
      capabilities: resolvedExplicitWorkspace?.capabilities
        ? {
          ...resolvedExplicitWorkspace.capabilities,
          writable: resolvedExplicitWorkspace.capabilities.writable ?? true,
        }
        : resolvedGit || resolvedWorkspaceRootPath
          ? { git: Boolean(resolvedGit?.repoPath || resolvedExplicitWorkspace?.git?.repoPath), writable: true }
          : undefined,
    }
  }

  const hasPodContext = Boolean(podMountRootPath || mountId || input.mountId || input.mountPath || input.ownerKey || input.ownerWebId)
  const hasGitContext = Boolean(resolvedGit?.repoPath || resolvedGit?.worktreePath || input.repoPath || input.worktreePath || input.baseRef || input.branch)

  if (!hasPodContext && !hasGitContext) {
    return undefined
  }

  return {
    path: workspacePath ?? workspaceRootPath,
    copy: input.workspace?.copy === true,
    title: input.title,
    rootPath: workspaceRootPath ?? workspacePath,
    scope: 'whole-root',
    git: hasGitContext ? (resolvedGit ?? {
      repoPath: input.repoPath,
      worktreePath: input.worktreePath,
      baseRef: input.baseRef,
      branch: input.branch,
    }) : undefined,
    capabilities: {
      git: hasGitContext,
      writable: true,
    },
  }
}

export class RuntimeThreadsModule {
  private threads = new Map<string, RuntimeThreadRecord>()
  private logs = new Map<string, RuntimeThreadEvent[]>()
  private emitters = new Map<string, EventEmitter>()
  private runners = new Map<string, RuntimeRunner>()

  constructor() {
    this.load()
  }

  private load() {
    ensureConfigDir()
    if (!fs.existsSync(STORE_PATH)) return

    try {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as RuntimeThreadRecord[]
      for (const item of raw) {
        this.threads.set(item.id, item)
      }
    } catch (error) {
      console.warn('[RuntimeThreads] Failed to load store:', error)
    }
  }

  private save() {
    ensureConfigDir()
    const rows = Array.from(this.threads.values())
    fs.writeFileSync(STORE_PATH, JSON.stringify(rows, null, 2))
  }

  private getEmitter(id: string): EventEmitter {
    let emitter = this.emitters.get(id)
    if (!emitter) {
      emitter = new EventEmitter()
      this.emitters.set(id, emitter)
    }
    return emitter
  }

  private appendLog(id: string, event: RuntimeThreadEvent) {
    const current = this.logs.get(id) ?? []
    current.push(event)
    if (current.length > MAX_LOG_EVENTS) {
      current.splice(0, current.length - MAX_LOG_EVENTS)
    }
    this.logs.set(id, current)
  }

  private emitEvent(id: string, event: RuntimeThreadEvent) {
    this.appendLog(id, event)
    this.getEmitter(id).emit('event', event)
  }

  private updateThread(id: string, updates: Partial<RuntimeThreadRecord>) {
    const current = this.getThreadOrThrow(id)
    const next: RuntimeThreadRecord = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    }
    this.threads.set(id, next)
    this.save()
    return next
  }

  private getThreadOrThrow(id: string): RuntimeThreadRecord {
    const thread = this.threads.get(id)
    if (!thread) {
      throw new Error(`Runtime session not found: ${id}`)
    }
    return thread
  }

  private createRunnerHost(id: string): RuntimeRunnerHost {
    return {
      getRecord: () => this.getThreadOrThrow(id),
      updateRecord: (updates) => this.updateThread(id, updates),
      emitEvent: (event) => this.emitEvent(id, event),
    }
  }

  private createRunner(id: string): RuntimeRunner {
    const record = this.getThreadOrThrow(id)
    if (record.runnerType === 'xpod-pty') {
      return new XpodPtyRuntimeRunner(this.createRunnerHost(id))
    }
    return new MockRuntimeRunner(this.createRunnerHost(id))
  }

  private getRunner(id: string): RuntimeRunner {
    this.getThreadOrThrow(id)
    let runner = this.runners.get(id)
    if (!runner) {
      runner = this.createRunner(id)
      this.runners.set(id, runner)
    }
    return runner
  }

  listThreads(threadId?: string): RuntimeThreadRecord[] {
    const rows = Array.from(this.threads.values())
    return rows
      .filter((item) => !threadId || item.threadId === threadId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listSessions(threadId?: string): RuntimeThreadRecord[] {
    return this.listThreads(threadId)
  }

  getThread(id: string): RuntimeThreadRecord | null {
    return this.threads.get(id) ?? null
  }

  getSession(id: string): RuntimeThreadRecord | null {
    return this.getThread(id)
  }

  getThreadByChatThread(threadId: string): RuntimeThreadRecord | null {
    return this.listThreads(threadId)[0] ?? null
  }

  getSessionByChatThread(threadId: string): RuntimeThreadRecord | null {
    return this.getThreadByChatThread(threadId)
  }

  async createThread(input: CreateRuntimeThreadInput): Promise<RuntimeThreadRecord> {
    const existing = this.getThreadByChatThread(input.threadId)
    if (existing) {
      return existing
    }
    const recordId = crypto.randomUUID()
    const mountModule = getPodMountModule()
    const ownerContext = mountModule.peekOwnerContext()
    const currentOwnerMounts = mountModule.listForCurrentOwner()
    const workspaceInput = input.workspace
    const resolvedWorkspaceInput = isResolvedRuntimeWorkspace(workspaceInput) ? workspaceInput : undefined
    const workspacePath = getRuntimeWorkspacePath(input)
    const inferredMount = findBestMountForPath(currentOwnerMounts, workspacePath)
    const explicitPublicWorkspacePath = getExplicitPublicWorkspacePath(input)
    const shouldProvisionMount = !explicitPublicWorkspacePath && !input.mountId && !input.mountPath &&
      Boolean(
        input.ownerKey
        || input.ownerWebId
        || ownerContext?.ownerKey
        || ownerContext?.ownerWebId,
      )

    const mount = shouldProvisionMount
      ? await mountModule.create({
        ownerKey: input.ownerKey,
        ownerWebId: input.ownerWebId,
        label: input.title,
        podBaseUrls: input.podBaseUrls,
      })
      : undefined

    const resolvedMountRootPath = mount?.rootPath
      ?? input.mountPath
      ?? inferredMount?.rootPath
    const resolvedMountId = mount?.id
      ?? input.mountId
      ?? inferredMount?.id

    const shouldCopyWorkspace = getWorkspaceCopyFlag(input)
    let resolvedWorkspaceRootPath = explicitPublicWorkspacePath ?? resolvedMountRootPath ?? workspacePath
    let resolvedGit = resolvedWorkspaceInput?.git
      ? { ...resolvedWorkspaceInput.git }
      : undefined

    if (!hasGitMetadata(input) && shouldCopyWorkspace && workspacePath) {
      const inferredRepoPath = findGitRepoRoot(workspacePath)
      if (inferredRepoPath) {
        const copiedWorktreePath = deriveCopiedWorktreePath(recordId)
        resolvedGit = {
          repoPath: inferredRepoPath,
          worktreePath: copiedWorktreePath,
          baseRef: input.baseRef,
          branch: input.branch,
        }
        resolvedWorkspaceRootPath = mapWorkspacePathIntoWorktree(workspacePath, inferredRepoPath, copiedWorktreePath)
      }
    }

    const workspace = buildWorkspace(
      input,
      resolvedWorkspaceRootPath,
      resolvedMountRootPath,
      resolvedMountId,
      resolvedGit,
    )
    const repoPath = resolvedGit?.repoPath ?? workspace?.git?.repoPath ?? workspace?.rootPath ?? workspacePath ?? input.repoPath
    const worktreePath = resolvedGit?.worktreePath ?? workspace?.git?.worktreePath ?? workspace?.rootPath ?? workspacePath ?? input.worktreePath ?? repoPath

    const now = new Date().toISOString()
    const record: RuntimeThreadRecord = {
      id: recordId,
      threadId: input.threadId,
      title: input.title,
      workspace,
      repoPath: repoPath || '',
      worktreePath: worktreePath || repoPath || '',
      mountId: resolvedMountId,
      mountPath: resolvedMountRootPath,
      ownerKey: input.ownerKey ?? inferredMount?.ownerKey,
      ownerWebId: input.ownerWebId ?? inferredMount?.ownerWebId,
      runnerType: input.runnerType || 'xpod-pty',
      tool: input.tool || 'codex',
      status: 'idle',
      tokenUsage: 0,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      baseRef: input.baseRef,
      branch: input.branch,
    }

    this.threads.set(record.id, record)
    this.runners.set(record.id, this.createRunner(record.id))
    this.save()
    return record
  }

  async createSession(input: CreateRuntimeThreadInput): Promise<RuntimeThreadRecord> {
    return this.createThread(input)
  }

  async startThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).start()
  }

  async startSession(id: string): Promise<RuntimeThreadRecord> {
    return this.startThread(id)
  }

  async pauseThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).pause()
  }

  async pauseSession(id: string): Promise<RuntimeThreadRecord> {
    return this.pauseThread(id)
  }

  async resumeThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).resume()
  }

  async resumeSession(id: string): Promise<RuntimeThreadRecord> {
    return this.resumeThread(id)
  }

  async stopThread(id: string): Promise<RuntimeThreadRecord> {
    const result = await this.getRunner(id).stop()
    if (result.mountId) {
      try {
        getPodMountModule().release(result.mountId)
      } catch {
        // ignore lease release errors during shutdown
      }
    }
    return result
  }

  async stopSession(id: string): Promise<RuntimeThreadRecord> {
    return this.stopThread(id)
  }


  async stopAllThreads(): Promise<void> {
    const active = Array.from(this.threads.values())
      .filter((thread) => thread.status === 'active' || thread.status === 'paused' || thread.status === 'idle')

    for (const thread of active) {
      try {
        await this.stopThread(thread.id)
      } catch {
        // ignore individual shutdown failures during global cleanup
      }
    }
  }

  async stopAllSessions(): Promise<void> {
    await this.stopAllThreads()
  }

  async sendMessage(id: string, text: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).sendMessage(text)
  }

  async sendSessionMessage(id: string, text: string): Promise<RuntimeThreadRecord> {
    return this.sendMessage(id, text)
  }

  async respondToToolCall(id: string, requestId: string, output: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).respondToToolCall(requestId, output)
  }

  async respondToSessionToolCall(id: string, requestId: string, output: string): Promise<RuntimeThreadRecord> {
    return this.respondToToolCall(id, requestId, output)
  }

  getLog(id: string): string {
    const events = this.logs.get(id) ?? []
    return events
      .map((event) => {
        switch (event.type) {
          case 'assistant_delta':
            return `[assistant_delta] ${event.text}`
          case 'assistant_done':
            return `[assistant] ${event.text}`
          case 'stdout':
            return `[stdout] ${event.text}`
          case 'stderr':
            return `[stderr] ${event.text}`
          case 'error':
            return `[error] ${event.message}`
          case 'status':
            return `[status] ${event.status}`
          case 'meta':
            return `[meta] ${event.runner} @ ${event.workdir}`
          case 'auth_required':
            return `[auth_required] ${event.method} ${event.url ?? ''}`.trim()
          case 'tool_call':
            return `[tool_call] ${event.name} ${event.requestId}`
          case 'exit':
            return `[exit] code=${event.code ?? 'null'} signal=${event.signal ?? ''}`
        }
      })
      .join('\n')
  }

  getSessionLog(id: string): string {
    return this.getLog(id)
  }

  subscribe(id: string, listener: (event: RuntimeThreadEvent) => void): () => void {
    const emitter = this.getEmitter(id)
    emitter.on('event', listener)
    return () => emitter.off('event', listener)
  }

  subscribeSession(id: string, listener: (event: RuntimeThreadEvent) => void): () => void {
    return this.subscribe(id, listener)
  }
}

let instance: RuntimeThreadsModule | null = null

export function getRuntimeThreadsModule(): RuntimeThreadsModule {
  if (!instance) {
    instance = new RuntimeThreadsModule()
  }
  return instance
}

export const getRuntimeSessionsModule = getRuntimeThreadsModule
