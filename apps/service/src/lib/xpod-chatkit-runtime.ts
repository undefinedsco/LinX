import * as fs from 'fs'
import * as path from 'path'
import {
  type RuntimeRunner,
  type RuntimeRunnerHost,
  type RuntimeThreadEvent,
  type RuntimeThreadRecord,
} from './runtime-runner'

// xpod 0.2.0 runtime internals still use "thread" naming.
// LinX treats that as an implementation detail and exposes "runtime session" at the product boundary.

type PtyRuntimeOutputEvent = {
  type: 'text'
  text: string
} | {
  type: 'error'
  message: string
} | {
  type: 'auth_required'
  method: string
  url?: string
  message?: string
  options?: Array<{
    label?: string
    url?: string
    method?: string
  }>
} | {
  type: 'tool_call'
  requestId: string
  name: string
  arguments: string
}

interface PtyThreadRuntimeInstance {
  ensureStarted(threadId: string, cfg: unknown): Promise<unknown>
  stop(threadId: string): void
  sendMessage(
    threadId: string,
    text: string,
    options?: { idleMs?: number; authWaitMs?: number },
  ): AsyncIterable<PtyRuntimeOutputEvent>
  respondToRequest(
    threadId: string,
    requestId: string,
    output: string,
    options?: { idleMs?: number; authWaitMs?: number },
  ): AsyncIterable<PtyRuntimeOutputEvent>
}

interface GitWorktreeServiceInstance {
  assertGitRepo(repoPath: string): Promise<void>
  createWorktree(options: {
    repoPath: string
    worktreePath: string
    baseRef: string
    branch?: string
  }): Promise<void>
}

interface XpodRuntimeModules {
  PtyThreadRuntime: new (options?: { worktreeRootDirName?: string }) => PtyThreadRuntimeInstance
  GitWorktreeService: new () => GitWorktreeServiceInstance
}

let cachedModules: XpodRuntimeModules | null = null
let sharedPtyRuntime: PtyThreadRuntimeInstance | null = null
let sharedGitService: GitWorktreeServiceInstance | null = null

function loadXpodRuntimeModules(): XpodRuntimeModules {
  if (cachedModules) {
    return cachedModules
  }

  const packageJsonPath = require.resolve('@undefineds.co/xpod/package.json')
  const packageDir = path.dirname(packageJsonPath)
  const ptyModule = require(path.join(packageDir, 'dist', 'api', 'chatkit', 'runtime', 'PtyThreadRuntime.js')) as {
    PtyThreadRuntime: XpodRuntimeModules['PtyThreadRuntime']
  }
  const gitModule = require(path.join(packageDir, 'dist', 'api', 'chatkit', 'runtime', 'GitWorktreeService.js')) as {
    GitWorktreeService: XpodRuntimeModules['GitWorktreeService']
  }

  cachedModules = {
    PtyThreadRuntime: ptyModule.PtyThreadRuntime,
    GitWorktreeService: gitModule.GitWorktreeService,
  }
  return cachedModules
}

function getSharedPtyRuntime(): PtyThreadRuntimeInstance {
  if (!sharedPtyRuntime) {
    const { PtyThreadRuntime } = loadXpodRuntimeModules()
    sharedPtyRuntime = new PtyThreadRuntime({ worktreeRootDirName: 'linx-runtime-worktrees' })
  }
  return sharedPtyRuntime
}

function getSharedGitService(): GitWorktreeServiceInstance {
  if (!sharedGitService) {
    const { GitWorktreeService } = loadXpodRuntimeModules()
    sharedGitService = new GitWorktreeService()
  }
  return sharedGitService
}

function slugifyBranchSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'session'
}

function buildDefaultBranchName(record: RuntimeThreadRecord): string {
  const titlePart = slugifyBranchSegment(record.title)
  const idPart = record.id.slice(0, 8)
  return `linx/${titlePart}-${idPart}`
}

export class XpodPtyRuntimeRunner implements RuntimeRunner {
  private readonly ptyRuntime = getSharedPtyRuntime()
  private readonly gitService = getSharedGitService()

  constructor(private readonly host: RuntimeRunnerHost) {}

  async start(): Promise<RuntimeThreadRecord> {
    await this.ensureWorkspaceReady()
    const record = this.host.getRecord()

    await this.ptyRuntime.ensureStarted(record.id, this.buildPtyConfig(record))

    const updated = this.host.updateRecord({
      status: 'active',
      runnerType: 'xpod-pty',
      lastError: undefined,
    })

    this.host.emitEvent({
      type: 'meta',
      ts: Date.now(),
      threadId: updated.id,
      runner: updated.tool,
      workdir: updated.worktreePath,
    })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: updated.id,
      status: 'active',
    })

    return updated
  }

  async pause(): Promise<RuntimeThreadRecord> {
    const record = this.host.getRecord()
    this.ptyRuntime.stop(record.id)
    const updated = this.host.updateRecord({ status: 'paused' })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: updated.id,
      status: 'paused',
    })
    return updated
  }

  async resume(): Promise<RuntimeThreadRecord> {
    return this.start()
  }

  async stop(): Promise<RuntimeThreadRecord> {
    const record = this.host.getRecord()
    this.ptyRuntime.stop(record.id)
    const updated = this.host.updateRecord({ status: 'completed' })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: updated.id,
      status: 'completed',
    })
    this.host.emitEvent({
      type: 'exit',
      ts: Date.now(),
      threadId: updated.id,
      code: 0,
      signal: 'SIGTERM',
    })
    return updated
  }

  async sendMessage(text: string): Promise<RuntimeThreadRecord> {
    const record = this.host.getRecord()
    if (record.status !== 'active') {
      throw new Error('Runtime thread is not active')
    }

    this.host.emitEvent({
      type: 'stdout',
      ts: Date.now(),
      threadId: record.id,
      text: `$ ${text}`,
    })

    void this.streamRuntimeEvents(record.id, this.ptyRuntime.sendMessage(record.id, text, {
      idleMs: 800,
      authWaitMs: 5 * 60_000,
    }))
    return record
  }

  async respondToToolCall(requestId: string, output: string): Promise<RuntimeThreadRecord> {
    const record = this.host.getRecord()
    if (record.status !== 'active') {
      throw new Error('Runtime thread is not active')
    }

    this.host.emitEvent({
      type: 'stdout',
      ts: Date.now(),
      threadId: record.id,
      text: `[tool_response] ${requestId} ${output}`,
    })

    void this.streamRuntimeEvents(record.id, this.ptyRuntime.respondToRequest(record.id, requestId, output, {
      idleMs: 800,
      authWaitMs: 5 * 60_000,
    }))
    return record
  }

  private async ensureWorkspaceReady(): Promise<void> {
    const record = this.host.getRecord()
    await this.gitService.assertGitRepo(record.repoPath)

    const usesDedicatedWorktree = record.worktreePath !== record.repoPath
    if (!usesDedicatedWorktree || fs.existsSync(record.worktreePath)) {
      return
    }

    await this.gitService.createWorktree({
      repoPath: record.repoPath,
      worktreePath: record.worktreePath,
      baseRef: record.baseRef || 'HEAD',
      branch: record.branch || buildDefaultBranchName(record),
    })

    this.host.updateRecord({
      branch: record.branch || buildDefaultBranchName(record),
      baseRef: record.baseRef || 'HEAD',
    })
  }

  private buildPtyConfig(record: RuntimeThreadRecord) {
    const workspace = record.worktreePath === record.repoPath
      ? { type: 'path' as const, rootPath: record.repoPath }
      : {
          type: 'git' as const,
          rootPath: record.repoPath,
          worktree: {
            mode: 'existing' as const,
            path: record.worktreePath,
          },
        }

    return {
      workspace,
      idleMs: 800,
      authWaitMs: 5 * 60_000,
      runner: {
        type: (record.tool as 'codex' | 'claude' | 'codebuddy') || 'codex',
        protocol: 'acp' as const,
      },
    }
  }

  private async streamRuntimeEvents(
    threadRuntimeId: string,
    events: AsyncIterable<PtyRuntimeOutputEvent>,
  ): Promise<void> {
    let fullText = ''

    try {
      for await (const event of events) {
        const record = this.host.getRecord()

        if (event.type === 'text') {
          fullText += event.text
          this.host.emitEvent({
            type: 'assistant_delta',
            ts: Date.now(),
            threadId: record.id,
            text: event.text,
          })
          continue
        }

        if (event.type === 'tool_call') {
          this.host.emitEvent({
            type: 'tool_call',
            ts: Date.now(),
            threadId: record.id,
            requestId: event.requestId,
            name: event.name,
            arguments: event.arguments,
          })
          continue
        }

        if (event.type === 'auth_required') {
          this.host.emitEvent({
            type: 'auth_required',
            ts: Date.now(),
            threadId: record.id,
            method: event.method,
            url: event.url,
            message: event.message,
            options: event.options,
          })
          continue
        }

        if (event.type === 'error') {
          throw new Error(event.message)
        }
      }

      if (fullText) {
        this.host.emitEvent({
          type: 'assistant_done',
          ts: Date.now(),
          threadId: threadRuntimeId,
          text: fullText,
        })
        this.host.updateRecord({
          tokenUsage: this.host.getRecord().tokenUsage + Math.max(64, fullText.length),
          lastError: undefined,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Runtime execution failed'
      this.host.updateRecord({ lastError: message, status: 'error' })
      this.host.emitEvent({
        type: 'error',
        ts: Date.now(),
        threadId: threadRuntimeId,
        message,
      })
    }
  }
}
