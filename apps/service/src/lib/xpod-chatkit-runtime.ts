import * as fs from 'fs'
import * as path from 'path'
import {
  type RuntimeRunner,
  type RuntimeRunnerHost,
  type RuntimeThreadEvent,
  type RuntimeThreadRecord,
} from './runtime-runner'
import {
  inferRuntimeWorkspaceKind,
  resolveRuntimeThreadWorkdir,
  runtimeThreadWorkspaceFileUrl,
} from './runtime-workspace'

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

interface RequestScopedAgentRuntimeInstance {
  run(input: {
    threadId: string
    prompt: string
    config: unknown
  }): AsyncIterable<PtyRuntimeOutputEvent>
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
  AcpAgentRuntime: new (options?: { worktreeRootDirName?: string }) => RequestScopedAgentRuntimeInstance
  GitWorktreeService: new () => GitWorktreeServiceInstance
}

let cachedModules: XpodRuntimeModules | null = null
let sharedAcpRuntime: RequestScopedAgentRuntimeInstance | null = null
let sharedGitService: GitWorktreeServiceInstance | null = null

function loadXpodRuntimeModules(): XpodRuntimeModules {
  if (cachedModules) {
    return cachedModules
  }

  const packageJsonPath = require.resolve('@undefineds.co/xpod/package.json')
  const packageDir = path.dirname(packageJsonPath)
  const runtimeModule = require(path.join(packageDir, 'dist', 'api', 'chatkit', 'runtime', 'AcpAgentRuntime.js')) as {
    AcpAgentRuntime: XpodRuntimeModules['AcpAgentRuntime']
  }
  const gitModule = require(path.join(packageDir, 'dist', 'api', 'chatkit', 'runtime', 'GitWorktreeService.js')) as {
    GitWorktreeService: XpodRuntimeModules['GitWorktreeService']
  }

  cachedModules = {
    AcpAgentRuntime: runtimeModule.AcpAgentRuntime,
    GitWorktreeService: gitModule.GitWorktreeService,
  }
  return cachedModules
}

function getSharedAcpRuntime(): RequestScopedAgentRuntimeInstance {
  if (!sharedAcpRuntime) {
    const { AcpAgentRuntime } = loadXpodRuntimeModules()
    sharedAcpRuntime = new AcpAgentRuntime({ worktreeRootDirName: 'linx-runtime-worktrees' })
  }
  return sharedAcpRuntime
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
  private readonly agentRuntime = getSharedAcpRuntime()
  private readonly gitService = getSharedGitService()

  constructor(private readonly host: RuntimeRunnerHost) {}

  async start(): Promise<RuntimeThreadRecord> {
    const workdir = await this.ensureWorkspaceReady()

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
      workdir,
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
    // AcpAgentRuntime is request-scoped; there is no resident process to stop here.
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
    // AcpAgentRuntime is request-scoped; there is no resident process to stop here.
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

    void this.streamRuntimeEvents(record.id, this.agentRuntime.run({
      threadId: record.id,
      prompt: text,
      config: this.buildRuntimeConfig(record),
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

    void this.streamRuntimeEvents(record.id, this.agentRuntime.run({
      threadId: record.id,
      prompt: `Continue after tool response ${requestId}:\n${output}`,
      config: this.buildRuntimeConfig(record),
    }))
    return record
  }

  private async ensureWorkspaceReady(): Promise<string> {
    const record = this.host.getRecord()
    const workspaceKind = inferRuntimeWorkspaceKind(record)

    if (workspaceKind === 'pod-container') {
      return resolveRuntimeThreadWorkdir(record, { ensure: true })
    }

    const repoPath = record.repoPath
    const folderPath = record.folderPath ?? record.repoPath
    if (!repoPath || !folderPath) {
      throw new Error('Local runtime session is missing repoPath or folderPath.')
    }

    const usesDedicatedFolder = folderPath !== repoPath
    if (!usesDedicatedFolder) {
      fs.mkdirSync(repoPath, { recursive: true })
      return repoPath
    }

    await this.gitService.assertGitRepo(repoPath)

    if (fs.existsSync(folderPath)) {
      return folderPath
    }

    await this.gitService.createWorktree({
      repoPath,
      worktreePath: folderPath,
      baseRef: record.baseRef || 'HEAD',
      branch: record.branch || buildDefaultBranchName(record),
    })

    this.host.updateRecord({
      branch: record.branch || buildDefaultBranchName(record),
      baseRef: record.baseRef || 'HEAD',
    })
    return folderPath
  }

  private buildRuntimeConfig(record: RuntimeThreadRecord) {
    const workspaceKind = inferRuntimeWorkspaceKind(record)
    const workspace = runtimeThreadWorkspaceFileUrl(record)
    const worktree = workspaceKind === 'local-worktree' && record.folderPath
      ? {
          mode: 'existing' as const,
          path: record.folderPath,
        }
      : undefined

    return {
      workspace,
      ...(worktree ? { worktree } : {}),
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
