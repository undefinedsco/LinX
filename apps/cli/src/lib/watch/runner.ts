import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  buildCodexApprovalResponse,
  buildCodexUserInputResponse,
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerInteractionRequest,
  normalizeCodexAppServerRequest,
  normalizeWatchCredentialSource,
  parseWatchJsonLine,
  resolveWatchInteractionAutoResponse,
  resolveWatchQuestionAnswer,
  resolveWatchCredentialSourceResolution,
  shouldAttemptCloudCredentialProbe,
  type WatchAuthStatus,
  type WatchApprovalDecision,
  type WatchApprovalRequest,
  type WatchCloudCredentialProbe,
  type WatchUserInputAnswers,
  type WatchUserInputQuestion,
} from '@linx/models/watch'
import {
  appendWatchEvent,
  createWatchSession,
  finishWatchSession,
  loadWatchSession,
  listWatchSessions,
  writeWatchSession,
} from './archive.js'
import { detectWatchAuthFailure, preflightWatchAuth, type WatchAuthPreflightResult } from './auth.js'
import { describeWatchMode, getWatchHook, listWatchHooks } from './hooks/index.js'
import { loadPodBackendCredential, podCredentialMissingMessage } from './pod-ai.js'
import { promptText } from '../prompt.js'
import type {
  WatchBackendHook,
  WatchCredentialSource,
  WatchEventLogEntry,
  WatchNormalizedEvent,
  WatchRuntime,
  WatchRunOptions,
  WatchSpawnPlan,
  WatchSessionRecord,
} from './types.js'

type OutputStream = 'stdout' | 'stderr'

interface WatchConversationSession {
  readonly record: WatchSessionRecord
  start(): Promise<void>
  sendTurn(text: string): Promise<void>
  applyResolvedOptions(options: WatchRunOptions): void
  close(): Promise<void>
}

interface TurnState {
  resolve: () => void
  reject: (error: Error) => void
  turnId?: string
}

interface ResolvedWatchRun {
  options: WatchRunOptions
  authPreflight: WatchAuthPreflightResult
}

export const watchRuntime = {
  promptText,
  preflightWatchAuth,
  loadPodBackendCredential,
}

function quoteArg(value: string): string {
  return /[\s"]/u.test(value) ? JSON.stringify(value) : value
}

function renderSessionHeader(record: WatchSessionRecord): void {
  process.stdout.write(
    `LinX watch\nsession: ${record.id}\nbackend: ${record.backend}\nruntime: ${record.runtime}\nmode: ${record.mode}\ncmd: ${quoteArg(record.command)} ${record.args.map(quoteArg).join(' ')}\n\n`,
  )
}

function flushAssistantLine(state: { hasAssistantOutput: boolean }): void {
  if (state.hasAssistantOutput) {
    process.stdout.write('\n')
    state.hasAssistantOutput = false
  }
}

function renderEvents(events: WatchNormalizedEvent[], state: { hasAssistantOutput: boolean }): void {
  for (const event of events) {
    if (event.type === 'assistant.delta') {
      process.stdout.write(event.text)
      state.hasAssistantOutput = true
      continue
    }

    if (event.type === 'assistant.done') {
      if (event.text && !state.hasAssistantOutput) {
        process.stdout.write(`${event.text}\n`)
      } else {
        flushAssistantLine(state)
      }
      continue
    }

    flushAssistantLine(state)

    if (event.type === 'tool.call') {
      const detail = event.arguments ? ` ${JSON.stringify(event.arguments)}` : ''
      process.stdout.write(`[tool] ${event.name}${detail}\n`)
      continue
    }

    if (event.type === 'approval.required') {
      process.stdout.write(`[approval] ${event.message}\n`)
      continue
    }

    if (event.type === 'input.required') {
      process.stdout.write(`[input] ${event.message}\n`)
      continue
    }

    process.stdout.write(`[note] ${event.message}\n`)
  }
}

function createLineSplitter(
  stream: OutputStream,
  onLine: (line: string, stream: OutputStream) => void,
): { push: (chunk: string) => void; flush: () => void } {
  let buffer = ''

  return {
    push(chunk: string) {
      buffer += chunk
      let newlineIndex = buffer.indexOf('\n')

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        onLine(line, stream)
        newlineIndex = buffer.indexOf('\n')
      }

      if (buffer.length > 16_384) {
        onLine(buffer, stream)
        buffer = ''
      }
    },
    flush() {
      if (!buffer) {
        return
      }

      onLine(buffer.replace(/\r$/, ''), stream)
      buffer = ''
    },
  }
}

function appendEntry(record: WatchSessionRecord, stream: WatchEventLogEntry['stream'], line: string, events: WatchNormalizedEvent[]): void {
  const entry: WatchEventLogEntry = {
    timestamp: new Date().toISOString(),
    stream,
    line,
    events,
  }
  appendWatchEvent(record, entry)
}

function textForRawOutput(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw.trim()) {
    return raw
  }

  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }

  const record = raw as Record<string, unknown>
  const candidates = [record.message, record.reason, record.delta, record.text, record.summary]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }

  return undefined
}

async function promptApproval(message: string, allowSessionOption = true): Promise<WatchApprovalDecision> {
  while (true) {
    const suffix = allowSessionOption ? ' [y]es/[s]ession/[n]o/[c]ancel: ' : ' [y]es/[n]o/[c]ancel: '
    const answer = (await watchRuntime.promptText(`${message}${suffix}`)).trim().toLowerCase()

    if (answer === 'y' || answer === 'yes') return 'accept'
    if (allowSessionOption && (answer === 's' || answer === 'session')) return 'accept_for_session'
    if (answer === 'n' || answer === 'no') return 'decline'
    if (answer === 'c' || answer === 'cancel') return 'cancel'
  }
}

async function promptToolQuestion(question: WatchUserInputQuestion): Promise<string[]> {
  const options = question.options

  process.stdout.write(`[input] ${question.header}: ${question.question}\n`)
  if (options.length > 0) {
    options.forEach((option, index) => {
      process.stdout.write(`  ${index + 1}. ${option.label}${option.description ? ` - ${option.description}` : ''}\n`)
    })
  }

  const raw = (await watchRuntime.promptText('answer> ')).trim()
  return resolveWatchQuestionAnswer(question, raw)
}

function approvalPromptMessage(request: WatchApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return request.command ? `Approve command: ${request.command}` : 'Approve command execution'
  }

  if (request.kind === 'file-change-approval') {
    return request.reason && request.reason.trim() ? request.reason : 'Approve file changes'
  }

  if (request.kind === 'permissions-approval') {
    return request.message || 'Approve additional permissions'
  }

  return request.message || 'Codex requests approval'
}

function appendUserTurn(record: WatchSessionRecord, text: string): void {
  appendEntry(record, 'system', JSON.stringify({ type: 'user.turn', text }), [])
}

function appendTurnStart(record: WatchSessionRecord, command: string, args: string[]): void {
  appendEntry(record, 'system', JSON.stringify({ type: 'turn.start', command, args }), [])
}

function requestedCredentialSource(options: WatchRunOptions): WatchCredentialSource {
  return normalizeWatchCredentialSource(options.credentialSource)
}

function requestedRuntime(options: WatchRunOptions): WatchRuntime {
  return options.runtime ?? 'local'
}

function mergeCommandEnv(
  commandEnv: Record<string, string> | undefined,
  planEnv: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!commandEnv && !planEnv) {
    return undefined
  }

  return {
    ...(commandEnv ?? {}),
    ...(planEnv ?? {}),
  }
}

function syncRecordFromOptions(
  record: WatchSessionRecord,
  options: WatchRunOptions,
  plan: WatchSpawnPlan,
): Partial<WatchSessionRecord> {
  return {
    backend: options.backend,
    runtime: requestedRuntime(options),
    mode: options.mode,
    cwd: options.cwd,
    model: options.model,
    prompt: options.prompt,
    passthroughArgs: [...options.passthroughArgs],
    credentialSource: requestedCredentialSource(options),
    resolvedCredentialSource: options.resolvedCredentialSource,
    command: plan.command,
    args: [...plan.args],
  }
}

function withResolvedSource(
  options: WatchRunOptions,
  resolvedCredentialSource: 'local' | 'cloud',
  commandEnv?: Record<string, string>,
): WatchRunOptions {
  return {
    ...options,
    credentialSource: requestedCredentialSource(options),
    resolvedCredentialSource,
    commandEnv,
  }
}

async function probeCloudCredentialSource(
  backend: WatchRunOptions['backend'],
  runtime: typeof watchRuntime,
): Promise<{
  probe: WatchCloudCredentialProbe
  commandEnv?: Record<string, string>
}> {
  try {
    const podCredential = await runtime.loadPodBackendCredential(backend)
    if (!podCredential) {
      return {
        probe: {
          status: 'unavailable',
          message: podCredentialMissingMessage(backend),
        },
      }
    }

    return {
      probe: { status: 'available' },
      commandEnv: { ...podCredential.env },
    }
  } catch (error) {
    return {
      probe: {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

export async function resolveWatchRunOptions(
  options: WatchRunOptions,
  runtime = watchRuntime,
): Promise<ResolvedWatchRun> {
  const source = requestedCredentialSource(options)

  if (source === 'cloud') {
    const { probe, commandEnv } = await probeCloudCredentialSource(options.backend, runtime)
    const resolution = resolveWatchCredentialSourceResolution({
      requestedSource: source,
      localAuthStatus: { state: 'unknown' },
      cloudCredentialProbe: probe,
    })

    if (resolution.error) {
      throw new Error(resolution.error)
    }

    return {
      options: withResolvedSource(options, resolution.resolvedSource ?? 'cloud', commandEnv),
      authPreflight: resolution.authStatus,
    }
  }

  const localOptions = withResolvedSource(options, 'local')
  const authPreflight = await runtime.preflightWatchAuth(options.backend)
  let cloudCredentialProbe: WatchCloudCredentialProbe | undefined
  let commandEnv: Record<string, string> | undefined

  if (shouldAttemptCloudCredentialProbe(source, authPreflight as WatchAuthStatus)) {
    const cloudResult = await probeCloudCredentialSource(options.backend, runtime)
    cloudCredentialProbe = cloudResult.probe
    commandEnv = cloudResult.commandEnv
  }

  const resolution = resolveWatchCredentialSourceResolution({
    requestedSource: source,
    localAuthStatus: authPreflight,
    cloudCredentialProbe,
    defaultLocalMessage: `${options.backend} is not authenticated`,
  })

  if (resolution.error) {
    throw new Error(resolution.error)
  }

  return {
    options: resolution.resolvedSource === 'cloud'
      ? withResolvedSource(options, 'cloud', commandEnv)
      : localOptions,
    authPreflight: resolution.authStatus,
  }
}

abstract class BaseSession implements WatchConversationSession {
  readonly record: WatchSessionRecord
  protected readonly renderState = { hasAssistantOutput: false }
  protected child: ChildProcessWithoutNullStreams | null = null
  private activeExitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null
  private activeExitResolve: ((result: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null
  protected closed = false
  protected lastExit: { code: number | null; signal: NodeJS.Signals | null } | null = null

  constructor(record: WatchSessionRecord) {
    this.record = record
  }

  protected spawnProcess(command: string, args: string[], cwd: string, env?: Record<string, string>): ChildProcessWithoutNullStreams {
    this.activeExitPromise = new Promise((resolve) => {
      this.activeExitResolve = resolve
    })

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    this.child = child

    child.on('error', (error) => {
      appendEntry(this.record, 'system', JSON.stringify({ type: 'process.error', message: error.message }), [
        { type: 'session.note', message: error.message, raw: error.message },
      ])
      this.onProcessFailure(new Error(error.message))
    })

    child.on('exit', (code, signal) => {
      this.lastExit = { code, signal }
      this.activeExitResolve?.({ code, signal })
      this.activeExitResolve = null
      if (this.child === child) {
        this.child = null
      }
      this.onProcessExit(code, signal)
    })

    return child
  }

  async finalizeAndClose(status: 'completed' | 'failed', error?: string): Promise<void> {
    const exitState = await this.waitForActiveExit()
    const next = finishWatchSession(this.record, {
      status,
      exitCode: exitState.code,
      signal: exitState.signal,
      error,
    })
    flushAssistantLine(this.renderState)
    if (status === 'completed') {
      process.stdout.write(`\n[session] completed ${next.id}\n`)
    } else {
      process.stderr.write(`\n[session] failed ${next.id}${error ? `: ${error}` : ''}\n`)
    }
  }

  protected recordParsedLine(stream: OutputStream, line: string, events: WatchNormalizedEvent[]): void {
    appendEntry(this.record, stream, line, events)

    if (events.length > 0) {
      renderEvents(events, this.renderState)
      return
    }

    flushAssistantLine(this.renderState)
    if (!line.trim()) {
      return
    }

    const target = stream === 'stderr' ? process.stderr : process.stdout
    target.write(`${line}\n`)
  }

  protected updateRecord(updates: Partial<WatchSessionRecord>): void {
    Object.assign(this.record, updates)
    writeWatchSession(this.record)
  }

  protected waitForActiveExit(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    if (this.lastExit) {
      return Promise.resolve(this.lastExit)
    }

    if (this.activeExitPromise) {
      return this.activeExitPromise
    }

    return Promise.resolve({ code: null, signal: null })
  }

  protected abstract onProcessExit(code: number | null, signal: NodeJS.Signals | null): void
  protected abstract onProcessFailure(error: Error): void

  abstract start(): Promise<void>
  abstract sendTurn(text: string): Promise<void>
  abstract applyResolvedOptions(options: WatchRunOptions): void

  async close(): Promise<void> {
    this.closed = true

    const child = this.child
    if (!child) {
      return
    }

    child.stdin.end()
    const settled = await Promise.race([
      this.waitForActiveExit().then(() => true),
      delay(1500).then(() => false),
    ])

    if (!settled) {
      child.kill('SIGTERM')
      await this.waitForActiveExit()
    }
  }
}

class PerTurnCliSession extends BaseSession {
  private readonly hook: WatchBackendHook
  private options: WatchRunOptions
  private turnState: TurnState | null = null
  private turnIndex = 0
  private authFailureMessage: string | null = null

  constructor(options: WatchRunOptions, hook: WatchBackendHook) {
    const plan = hook.buildSpawnPlan({ ...options, prompt: undefined })
    super(createWatchSession({ ...options, prompt: options.prompt }, plan))
    this.hook = hook
    this.options = options
  }

  async start(): Promise<void> {}

  applyResolvedOptions(options: WatchRunOptions): void {
    this.options = options
    const plan = this.hook.buildSpawnPlan({ ...options, prompt: undefined })
    this.updateRecord(syncRecordFromOptions(this.record, options, plan))
  }

  async sendTurn(text: string): Promise<void> {
    if (!this.hook.buildTurnPlan) {
      throw new Error(`Watch backend ${this.hook.id} does not support per-turn execution`)
    }
    if (this.turnState) {
      throw new Error('A watch turn is already in progress')
    }

    const plan = this.hook.buildTurnPlan(this.options, {
      backendSessionId: this.record.backendSessionId,
      prompt: text,
      turnIndex: this.turnIndex,
    })

    appendUserTurn(this.record, text)
    appendTurnStart(this.record, plan.command, plan.args)
    this.authFailureMessage = null

    const child = this.spawnProcess(
      plan.command,
      plan.args,
      this.record.cwd,
      mergeCommandEnv(this.options.commandEnv, plan.env),
    )
    const stdoutSplitter = createLineSplitter('stdout', this.handleLine.bind(this))
    const stderrSplitter = createLineSplitter('stderr', this.handleLine.bind(this))

    child.stdout.on('data', (chunk: string) => stdoutSplitter.push(chunk))
    child.stderr.on('data', (chunk: string) => stderrSplitter.push(chunk))
    child.on('exit', () => {
      stdoutSplitter.flush()
      stderrSplitter.flush()
    })
    child.stdin.end()

    await new Promise<void>((resolve, reject) => {
      this.turnState = { resolve, reject }
    })

    this.turnIndex += 1
  }

  protected onProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.turnState) {
      const { resolve, reject } = this.turnState
      this.turnState = null
      if (code === 0 && !this.authFailureMessage) {
        resolve()
        return
      }

      reject(new Error(this.authFailureMessage ?? `Watch process exited during turn (${code ?? signal ?? 'null'})`))
    }
  }

  protected onProcessFailure(error: Error): void {
    if (this.turnState) {
      const reject = this.turnState.reject
      this.turnState = null
      reject(error)
    }
  }

  private handleLine(line: string, stream: OutputStream): void {
    const authFailure = detectWatchAuthFailure(this.record.backend, line)
    if (authFailure) {
      this.authFailureMessage = authFailure.message
    }

    const events = this.hook.parseLine(line, stream)
    this.recordParsedLine(stream, line, events)

    const backendSessionId = this.hook.extractSessionId?.(line)
    if (backendSessionId && backendSessionId !== this.record.backendSessionId) {
      this.updateRecord({
        backendSessionId,
        error: undefined,
      })
    }
  }
}

class CodexAppServerSession extends BaseSession {
  private requestId = 1
  private readonly pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private options: WatchRunOptions
  private turnState: TurnState | null = null
  private threadId: string | null = null
  private authFailureMessage: string | null = null

  constructor(options: WatchRunOptions) {
    const hook = getWatchHook('codex')
    const plan = hook.buildSpawnPlan({ ...options, prompt: undefined })
    super(createWatchSession({ ...options, prompt: options.prompt }, plan))
    this.options = options
  }

  async start(): Promise<void> {
    const child = this.spawnProcess(
      this.record.command,
      this.record.args,
      this.record.cwd,
      this.options.commandEnv,
    )
    const stdoutSplitter = createLineSplitter('stdout', this.handleLine.bind(this))
    const stderrSplitter = createLineSplitter('stderr', this.handleLine.bind(this))

    child.stdout.on('data', (chunk: string) => stdoutSplitter.push(chunk))
    child.stderr.on('data', (chunk: string) => stderrSplitter.push(chunk))
    child.on('exit', () => {
      stdoutSplitter.flush()
      stderrSplitter.flush()
    })

    await this.sendRequest('initialize', {
      clientInfo: {
        name: 'linx-cli',
        title: 'LinX CLI',
        version: '0.1.0',
      },
      capabilities: null,
    })
    this.sendNotification('initialized')

    const response = await this.sendRequest('thread/start', {
      model: this.options.model ?? null,
      cwd: this.options.cwd,
      approvalPolicy: this.approvalPolicy(),
      sandbox: this.sandboxMode(),
      ephemeral: false,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    }) as { thread?: { id?: string } }

    const threadId = response.thread?.id
    if (!threadId) {
      throw new Error('Codex app-server did not return a thread id')
    }

    this.threadId = threadId
  }

  async sendTurn(text: string): Promise<void> {
    if (!this.threadId) {
      throw new Error('Codex thread is not initialized')
    }
    if (this.turnState) {
      throw new Error('A watch turn is already in progress')
    }

    appendUserTurn(this.record, text)
    this.authFailureMessage = null

    const completion = new Promise<void>((resolve, reject) => {
      this.turnState = { resolve, reject }
    })

    try {
      const response = await this.sendRequest('turn/start', {
        threadId: this.threadId,
        input: [{ type: 'text', text, text_elements: [] }],
        model: this.options.model ?? null,
      }) as { turn?: { id?: string } }

      const turnState = this.turnState as TurnState | null
      if (turnState && response.turn?.id) {
        turnState.turnId = response.turn.id
      }
    } catch (error) {
      const turnState = this.turnState as TurnState | null
      if (turnState) {
        this.turnState = null
        turnState.reject(error instanceof Error ? error : new Error(String(error)))
      }
      throw error
    }

    await completion
  }

  applyResolvedOptions(options: WatchRunOptions): void {
    this.options = options
    const hook = getWatchHook('codex')
    const plan = hook.buildSpawnPlan({ ...options, prompt: undefined })
    this.updateRecord(syncRecordFromOptions(this.record, options, plan))
  }

  protected onProcessExit(code: number | null): void {
    const errorMessage = this.authFailureMessage ?? `Codex app-server exited (${code ?? 'null'})`
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(errorMessage))
    }
    this.pendingRequests.clear()

    if (this.turnState) {
      const reject = this.turnState.reject
      this.turnState = null
      reject(new Error(this.authFailureMessage ?? `Codex app-server exited during turn (${code ?? 'null'})`))
    }
  }

  protected onProcessFailure(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()

    if (this.turnState) {
      const reject = this.turnState.reject
      this.turnState = null
      reject(error)
    }
  }

  private handleLine(line: string, stream: OutputStream): void {
    const authFailure = detectWatchAuthFailure(this.record.backend, line)
    if (authFailure) {
      this.authFailureMessage = authFailure.message
    }

    const message = parseWatchJsonLine(line)
    if (!message) {
      this.recordParsedLine(stream, line, [])
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'undefined') {
      const events = normalizeCodexAppServerRequest(message)
      this.recordParsedLine(stream, line, events)
      void this.handleServerRequest(message)
      return
    }

    if (typeof message.method === 'string') {
      const events = normalizeCodexAppServerNotification(message)
      this.recordParsedLine(stream, line, events)
      this.handleNotification(message)
      return
    }

    if (typeof message.id !== 'undefined') {
      appendEntry(this.record, stream, line, [])
      this.handleResponse(message)
      return
    }

    this.recordParsedLine(stream, line, [])
  }

  private handleResponse(message: Record<string, unknown>): void {
    const id = typeof message.id === 'number' ? message.id : Number(message.id)
    const pending = this.pendingRequests.get(id)
    if (!pending) {
      return
    }
    this.pendingRequests.delete(id)

    if ('error' in message && message.error) {
      const authFailure = detectWatchAuthFailure('codex', JSON.stringify(message))
      if (authFailure) {
        this.authFailureMessage = authFailure.message
        pending.reject(new Error(authFailure.message))
        return
      }

      pending.reject(new Error(JSON.stringify(message.error)))
      return
    }

    pending.resolve(message.result)
  }

  private handleNotification(message: Record<string, unknown>): void {
    const method = typeof message.method === 'string' ? message.method : ''
    const params = (typeof message.params === 'object' && message.params !== null
      ? message.params
      : {}) as Record<string, unknown>

    if (method === 'turn/started' && typeof params.turn === 'object' && params.turn !== null && this.turnState) {
      const turn = params.turn as Record<string, unknown>
      if (typeof turn.id === 'string') {
        this.turnState.turnId = turn.id
      }
      return
    }

    if (method === 'turn/completed' && this.turnState) {
      const turn = (typeof params.turn === 'object' && params.turn !== null ? params.turn : {}) as Record<string, unknown>
      const completedId = typeof turn.id === 'string' ? turn.id : undefined

      if (!this.turnState.turnId || !completedId || this.turnState.turnId === completedId) {
        const resolve = this.turnState.resolve
        this.turnState = null
        resolve()
      }
      return
    }

    if (method === 'error' && this.turnState) {
      const authFailure = detectWatchAuthFailure('codex', JSON.stringify(message))
      if (authFailure) {
        this.authFailureMessage = authFailure.message
      }

      const reject = this.turnState.reject
      this.turnState = null
      reject(new Error(this.authFailureMessage ?? (textForRawOutput(params.error) || 'Codex turn failed')))
    }
  }

  private async handleServerRequest(message: Record<string, unknown>): Promise<void> {
    const method = message.method as string
    const id = message.id
    const params = (message.params ?? {}) as Record<string, unknown>
    const interaction = normalizeCodexAppServerInteractionRequest(message)

    let result: unknown

    if (interaction?.kind === 'user-input') {
      result = await this.resolveToolUserInput(interaction.questions)
    } else if (interaction) {
      const autoResult = resolveWatchInteractionAutoResponse({
        mode: this.options.mode,
        request: interaction,
      })

      if (autoResult) {
        result = autoResult
      } else {
        const decision = await promptApproval(approvalPromptMessage(interaction), true)
        result = buildCodexApprovalResponse(interaction, decision)
      }
    } else if (method === 'item/tool/call') {
      result = {
        contentItems: [{ type: 'inputText', text: 'linx-cli local dynamic tool execution is not implemented' }],
        success: false,
      }
    } else if (method === 'mcpServer/elicitation/request') {
      result = { action: 'cancel', content: null, _meta: null }
    } else {
      result = { action: 'cancel', content: null, _meta: null }
    }

    this.sendResponse(id, result)
  }

  private async resolveToolUserInput(questions: WatchUserInputQuestion[]): Promise<unknown> {
    const answers: WatchUserInputAnswers = {}

    for (const question of questions) {
      answers[question.id] = {
        answers: await promptToolQuestion(question),
      }
    }

    return buildCodexUserInputResponse(answers)
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.requestId++
    const child = this.child
    if (!child) {
      throw new Error('Codex app-server is not started')
    }

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
    })
  }

  private sendNotification(method: string, params?: unknown): void {
    const child = this.child
    if (!child) {
      throw new Error('Codex app-server is not started')
    }

    const payload = typeof params === 'undefined'
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params }
    child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private sendResponse(id: unknown, result: unknown): void {
    const child = this.child
    if (!child) {
      throw new Error('Codex app-server is not started')
    }

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
  }

  private approvalPolicy(): 'untrusted' | 'on-request' | 'never' {
    if (this.options.mode === 'manual') return 'untrusted'
    if (this.options.mode === 'smart') return 'on-request'
    return 'never'
  }

  private sandboxMode(): 'workspace-write' {
    return 'workspace-write'
  }
}

function buildConversationSession(options: WatchRunOptions): WatchConversationSession {
  const hook = getWatchHook(options.backend)

  if (hook.sessionKind === 'persistent-process') {
    return new CodexAppServerSession(options)
  }

  return new PerTurnCliSession(options, hook)
}

function printWatchHelp(): void {
  process.stdout.write('/help 查看帮助\n/exit 退出当前 watch 会话\n\n')
}

export async function runWatch(options: WatchRunOptions): Promise<number> {
  const requestedOptions = {
    ...options,
    runtime: requestedRuntime(options),
    credentialSource: requestedCredentialSource(options),
  }
  const session = buildConversationSession(requestedOptions)
  renderSessionHeader(session.record)
  printWatchHelp()

  let fatalError: Error | null = null

  try {
    let resolvedRun: ResolvedWatchRun

    try {
      resolvedRun = await resolveWatchRunOptions(requestedOptions)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendEntry(session.record, 'system', JSON.stringify({
        type: 'credentials.resolve',
        backend: requestedOptions.backend,
        requestedCredentialSource: requestedOptions.credentialSource,
        error: message,
      }), [])
      throw error
    }

    session.applyResolvedOptions(resolvedRun.options)
    appendEntry(session.record, 'system', JSON.stringify({
      type: 'credentials.resolve',
      backend: resolvedRun.options.backend,
      requestedCredentialSource: resolvedRun.options.credentialSource,
      resolvedCredentialSource: resolvedRun.options.resolvedCredentialSource,
    }), [])

    const authPreflight = resolvedRun.authPreflight
    if (authPreflight.state === 'unauthenticated') {
      const message = authPreflight.message ?? `${resolvedRun.options.backend} is not authenticated`
      appendEntry(session.record, 'system', JSON.stringify({
        type: 'auth.preflight',
        backend: resolvedRun.options.backend,
        state: authPreflight.state,
        resolvedCredentialSource: resolvedRun.options.resolvedCredentialSource,
      }), [
        { type: 'session.note', message, raw: { backend: resolvedRun.options.backend, state: authPreflight.state } },
      ])
      throw new Error(message)
    }

    await session.start()

    if (resolvedRun.options.prompt) {
      await session.sendTurn(resolvedRun.options.prompt)
    }

    while (true) {
      const input = (await watchRuntime.promptText('you> ')).trim()
      if (!input) {
        continue
      }

      if (input === '/exit' || input === '/quit') {
        break
      }

      if (input === '/help') {
        printWatchHelp()
        continue
      }

      await session.sendTurn(input)
    }
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error(String(error))
  } finally {
    await session.close()
    await (session as BaseSession).finalizeAndClose(fatalError ? 'failed' : 'completed', fatalError?.message)
  }

  if (fatalError) {
    throw fatalError
  }

  return 0
}

export function formatWatchSessionSummary(record: WatchSessionRecord): string {
  const prompt = record.prompt?.replace(/\s+/g, ' ').slice(0, 48)
  return [
    record.id,
    record.backend,
    record.runtime,
    record.mode,
    record.status,
    prompt,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ')
}

export function listArchivedWatchSessions(): WatchSessionRecord[] {
  return listWatchSessions()
}

export function loadArchivedWatchSession(id: string): WatchSessionRecord | null {
  return loadWatchSession(id)
}

export function listSupportedWatchBackends(): Array<{
  backend: string
  label: string
  description: string
  modes: Record<string, string>
}> {
  return listWatchHooks().map((hook) => ({
    backend: hook.id,
    label: hook.label,
    description: hook.description,
    modes: {
      manual: describeWatchMode('manual'),
      smart: describeWatchMode('smart'),
      auto: describeWatchMode('auto'),
    },
  }))
}
