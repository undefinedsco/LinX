import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  buildAcpPermissionResponse,
  buildWatchUserInputResponse,
  normalizeAcpInteractionRequest,
  normalizeAcpRequest,
  normalizeAcpSessionNotification,
  normalizeWatchCredentialSource,
  parseWatchJsonLine,
  resolveWatchAutoApprovalDecision,
  resolveWatchCredentialSourceResolution,
  shouldAttemptCloudCredentialProbe,
  type WatchAuthStatus,
  type WatchApprovalDecision,
  type WatchApprovalRequest,
  type WatchCloudCredentialProbe,
  type WatchUserInputQuestion,
} from '@linx/models/watch'
import {
  appendWatchEvent,
  createWatchSession,
  finishWatchSession,
  loadWatchEvents,
  loadWatchSession,
  listWatchSessions,
  writeWatchSession,
} from './archive.js'
import { detectWatchAuthFailure, preflightWatchAuth, type WatchAuthPreflightResult } from './auth.js'
import { createWatchDisplay, type WatchDisplay } from './display.js'
import { formatWatchSessionSummary } from './format.js'
import { describeWatchMode, getWatchHook, listWatchHooks } from './hooks/index.js'
import {
  createRemoteWatchApproval,
  isRemoteApprovalAbortError,
  resolveRemoteWatchApproval,
  waitForRemoteWatchApproval,
} from './pod-approval.js'
import { persistWatchConversationToPod } from './pod-persistence.js'
import { loadPodBackendCredential, podCredentialMissingMessage } from './pod-ai.js'
import { promptText } from '../prompt.js'
import type {
  WatchBackendHook,
  WatchCredentialSource,
  WatchEventLogEntry,
  WatchInputController,
  WatchNormalizedEvent,
  WatchPromptSubmission,
  WatchQueueState,
  WatchRuntime,
  WatchRunOptions,
  WatchSessionRecord,
  WatchSpawnPlan,
} from './types.js'

type OutputStream = 'stdout' | 'stderr' | 'system'

interface WatchConversationSession {
  readonly record: WatchSessionRecord
  start(): Promise<void>
  sendTurn(text: string): Promise<void>
  setModel(model: string): Promise<void>
  applyResolvedOptions(options: WatchRunOptions): void
  close(): Promise<void>
}

interface WatchTurnState {
  resolve: () => void
  reject: (error: Error) => void
  responseReceived: boolean
}

interface PendingRpcRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  method: string
}

interface ResolvedWatchRun {
  options: WatchRunOptions
  authPreflight: WatchAuthPreflightResult
}

export const watchRuntime = {
  promptText,
  preflightWatchAuth,
  loadPodBackendCredential,
  createRemoteWatchApproval,
  waitForRemoteWatchApproval,
  resolveRemoteWatchApproval,
  persistWatchConversationToPod,
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

function appendSessionNote(record: WatchSessionRecord, message: string, raw?: unknown): void {
  appendEntry(record, 'system', JSON.stringify({
    type: 'session.note',
    message,
  }), [{
    type: 'session.note',
    message,
    raw,
  }])
}

async function promptApproval(
  display: WatchDisplay,
  message: string,
  allowSessionOption = true,
  signal?: AbortSignal,
): Promise<WatchApprovalDecision> {
  while (true) {
    display.setPhase('approval', message)
    const answer = (await display.chooseOption(
      'Approval required',
      [`[approval] ${message}`],
      allowSessionOption
        ? [
          { label: 'Yes', value: 'y', shortcuts: ['y'] },
          { label: 'Session', value: 's', shortcuts: ['s'] },
          { label: 'No', value: 'n', shortcuts: ['n'] },
          { label: 'Cancel', value: 'c', shortcuts: ['c'] },
        ]
        : [
          { label: 'Yes', value: 'y', shortcuts: ['y'] },
          { label: 'No', value: 'n', shortcuts: ['n'] },
          { label: 'Cancel', value: 'c', shortcuts: ['c'] },
        ],
      signal,
    )).trim().toLowerCase()

    if (answer === 'y' || answer === 'yes') {
      display.setPhase('running', 'Continuing turn')
      return 'accept'
    }
    if (allowSessionOption && (answer === 's' || answer === 'session')) {
      display.setPhase('running', 'Continuing turn')
      return 'accept_for_session'
    }
    if (answer === 'n' || answer === 'no') {
      display.setPhase('running', 'Continuing turn')
      return 'decline'
    }
    if (answer === 'c' || answer === 'cancel') {
      display.setPhase('running', 'Continuing turn')
      return 'cancel'
    }
  }
}

async function promptAuthContinue(display: WatchDisplay, lines: string[]): Promise<boolean> {
  while (true) {
    display.setPhase('question', 'Authentication required')
    const answer = (await display.chooseOption(
      'Authentication required',
      lines,
      [
        { label: 'Continue', value: 'continue', shortcuts: ['c', 'y'] },
        { label: 'Cancel', value: 'cancel', shortcuts: ['n', 'x'] },
      ],
    )).trim().toLowerCase()

    if (answer === 'continue' || answer === 'c' || answer === 'y' || answer === 'yes') {
      display.setPhase('running', 'Continuing turn')
      return true
    }

    if (answer === 'cancel' || answer === 'n' || answer === 'x' || answer === 'no') {
      display.setPhase('running', 'Continuing turn')
      return false
    }
  }
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

  return request.message || 'Approval required'
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

function requestedApprovalSource(options: WatchRunOptions): 'local' | 'remote' | 'hybrid' {
  return options.approvalSource ?? 'hybrid'
}

function requestedRuntime(options: WatchRunOptions): WatchRuntime {
  return options.runtime ?? 'local'
}

function normalizeBackendCommandEnv(
  backend: WatchRunOptions['backend'],
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env) {
    return undefined
  }

  const next = { ...env }

  if (backend === 'codex' && next.OPENAI_API_KEY && !next.CODEX_API_KEY) {
    next.CODEX_API_KEY = next.OPENAI_API_KEY
  }

  return next
}

function mergeCommandEnv(
  backend: WatchRunOptions['backend'],
  commandEnv: Record<string, string> | undefined,
  planEnv: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const normalizedCommandEnv = normalizeBackendCommandEnv(backend, commandEnv)
  if (!normalizedCommandEnv && !planEnv) {
    return undefined
  }

  return {
    ...(normalizedCommandEnv ?? {}),
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
    approvalSource: requestedApprovalSource(options),
    command: plan.command,
    args: [...plan.args],
    transport: options.transport ?? 'acp',
  }
}

function withResolvedSource(
  options: WatchRunOptions,
  resolvedCredentialSource: 'local' | 'cloud',
  commandEnv?: Record<string, string>,
): WatchRunOptions {
  return {
    ...options,
    transport: options.transport ?? 'acp',
    credentialSource: requestedCredentialSource(options),
    approvalSource: requestedApprovalSource(options),
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
      commandEnv: normalizeBackendCommandEnv(backend, { ...podCredential.env }),
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
  readonly display: WatchDisplay
  protected child: ChildProcessWithoutNullStreams | null = null
  private activeExitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null
  private activeExitResolve: ((result: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null
  protected closed = false
  protected lastExit: { code: number | null; signal: NodeJS.Signals | null } | null = null

  constructor(record: WatchSessionRecord, prompt: typeof watchRuntime.promptText) {
    this.record = record
    this.display = createWatchDisplay(record, prompt)
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

  async finalizeAndClose(status: 'completed' | 'failed', error?: string): Promise<WatchSessionRecord> {
    const exitState = await this.waitForActiveExit()
    const next = finishWatchSession(this.record, {
      status,
      exitCode: exitState.code,
      signal: exitState.signal,
      error,
    })
    this.display.finish(status, next, error)
    return next
  }

  protected recordParsedLine(stream: OutputStream, line: string, events: WatchNormalizedEvent[]): void {
    appendEntry(this.record, stream, line, events)

    if (events.length > 0) {
      this.display.renderEvents(events)
      return
    }

    this.display.renderRawLine(stream, line)
  }

  protected updateRecord(updates: Partial<WatchSessionRecord>): void {
    Object.assign(this.record, updates)
    writeWatchSession(this.record)
    this.display.updateRecord(this.record)
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
  abstract setModel(model: string): Promise<void>
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

class AcpSession extends BaseSession {
  private readonly hook: WatchBackendHook
  private options: WatchRunOptions
  private requestId = 1
  private readonly pendingRequests = new Map<number, PendingRpcRequest>()
  private turnState: WatchTurnState | null = null
  private sessionId: string | null = null
  private authFailureMessage: string | null = null
  private turnSettleTimer: NodeJS.Timeout | null = null
  private activeAgentRequests = 0

  constructor(options: WatchRunOptions, hook: WatchBackendHook) {
    const plan = hook.buildSpawnPlan(options)
    super(createWatchSession({ ...options, transport: options.transport ?? 'acp' }, plan), watchRuntime.promptText)
    this.hook = hook
    this.options = options
  }

  async start(): Promise<void> {
    const plan = this.hook.buildSpawnPlan(this.options)
    const child = this.spawnProcess(
      plan.command,
      plan.args,
      this.record.cwd,
      mergeCommandEnv(this.options.backend, this.options.commandEnv, plan.env),
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
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: {
        name: 'linx-cli',
        version: '0.1.0',
      },
    })

    const newSession = await this.sendRequest('session/new', {
      cwd: this.options.cwd,
    }) as Record<string, unknown>

    const sessionId = typeof newSession.sessionId === 'string'
      ? newSession.sessionId
      : typeof (newSession.session as Record<string, unknown> | undefined)?.id === 'string'
        ? ((newSession.session as Record<string, unknown>).id as string)
        : null

    if (!sessionId) {
      throw new Error(`ACP backend ${this.options.backend} did not return a session id`)
    }

    this.sessionId = sessionId
    this.updateRecord({
      backendSessionId: sessionId,
      error: undefined,
    })

    if (this.options.model) {
      await this.trySetModel(this.options.model)
    }
  }

  applyResolvedOptions(options: WatchRunOptions): void {
    this.options = options
    const plan = this.hook.buildSpawnPlan(options)
    this.updateRecord(syncRecordFromOptions(this.record, options, plan))
  }

  async setModel(model: string): Promise<void> {
    const normalized = model.trim()
    if (!normalized) {
      throw new Error('Model id cannot be empty')
    }

    this.options = {
      ...this.options,
      model: normalized,
    }
    this.updateRecord({
      model: normalized,
    })
    await this.trySetModel(normalized)
  }

  async sendTurn(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('ACP session is not initialized')
    }
    if (this.turnState) {
      throw new Error('A watch turn is already in progress')
    }

    appendUserTurn(this.record, text)
    appendTurnStart(this.record, this.record.command, this.record.args)
    this.authFailureMessage = null

    const completion = new Promise<void>((resolve, reject) => {
      this.turnState = {
        resolve,
        reject,
        responseReceived: false,
      }
    })
    void completion.catch(() => {})

    try {
      const response = await this.sendRequest('session/prompt', {
        sessionId: this.sessionId,
        prompt: [{ type: 'text', text }],
      }) as Record<string, unknown>

      const turnState = this.turnState as WatchTurnState | null
      if (turnState === null) {
        return
      }

      ;(turnState as WatchTurnState).responseReceived = true
      this.recordParsedLine('system', JSON.stringify({
        type: 'turn.stop',
        stopReason: typeof response.stopReason === 'string' ? response.stopReason : undefined,
      }), [{
        type: 'assistant.done',
        raw: {
          stopReason: typeof response.stopReason === 'string' ? response.stopReason : undefined,
        },
      }])
      this.scheduleTurnSettle()
    } catch (error) {
      this.turnState = null
      this.clearTurnSettleTimer()
      throw error
    }

    await completion
  }

  protected onProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.clearTurnSettleTimer()
    const errorMessage = this.authFailureMessage ?? `ACP backend exited (${code ?? signal ?? 'null'})`
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(errorMessage))
    }
    this.pendingRequests.clear()

    if (this.turnState) {
      const reject = this.turnState.reject
      this.turnState = null
      reject(new Error(this.authFailureMessage ?? `ACP backend exited during turn (${code ?? signal ?? 'null'})`))
    }
  }

  protected onProcessFailure(error: Error): void {
    this.clearTurnSettleTimer()
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

  private clearTurnSettleTimer(): void {
    if (!this.turnSettleTimer) {
      return
    }

    clearTimeout(this.turnSettleTimer)
    this.turnSettleTimer = null
  }

  private scheduleTurnSettle(): void {
    if (!this.turnState || !this.turnState.responseReceived || this.activeAgentRequests > 0) {
      return
    }

    this.clearTurnSettleTimer()
    this.turnSettleTimer = setTimeout(() => {
      if (!this.turnState || !this.turnState.responseReceived || this.activeAgentRequests > 0) {
        return
      }

      const turnState = this.turnState
      this.turnState = null
      this.turnSettleTimer = null

      if (this.authFailureMessage) {
        turnState.reject(new Error(this.authFailureMessage))
        return
      }

      turnState.resolve()
    }, 75)
  }

  private markTurnActivity(): void {
    if (!this.turnState?.responseReceived) {
      return
    }

    this.scheduleTurnSettle()
  }

  private handleLine(line: string, stream: OutputStream): void {
    const authFailure = detectWatchAuthFailure(this.record.backend, line)
    if (authFailure) {
      this.authFailureMessage = authFailure.message
    }

    if (stream === 'stderr') {
      this.recordParsedLine(stream, line, [])
      this.markTurnActivity()
      return
    }

    const message = parseWatchJsonLine(line)
    if (!message) {
      this.recordParsedLine(stream, line, [])
      this.markTurnActivity()
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'undefined') {
      const method = message.method
      const params = (typeof message.params === 'object' && message.params !== null ? message.params : {}) as Record<string, unknown>
      const events = method === 'auth/request'
        ? [{
          type: 'session.note' as const,
          message: [
            typeof params.message === 'string' ? params.message : 'Authentication required',
            typeof params.url === 'string' ? `Open ${params.url}` : '',
          ].filter(Boolean).join(' · '),
          raw: message,
        }]
        : normalizeAcpRequest(message)
      this.recordParsedLine(stream, line, events)
      void this.handleAgentRequest(message)
      this.markTurnActivity()
      return
    }

    if (typeof message.method === 'string') {
      const events = normalizeAcpSessionNotification(message)
      this.recordParsedLine(stream, line, events)
      this.markTurnActivity()
      return
    }

    if (typeof message.id !== 'undefined') {
      appendEntry(this.record, stream, line, [])
      this.handleResponse(message)
      this.markTurnActivity()
      return
    }

    this.recordParsedLine(stream, line, [])
    this.markTurnActivity()
  }

  private handleResponse(message: Record<string, unknown>): void {
    const id = typeof message.id === 'number' ? message.id : Number(message.id)
    const pending = this.pendingRequests.get(id)
    if (!pending) {
      return
    }

    this.pendingRequests.delete(id)

    if ('error' in message && message.error) {
      const authFailure = detectWatchAuthFailure(this.record.backend, JSON.stringify(message))
      if (authFailure) {
        this.authFailureMessage = authFailure.message
        pending.reject(new Error(authFailure.message))
        return
      }

      const error = message.error as Record<string, unknown>
      const detail = typeof error.message === 'string'
        ? error.message
        : JSON.stringify(error)
      pending.reject(new Error(detail))
      return
    }

    pending.resolve(message.result)
  }

  private async handleAgentRequest(message: Record<string, unknown>): Promise<void> {
    const id = typeof message.id === 'number' ? message.id : Number(message.id)
    const method = typeof message.method === 'string' ? message.method : ''
    const params = (typeof message.params === 'object' && message.params !== null ? message.params : {}) as Record<string, unknown>

    this.activeAgentRequests += 1
    this.clearTurnSettleTimer()

    try {
      if (method === 'auth/request') {
        const lines = [
          `[note] ${typeof params.message === 'string' ? params.message : 'Authentication required'}`,
          ...(typeof params.url === 'string' ? [`[note] ${params.url}`] : []),
        ]
        const shouldContinue = await promptAuthContinue(this.display, lines)
        if (!shouldContinue) {
          this.authFailureMessage = 'Authentication request cancelled by user'
        }
        this.sendResponse(id, {})
        return
      }

      const interaction = normalizeAcpInteractionRequest(message)
      if (!interaction) {
        this.sendError(id, -32601, `Unsupported ACP client request: ${method}`)
        return
      }

      if (interaction.kind === 'user-input') {
        const result = await this.resolveToolUserInput(interaction.questions)
        this.sendResponse(id, result)
        return
      }

      const autoDecision = resolveWatchAutoApprovalDecision({
        mode: this.options.mode,
        request: interaction,
      })
      const decision = autoDecision ?? await this.resolveApproval(interaction)
      this.sendResponse(id, buildAcpPermissionResponse(interaction, decision))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      this.sendError(id, -32000, messageText)
    } finally {
      this.activeAgentRequests = Math.max(0, this.activeAgentRequests - 1)
      this.scheduleTurnSettle()
    }
  }

  private async resolveToolUserInput(questions: WatchUserInputQuestion[]): Promise<unknown> {
    this.display.setPhase('question', questions[0]?.header ?? 'Input required')
    const answers = await this.display.chooseQuestions(questions)
    this.display.setPhase('running', 'Continuing turn')
    return buildWatchUserInputResponse(answers)
  }

  private async resolveApproval(interaction: WatchApprovalRequest): Promise<WatchApprovalDecision> {
    const source = this.options.approvalSource ?? 'hybrid'
    if (source === 'local') {
      return promptApproval(this.display, approvalPromptMessage(interaction), true)
    }

    if (source === 'remote') {
      return this.resolveRemoteOnlyApproval(interaction)
    }

    return this.resolveHybridApproval(interaction)
  }

  private async resolveRemoteOnlyApproval(interaction: WatchApprovalRequest): Promise<WatchApprovalDecision> {
    const promptMessage = approvalPromptMessage(interaction)
    appendSessionNote(this.record, `Waiting for remote approval | ${promptMessage}`)
    this.display.setPhase('approval', `${promptMessage} · remote`)

    const remote = await watchRuntime.createRemoteWatchApproval({
      record: this.record,
      request: interaction,
    })
    const decision = await watchRuntime.waitForRemoteWatchApproval({
      approvalId: remote.id,
    })

    appendSessionNote(this.record, `Remote approval resolved | ${decision}`)
    this.display.setPhase('running', 'Continuing turn')
    return decision
  }

  private async resolveHybridApproval(interaction: WatchApprovalRequest): Promise<WatchApprovalDecision> {
    const promptMessage = approvalPromptMessage(interaction)

    let remoteApproval: { id: string } | null = null
    try {
      remoteApproval = await watchRuntime.createRemoteWatchApproval({
        record: this.record,
        request: interaction,
      })
      appendSessionNote(this.record, `Remote approval opened | ${remoteApproval.id}`)
    } catch (error) {
      appendSessionNote(
        this.record,
        `Remote approval unavailable | ${error instanceof Error ? error.message : String(error)}`,
      )
      return promptApproval(this.display, promptMessage, true)
    }

    const localAbort = new AbortController()
    const remoteAbort = new AbortController()
    const localDecisionPromise = promptApproval(this.display, promptMessage, true, localAbort.signal)
      .then((decision) => ({ source: 'local' as const, decision }))
    const remoteDecisionPromise = watchRuntime.waitForRemoteWatchApproval({
      approvalId: remoteApproval.id,
      signal: remoteAbort.signal,
    }).then((decision) => ({ source: 'remote' as const, decision }))

    void localDecisionPromise.catch(() => undefined)
    void remoteDecisionPromise.catch(() => undefined)

    try {
      const winner = await Promise.race([localDecisionPromise, remoteDecisionPromise])

      if (winner.source === 'local') {
        remoteAbort.abort()
        appendSessionNote(this.record, `Local approval resolved | ${winner.decision}`)
        void watchRuntime.resolveRemoteWatchApproval({
          approvalId: remoteApproval.id,
          decision: winner.decision,
          note: 'resolved from active local watch session',
        }).catch(() => undefined)
        this.display.setPhase('running', 'Continuing turn')
        return winner.decision
      }

      localAbort.abort()
      appendSessionNote(this.record, `Remote approval resolved | ${winner.decision}`)
      this.display.setPhase('running', 'Continuing turn')
      return winner.decision
    } catch (error) {
      if (isRemoteApprovalAbortError(error)) {
        throw error
      }

      remoteAbort.abort()
      localAbort.abort()
      throw error
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.requestId++
    const child = this.child
    if (!child) {
      throw new Error('ACP backend is not started')
    }

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, method })
    })
  }

  private sendResponse(id: number, result: unknown): void {
    const child = this.child
    if (!child) {
      throw new Error('ACP backend is not started')
    }

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
  }

  private sendError(id: number, code: number, message: string): void {
    const child = this.child
    if (!child) {
      throw new Error('ACP backend is not started')
    }

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
  }

  private async trySetModel(model: string): Promise<void> {
    if (!this.sessionId) {
      return
    }

    try {
      await this.sendRequest('session/set_model', {
        sessionId: this.sessionId,
        modelId: model,
      })
    } catch (error) {
      appendEntry(this.record, 'system', JSON.stringify({
        type: 'session.set_model.skipped',
        model,
        reason: error instanceof Error ? error.message : String(error),
      }), [])
    }
  }
}

function buildConversationSession(options: WatchRunOptions): BaseSession {
  const hook = getWatchHook(options.backend)
  return new AcpSession(options, hook)
}

async function handleWatchShellCommand(args: {
  input: string
  session: WatchConversationSession
  display: WatchDisplay
  queueState: WatchQueueState
  backend: string
  record: WatchSessionRecord
}): Promise<'handled' | 'exit' | 'pass'> {
  const { input, session, display, queueState, backend, record } = args

  if (input === '/exit' || input === '/quit') {
    return 'exit'
  }

  if (input === '/help') {
    display.showHelp()
    return 'handled'
  }

  if (input === '/session') {
    appendSessionNote(record, [
      `session=${record.id}`,
      `backend=${record.backend}`,
      `runtime=${record.runtime}`,
      `source=${record.resolvedCredentialSource ?? record.credentialSource}`,
      `model=${record.model ?? 'default'}`,
      `cwd=${record.cwd}`,
    ].join(' | '))
    return 'handled'
  }

  if (input === '/queue') {
    appendSessionNote(record, `queue | steer=${queueState.steeringCount} | follow-up=${queueState.followUpCount}`)
    return 'handled'
  }

  if (input === '/sessions') {
    const summaries = listWatchSessions().slice(0, 5).map(formatWatchSessionSummary)
    if (summaries.length === 0) {
      appendSessionNote(record, 'No archived watch sessions found')
      return 'handled'
    }

    for (const summary of summaries) {
      appendSessionNote(record, summary)
    }
    return 'handled'
  }

  if (input === '/new') {
    appendSessionNote(record, 'Use `linx watch run` to start a fresh watch session')
    return 'handled'
  }

  if (input.startsWith('/model ')) {
    const model = input.slice('/model '.length).trim()
    if (!model) {
      throw new Error('Usage: /model <modelId>')
    }

    await session.setModel(model)
    appendSessionNote(record, `Model set to ${model}`, { backend, model })
    return 'handled'
  }

  return 'pass'
}

export async function runWatch(options: WatchRunOptions): Promise<number> {
  const requestedOptions = {
    ...options,
    runtime: requestedRuntime(options),
    transport: 'acp' as const,
    credentialSource: requestedCredentialSource(options),
    approvalSource: requestedApprovalSource(options),
  }
  const session = buildConversationSession(requestedOptions)
  session.display.start()
  session.display.showHelp()
  session.display.setPhase('starting', `Preparing ${requestedOptions.backend}`)
  session.display.updateQueue({
    steeringCount: 0,
    followUpCount: 0,
  })

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
    const steeringQueue: WatchPromptSubmission[] = []
    const followUpQueue: WatchPromptSubmission[] = []
    let stopRequested = false
    let activeTurn: Promise<void> | null = null
    let wakeResolver: (() => void) | null = null

    const resolveWake = () => {
      if (!wakeResolver) {
        return
      }

      const resolve = wakeResolver
      wakeResolver = null
      resolve()
    }

    const waitForWake = async (): Promise<void> => {
      if (fatalError || (stopRequested && activeTurn === null)) {
        return
      }

      await new Promise<void>((resolve) => {
        wakeResolver = resolve
      })
    }

    const updateQueueState = () => {
      session.display.updateQueue({
        steeringCount: steeringQueue.length,
        followUpCount: followUpQueue.length,
      })
    }

    const clearQueuedSubmissions = () => {
      if (steeringQueue.length === 0 && followUpQueue.length === 0) {
        return
      }

      steeringQueue.length = 0
      followUpQueue.length = 0
      updateQueueState()
    }

    const restoreQueuedSubmission = (): WatchPromptSubmission | null => {
      const restored = steeringQueue.pop() ?? followUpQueue.pop() ?? null
      updateQueueState()
      return restored
    }

    const inputController: WatchInputController = {
      restoreQueuedSubmission,
    }
    session.display.bindInputController(inputController)

    const enqueueSubmission = (submission: WatchPromptSubmission) => {
      if (submission.mode === 'follow-up') {
        followUpQueue.push(submission)
      } else {
        steeringQueue.push(submission)
      }

      updateQueueState()
      appendSessionNote(
        session.record,
        submission.mode === 'follow-up'
          ? `Queued follow-up message (${followUpQueue.length} total)`
          : `Queued steering message (${steeringQueue.length} total)`,
        { text: submission.text, mode: submission.mode },
      )
      resolveWake()
    }

    const dequeueSubmission = (): WatchPromptSubmission | null => {
      const next = steeringQueue.shift() ?? followUpQueue.shift() ?? null
      updateQueueState()
      return next
    }

    const runTurn = (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }

      session.display.showUserTurn(trimmed)
      session.display.setPhase('running', `Running ${resolvedRun.options.backend}`)

      activeTurn = session.sendTurn(trimmed)
        .catch((error) => {
          fatalError = error instanceof Error ? error : new Error(String(error))
        })
        .finally(() => {
          activeTurn = null

          if (fatalError) {
            stopRequested = true
            clearQueuedSubmissions()
            resolveWake()
            return
          }

          const next = dequeueSubmission()
          if (next) {
            runTurn(next.text)
            return
          }

          if (stopRequested) {
            resolveWake()
            return
          }

          session.display.setPhase('ready', 'Waiting for input')
          resolveWake()
        })
    }

    const dispatchSubmission = async (submission: WatchPromptSubmission): Promise<void> => {
      const trimmed = submission.text.trim()
      if (!trimmed) {
        return
      }

      const shellCommand = await handleWatchShellCommand({
        input: trimmed,
        session,
        display: session.display,
        queueState: {
          steeringCount: steeringQueue.length,
          followUpCount: followUpQueue.length,
        },
        backend: resolvedRun.options.backend,
        record: session.record,
      })

      if (shellCommand === 'handled') {
        session.display.setPhase(activeTurn ? 'running' : 'ready', activeTurn ? `Running ${resolvedRun.options.backend}` : 'Waiting for input')
        resolveWake()
        return
      }

      if (shellCommand === 'exit') {
        stopRequested = true
        resolveWake()
        return
      }

      if (activeTurn) {
        enqueueSubmission({
          text: trimmed,
          mode: submission.mode,
        })
        return
      }

      runTurn(trimmed)
    }

    const inputLoop = (async () => {
      session.display.setPhase('ready', 'Waiting for input')
      while (!fatalError && !stopRequested) {
        const submission = await session.display.promptInput('you> ')
        await dispatchSubmission(submission)
      }
    })().catch((error) => {
      fatalError = error instanceof Error ? error : new Error(String(error))
      stopRequested = true
      clearQueuedSubmissions()
      resolveWake()
    })

    if (resolvedRun.options.prompt) {
      await dispatchSubmission({
        text: resolvedRun.options.prompt,
        mode: 'send',
      })
    }

    while (!fatalError && (!stopRequested || activeTurn !== null || steeringQueue.length > 0 || followUpQueue.length > 0)) {
      await waitForWake()
    }

    void inputLoop
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error(String(error))
  } finally {
    await session.close()
    const finalRecord = await session.finalizeAndClose(fatalError ? 'failed' : 'completed', fatalError?.message)
    await watchRuntime.persistWatchConversationToPod(finalRecord).catch(() => undefined)
  }

  if (fatalError) {
    throw fatalError
  }

  return 0
}

export function listArchivedWatchSessions(): WatchSessionRecord[] {
  return listWatchSessions()
}

export function loadArchivedWatchSession(id: string): WatchSessionRecord | null {
  return loadWatchSession(id)
}

export function loadArchivedWatchEvents(id: string): WatchEventLogEntry[] {
  return loadWatchEvents(id)
}

export { formatWatchSessionSummary }

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
