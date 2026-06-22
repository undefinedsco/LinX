import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  buildAcpPermissionResponse,
  buildAutoModeUserInputResponse,
  normalizeAcpInteractionRequest,
  normalizeAcpRequest,
  normalizeAcpSessionNotification,
  parseAutoModeJsonLine,
  autoModeApprovalDecisionLabel,
  autoModeUserInputAnswersSummary,
  resolveAutoModeCommandRoute,
  shouldMaterializeAutoModeGrant,
  type AutoModeControlCommandRoute,
  type AutoModePeerCommandRoute,
  type AutoModeApprovalDecision,
  type AutoModeApprovalRequest,
  type AutoModeInteractionRequest,
  type AutoModeSecretaryApprovalRecommendation,
  type AutoModeSecretaryRecommendation,
  type AutoModeSecretaryUserInputRecommendation,
  type AutoModeUserInputAnswers,
  type AutoModeUserInputRequest,
  type AutoModeUserInputQuestion,
} from '@linx/agent-runtime/auto-mode'
import {
  adoptAutoModeSessionId,
  appendAutoModeEvent,
  createAutoModeSession,
  finishAutoModeSession,
  hasPendingAutoModeSync,
  loadAutoModeEvents,
  loadAutoModeSession,
  listAutoModeSessionsWithPendingSync,
  listAutoModeSessions,
  writeAutoModeSyncCheckpoint,
  writeAutoModeSession,
} from './archive.js'
import { detectAutoModeAuthFailure, preflightAutoModeAuth, type AutoModeAuthPreflightResult } from './auth.js'
import { createAutoModeDisplay, type AutoModeDisplay } from './display.js'
import { formatAutoModeSessionSummary } from './format.js'
import { describeAutoControl, getAutoModeHook, linxNativeBackend, listAutoModeHooks } from './hooks/registry.js'
import {
  createRemoteAutoModeApproval,
  isRemoteApprovalAbortError,
  materializeRemoteAutoModeGrant,
  resolveExistingRemoteAutoModeGrant,
  resolveRemoteAutoModeApproval,
  waitForRemoteAutoModeApproval,
} from './pod-approval.js'
import { persistAutoModeConversationToPod } from './pod-persistence.js'
import { loadPodBackendCredential, podCredentialMissingMessage } from './pod-ai.js'
import { resolveAutoModeSecretaryRecommendation } from './secretary.js'
import { resolveSecretaryReactionWindowMs } from './secretary-reaction-window.js'
import { promptText } from '../prompt.js'
import { runLinxLoginCommand, runLinxLogoutCommand } from '../login-command.js'
import { clearDefaultPodDataSession, createPodDataSession, type PodDataSession } from '../pod-data-session.js'
import { parseSolidClientCredentials, persistSolidClientCredentialsLogin } from '../solid-client-credentials-login.js'
import { connectAiProviderCredential } from '../ai-command.js'
import { saveAccountSession } from '../account-session.js'
import { clearCredentials, loadCredentials, saveCredentials } from '../credentials-store.js'
import { resolveAccountBaseUrl } from '../account-api.js'
import { createRemoteCompletionResult, type RemoteCompletionResult } from '../chat-api.js'
import { resolveRuntimeTarget } from '../runtime-target.js'
import { runThreadReconcilerCycle, type AgentRuntimeCapabilities, type ThreadControlEvent } from '@linx/agent-runtime'
import { createLinxSyncCheckpoint, type LinxSyncRunResult } from '@linx/agent-runtime/sync'
import type {
  AutoModeBackendHook,
  AutoModeEventLogEntry,
  AutoModeInputController,
  AutoModeNormalizedEvent,
  AutoModePromptSubmission,
  AutoModeQueueState,
  AutoModeRuntime,
  AutoRunOptions,
  AutoModeSessionRecord,
  AutoModeSpawnPlan,
  AutoModeWorkerBackend,
} from './types.js'

type OutputStream = 'stdout' | 'stderr' | 'system'

interface AutoModeConversationSession {
  readonly record: AutoModeSessionRecord
  start(): Promise<void>
  sendTurn(text: string): Promise<void>
  setModel(model: string): Promise<void>
  applyResolvedOptions(options: AutoRunOptions): void
  abort(): Promise<void>
  close(): Promise<void>
}

interface AutoModeTurnState {
  resolve: () => void
  reject: (error: Error) => void
  responseReceived: boolean
}

interface PendingRpcRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  method: string
}

interface ResolvedAutoModeRun {
  options: AutoRunOptions
  authPreflight: AutoModeAuthPreflightResult
}

const AUTO_MODE_SECRETARY_COUNTDOWN_BAR_WIDTH = 10
const AUTO_MODE_SECRETARY_COUNTDOWN_TICK_MS = 250
const POD_PERSISTENCE_TIMEOUT_MS = 5_000

export const autoModeRuntime = {
  promptText,
  preflightAutoModeAuth,
  loadPodBackendCredential,
  connectAiProviderCredential,
  createRemoteAutoModeApproval,
  resolveExistingRemoteAutoModeGrant,
  waitForRemoteAutoModeApproval,
  resolveRemoteAutoModeApproval,
  materializeRemoteAutoModeGrant,
  persistAutoModeConversationToPod,
  resolveAutoModeSecretaryRecommendation,
  createPodDataSession,
  clearDefaultPodDataSession,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  saveAccountSession,
  resolveAccountBaseUrl,
  persistSolidClientCredentialsLogin,
  createRemoteCompletionResult,
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

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.()
      reject(new Error(message))
    }, ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function createAbortError(message = 'The operation was aborted.'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }

  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  throw createAbortError(typeof reason === 'string' && reason.trim() ? reason : undefined)
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  throwIfAborted(signal)

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error
      ? signal.reason
      : createAbortError(typeof signal.reason === 'string' && signal.reason.trim() ? signal.reason : undefined))
    signal.addEventListener('abort', onAbort, { once: true })
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function appendEntry(record: AutoModeSessionRecord, stream: AutoModeEventLogEntry['stream'], line: string, events: AutoModeNormalizedEvent[]): void {
  const entry: AutoModeEventLogEntry = {
    timestamp: new Date().toISOString(),
    stream,
    line,
    events,
  }
  appendAutoModeEvent(record, entry)
}

function appendSessionNote(record: AutoModeSessionRecord, message: string, raw?: unknown): void {
  appendEntry(record, 'system', JSON.stringify({
    type: 'session.note',
    message,
  }), [{
    type: 'session.note',
    message,
    raw,
  }])
}

function writeFailedPodSyncCheckpoint(record: AutoModeSessionRecord, message: string): void {
  const now = new Date().toISOString()
  const result: LinxSyncRunResult = {
    source: 'auto-mode-archive',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'projection',
    authority: 'core',
    attempted: 0,
    applied: 0,
    skipped: 0,
    failed: 1,
    failures: [{
      operationId: 'auto-mode.persist-to-pod',
      message,
      failedAt: now,
    }],
    startedAt: now,
    completedAt: now,
    status: 'failed',
  }
  writeAutoModeSyncCheckpoint(record, createLinxSyncCheckpoint('auto-mode-archive:pod:projection', result, {
    sessionId: record.id,
    backend: record.backend,
  }))
}

function appendAndDisplaySessionNote(
  record: AutoModeSessionRecord,
  display: AutoModeDisplay,
  message: string,
  tone: 'note' | 'success' | 'error' = 'note',
  raw?: unknown,
): void {
  appendSessionNote(record, message, raw)
  display.showActivity(message, tone)
}

async function promptApproval(
  display: AutoModeDisplay,
  message: string,
  allowSessionOption = true,
  signal?: AbortSignal,
  recommendation?: AutoModeSecretaryApprovalRecommendation | null,
): Promise<AutoModeApprovalDecision> {
  while (true) {
    display.setPhase('approval', message)
    const answer = (await display.chooseOption(
      'Approval required',
      approvalPromptLines(message, recommendation),
      approvalPromptOptions(allowSessionOption, recommendation?.decision),
      signal,
    )).trim().toLowerCase()

    if (answer === 'accept' || answer === 'y' || answer === 'yes') {
      display.setPhase('running', 'Continuing turn')
      return 'accept'
    }
    if (allowSessionOption && (answer === 'accept_for_session' || answer === 'g' || answer === 'grant' || answer === 's' || answer === 'session')) {
      display.setPhase('running', 'Continuing turn')
      return 'accept_for_session'
    }
    if (answer === 'decline' || answer === 'n' || answer === 'no') {
      display.setPhase('running', 'Continuing turn')
      return 'decline'
    }
    if (answer === 'cancel' || answer === 'c') {
      display.setPhase('running', 'Continuing turn')
      return 'cancel'
    }
  }
}

function approvalPromptLines(message: string, recommendation?: AutoModeSecretaryApprovalRecommendation | null): string[] {
  const lines = [`[approval] ${message}`]
  if (recommendation?.decision) {
    const label = autoModeApprovalDecisionLabel(recommendation.decision)
    const confidence = typeof recommendation.confidence === 'number'
      ? ` · confidence ${Math.round(recommendation.confidence * 100)}%`
      : ''
    lines.push(`[secretary] recommends ${label}${confidence}`)
  }
  if (recommendation?.reason) {
    lines.push(`[secretary] ${recommendation.reason}`)
  }
  if (recommendation?.canAutoDecide && recommendation.decision && (recommendation.reactionWindowMs ?? 0) > 0) {
    lines.push(`[secretary] auto-selects ${autoModeApprovalDecisionLabel(recommendation.decision)} after ${formatReactionWindow(recommendation.reactionWindowMs)}`)
  }
  return lines
}

function approvalPromptOptions(
  allowSessionOption: boolean,
  recommendedDecision?: AutoModeApprovalDecision,
): Array<{ label: string; value: string; description?: string; shortcuts?: string[] }> {
  const option = (decision: AutoModeApprovalDecision, label: string, description: string, shortcuts: string[]) => ({
    label: recommendedDecision === decision ? `${label} (recommended)` : label,
    value: decision,
    description,
    shortcuts,
  })

  const options = [
    option('accept', 'Allow once', 'approve this request only', ['y', '1']),
  ]
  if (allowSessionOption) {
    options.push(option('accept_for_session', 'Grant', 'allow similar requests for this session', ['g', 's', '2']))
  }
  options.push(
    option('decline', 'Deny', 'reject this request', ['n', allowSessionOption ? '3' : '2']),
    option('cancel', 'Cancel', 'abort the current request', ['c', allowSessionOption ? '4' : '3']),
  )
  return options
}

async function promptApprovalWithRecommendation(
  display: AutoModeDisplay,
  message: string,
  recommendation?: AutoModeSecretaryApprovalRecommendation | null,
  signal?: AbortSignal,
  onAuto?: () => void,
): Promise<AutoModeApprovalDecision> {
  if (!recommendation?.canAutoDecide || !recommendation.decision) {
    return promptApproval(display, message, true, signal, recommendation)
  }

  const reactionWindowMs = resolveSecretaryReactionWindowMs(recommendation)
  const displayRecommendation = {
    ...recommendation,
    reactionWindowMs,
  }

  return promptWithAutoDefault({
    fallback: (activeSignal) => promptApproval(display, message, true, activeSignal, displayRecommendation),
    defaultValue: recommendation.decision,
    reactionWindowMs,
    signal,
    onProgress: reactionWindowMs > 0
      ? (detail) => display.setPhase('approval', detail)
      : undefined,
    onAuto: () => {
      onAuto?.()
      display.showActivity(
        `AI secretary selected ${autoModeApprovalDecisionLabel(recommendation.decision!)} | ${recommendation.reason ?? 'auto decision'}`,
        'success',
      )
    },
  })
}

async function promptWithAutoDefault<T>(options: {
  fallback: (signal?: AbortSignal) => Promise<T>
  defaultValue: T
  reactionWindowMs: number
  signal?: AbortSignal
  onAuto?: () => void
  onProgress?: (detail: string) => void
}): Promise<T> {
  if (options.reactionWindowMs <= 0) {
    options.onAuto?.()
    return options.defaultValue
  }

  const controller = new AbortController()
  const activeSignal = options.signal
    ? (typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal)
    : controller.signal
  const startedAt = Date.now()
  const promptPromise = options.fallback(activeSignal)
    .then((value) => ({ type: 'user' as const, value }))
  const autoPromise = delay(options.reactionWindowMs)
    .then(() => ({ type: 'auto' as const, value: options.defaultValue }))
  const progressTimer = options.onProgress
    ? setInterval(() => {
      const remainingMs = Math.max(0, options.reactionWindowMs - Math.max(0, Date.now() - startedAt))
      options.onProgress?.(formatAutoModeSecretaryCountdownDetail(remainingMs, options.reactionWindowMs))
    }, AUTO_MODE_SECRETARY_COUNTDOWN_TICK_MS)
    : null

  if (options.onProgress) {
    options.onProgress(formatAutoModeSecretaryCountdownDetail(options.reactionWindowMs, options.reactionWindowMs))
  }

  void promptPromise.catch(() => undefined)
  try {
    const winner = await Promise.race([promptPromise, autoPromise])
    if (winner.type === 'auto') {
      controller.abort()
      options.onAuto?.()
    }
    return winner.value
  } finally {
    if (progressTimer) {
      clearInterval(progressTimer)
    }
  }
}

function formatReactionWindow(ms: number | undefined): string {
  const seconds = Math.max(0, Math.ceil((ms ?? 0) / 1000))
  return `${seconds}s`
}

export function formatAutoModeSecretaryCountdownDetail(remainingMs: number, durationMs: number): string {
  const totalMs = Math.max(1, durationMs)
  const clampedRemainingMs = Math.max(0, Math.min(totalMs, remainingMs))
  const filled = Math.max(
    0,
    Math.min(
      AUTO_MODE_SECRETARY_COUNTDOWN_BAR_WIDTH,
      Math.ceil((clampedRemainingMs / totalMs) * AUTO_MODE_SECRETARY_COUNTDOWN_BAR_WIDTH),
    ),
  )
  const bar = `${'#'.repeat(filled)}${'-'.repeat(AUTO_MODE_SECRETARY_COUNTDOWN_BAR_WIDTH - filled)}`
  return `auto [${bar}] ${formatReactionWindow(clampedRemainingMs)}`
}

async function promptLinxCloudAuth(display: AutoModeDisplay, lines: string[], reason: 'startup' | 'expired' | 'manual' = 'manual'): Promise<'retry' | 'cancel'> {
  while (true) {
    display.setPhase('question', reason === 'expired' ? 'LinX Cloud login expired' : 'LinX Cloud login required')
    const answer = (await display.chooseOption(
      reason === 'expired' ? 'LinX Cloud login expired' : 'LinX Cloud login required',
      lines,
      [
        { label: 'Authorize in browser', value: 'browser', description: 'refresh the LinX Cloud Solid session', shortcuts: ['b', '1'] },
        { label: 'Enter Solid client credentials', value: 'client-credentials', description: 'use LinX Cloud client credentials', shortcuts: ['k', '2'] },
        { label: 'Exit', value: 'exit', description: 'leave this session', shortcuts: ['x', '3'] },
      ],
    )).trim().toLowerCase()

    if (answer === 'browser' || answer === 'b' || answer === '1') {
      await runBackendLinxLogin(display)
      return 'retry'
    }

    if (answer === 'client-credentials' || answer === 'k' || answer === '2') {
      const saved = await promptBackendSolidClientCredentials(display)
      if (saved) {
        return 'retry'
      }
      continue
    }

    if (answer === 'exit' || answer === 'x' || answer === '3' || answer === 'cancel') {
      display.setPhase('running', 'Authentication cancelled')
      return 'cancel'
    }
  }
}

async function runBackendLinxLogin(display: AutoModeDisplay): Promise<void> {
  display.showActivity('Opening LinX Cloud login in your browser...')
  await runLinxLoginCommand({}, {
    promptText: autoModeRuntime.promptText,
    write(chunk) {
      for (const line of chunk.split(/\r?\n/u)) {
        const trimmed = line.trim()
        if (trimmed) {
          display.showActivity(trimmed)
        }
      }
    },
  })
  autoModeRuntime.clearDefaultPodDataSession()
  display.showActivity('LinX Cloud login refreshed.', 'success')
}

function runBackendLinxLogout(display: AutoModeDisplay): void {
  runLinxLogoutCommand({
    write(chunk) {
      for (const line of chunk.split(/\r?\n/u)) {
        const trimmed = line.trim()
        if (trimmed) {
          display.showActivity(trimmed)
        }
      }
    },
  })
  autoModeRuntime.clearDefaultPodDataSession()
  display.showActivity('Use /login or choose browser authorization to sign in again.', 'note')
}

async function promptBackendSolidClientCredentials(display: AutoModeDisplay): Promise<boolean> {
  display.setPhase('question', 'Solid client credentials required')
  const credentialsText = await display.promptSecret({
    header: 'Solid client credentials',
    question: 'Paste Solid client credentials in client_id:client_secret format.',
    note: 'Input is hidden and saved locally as LinX Cloud client credentials.',
  })
  const parsed = parseSolidClientCredentials(credentialsText)
  if (!parsed) {
    display.showActivity('Solid client credentials entry cancelled or invalid. Expected client_id:client_secret.', 'error')
    return false
  }

  autoModeRuntime.clearDefaultPodDataSession()

  try {
    await autoModeRuntime.persistSolidClientCredentialsLogin(credentialsText, autoModeRuntime)
    autoModeRuntime.clearDefaultPodDataSession()
    display.showActivity('Solid client credentials saved. Retrying backend startup.', 'success')
    return true
  } catch (error) {
    autoModeRuntime.clearDefaultPodDataSession()
    const message = error instanceof Error ? error.message : String(error)
    display.showActivity(`Solid client credentials rejected: ${message}`, 'error')
    return false
  }
}

function isRecoverableLinxCloudAuthError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('linx login')
    || normalized.includes('linx cloud login expired')
    || normalized.includes('linx cloud credential source is not connected')
    || normalized.includes('failed to restore oidc access token')
    || normalized.includes('invalid solid token')
    || normalized.includes('unauthorized')
}

function backendProviderLabel(backend: Exclude<AutoRunOptions['backend'], 'linx'>): string {
  if (backend === 'claude') return 'Anthropic'
  if (backend === 'codex') return 'Codex'
  return 'CodeBuddy'
}

function backendProviderId(backend: Exclude<AutoRunOptions['backend'], 'linx'>): string {
  if (backend === 'claude') return 'anthropic'
  if (backend === 'codex') return 'openai'
  return 'codebuddy'
}

function isMissingProviderCredentialError(backend: Exclude<AutoRunOptions['backend'], 'linx'>, message: string): boolean {
  return message === podCredentialMissingMessage(backend)
}

async function promptBackendProviderCredential(
  display: AutoModeDisplay,
  backend: Exclude<AutoRunOptions['backend'], 'linx'>,
  reason: 'missing' | 'invalid' = 'missing',
): Promise<'saved' | 'cancel'> {
  const provider = backendProviderId(backend)
  const label = backendProviderLabel(backend)
  display.showActivity(`AI Secretary detected ${reason} ${label} credentials.`, 'note')
  let providerId = provider
  if (backend === 'codex') {
    display.setPhase('question', `${label} ${reason} provider`)
    const enteredProviderId = await display.chooseQuestion({
      header: `${label} provider id`,
      question: 'Enter the provider id for this Codex-compatible API gateway.',
      options: [],
      questionIndex: 0,
      questionCount: 1,
      unansweredCount: 1,
    })
    providerId = enteredProviderId.trim() || provider
  }

  display.setPhase('question', `${label} ${reason} API key`)
  const apiKey = await display.promptSecret({
    header: `${label} key`,
    question: `Enter the ${label} API key to save in your LinX Pod AI settings.`,
  })
  if (!apiKey) {
    display.showActivity(`${label} API key was not provided. Backend startup cancelled.`, 'error')
    return 'cancel'
  }

  const result = await autoModeRuntime.connectAiProviderCredential({
    provider: providerId,
    apiKey,
    ...(backend === 'codex' ? { supportsBackend: 'codex', rotationPolicy: 'round_robin' } : {}),
  })
  display.showActivity(`Saved ${result.providerId} credential to LinX Pod AI settings.`, 'success')
  return 'saved'
}

function approvalPromptMessage(request: AutoModeApprovalRequest): string {
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

async function materializeAutoModeGrantIfNeeded(input: {
  approvalId: string
  approvalUri?: string
  decision: AutoModeApprovalDecision
  decisionRole?: 'human' | 'secretary'
}): Promise<void> {
  if (!shouldMaterializeAutoModeGrant(input.decision)) {
    return
  }

  await autoModeRuntime.materializeRemoteAutoModeGrant({
    approvalId: input.approvalId,
    approvalUri: input.approvalUri,
    decisionRole: input.decisionRole,
  }).catch(() => undefined)
}

function appendUserTurn(record: AutoModeSessionRecord, text: string): void {
  appendEntry(record, 'system', JSON.stringify({ type: 'user.turn', text }), [])
}

function appendTurnStart(record: AutoModeSessionRecord, command: string, args: string[]): void {
  appendEntry(record, 'system', JSON.stringify({ type: 'turn.start', command, args }), [])
}

function createAcpInteractionThreadEvent(
  record: AutoModeSessionRecord,
  interaction: AutoModeInteractionRequest,
): ThreadControlEvent {
  return {
    type: interaction.kind === 'user-input' ? 'input.required' : 'approval.required',
    thread: record.backendSessionId ?? record.id,
    chat: record.backendSessionId ?? record.id,
    actor: {
      id: record.backendSessionId ?? record.backend,
      role: 'runtime',
    },
    data: {
      requestKind: interaction.kind,
      backend: record.backend,
      runtimeSession: record.backendSessionId,
      businessSession: record.id,
    },
  }
}

function requestedCredentialSource(options: AutoRunOptions): 'cloud' | 'local' {
  return options.credentialSource === 'local' ? 'local' : 'cloud'
}

function defaultApprovalStrategy(): 'hybrid' {
  return 'hybrid'
}

function resolveApprovalStrategy(options: Pick<AutoRunOptions, 'approvalStrategy'>): AutoModeSessionRecord['approvalSource'] {
  return options.approvalStrategy ?? defaultApprovalStrategy()
}

function requestedRuntime(options: AutoRunOptions): AutoModeRuntime {
  return options.runtime ?? 'local'
}

function requestedAutoEnabled(options: AutoRunOptions): boolean {
  return options.autoEnabled === true
}

function requestedAutoModeMode(options: AutoRunOptions): 'auto' | 'off' {
  if (options.mode === 'auto' || options.mode === 'off') {
    return options.mode
  }

  return requestedAutoEnabled(options) ? 'auto' : 'off'
}

function isAutoModeWorkerBackend(backend: AutoModeSessionRecord['backend']): backend is AutoModeWorkerBackend {
  return backend === 'linx' || backend === 'codex' || backend === 'claude' || backend === 'codebuddy'
}

function isAcpAutoModeWorkerBackend(backend: AutoModeWorkerBackend): backend is Exclude<AutoModeWorkerBackend, 'linx'> {
  return backend === 'codex' || backend === 'claude' || backend === 'codebuddy'
}

function normalizeBackendCommandEnv(
  backend: AutoRunOptions['backend'],
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env) {
    return undefined
  }

  return { ...env }
}

function mergeCommandEnv(
  backend: AutoRunOptions['backend'],
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
  record: AutoModeSessionRecord,
  options: AutoRunOptions,
  plan: AutoModeSpawnPlan,
): Partial<AutoModeSessionRecord> {
  return {
    backend: options.backend,
    runtime: requestedRuntime(options),
    mode: requestedAutoModeMode(options),
    autoEnabled: requestedAutoEnabled(options),
    goalMode: options.goalMode || undefined,
    cwd: options.cwd,
    model: options.model,
    prompt: options.prompt,
    passthroughArgs: [...options.passthroughArgs],
    credentialSource: requestedCredentialSource(options),
    resolvedCredentialSource: options.resolvedCredentialSource,
    approvalSource: record.approvalSource ?? defaultApprovalStrategy(),
    command: plan.command,
    args: [...plan.args],
    transport: options.transport ?? (options.backend === 'linx' ? 'native' : 'acp'),
    metadata: options.metadata ? { ...options.metadata } : undefined,
  }
}

function extractAcpSessionId(response: Record<string, unknown>): string | null {
  if (typeof response.sessionId === 'string' && response.sessionId.trim()) {
    return response.sessionId
  }
  const nestedSession = response.session
  if (
    typeof nestedSession === 'object'
    && nestedSession !== null
    && typeof (nestedSession as Record<string, unknown>).id === 'string'
    && ((nestedSession as Record<string, unknown>).id as string).trim()
  ) {
    return (nestedSession as Record<string, unknown>).id as string
  }
  return null
}

function withResolvedSource(
  options: AutoRunOptions,
  resolvedCredentialSource: 'cloud' | 'local',
  commandEnv?: Record<string, string>,
): AutoRunOptions {
  return {
    ...options,
    mode: requestedAutoModeMode(options),
    transport: options.transport ?? (options.backend === 'linx' ? 'native' : 'acp'),
    credentialSource: requestedCredentialSource(options),
    resolvedCredentialSource,
    commandEnv: mergeCommandEnv(options.backend, commandEnv, options.commandEnv),
    autoEnabled: requestedAutoEnabled(options),
    approvalStrategy: resolveApprovalStrategy(options),
  }
}

async function probeCloudCredentialSource(
  backend: Exclude<AutoRunOptions['backend'], 'linx'>,
  runtime: typeof autoModeRuntime,
): Promise<{
  commandEnv?: Record<string, string>
}> {
  try {
    const podCredential = await runtime.loadPodBackendCredential(backend)
    if (!podCredential) {
      throw new Error(podCredentialMissingMessage(backend))
    }

    return {
      commandEnv: normalizeBackendCommandEnv(backend, { ...podCredential.env }),
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function resolveAutoRunOptions(
  options: AutoRunOptions,
  runtime = autoModeRuntime,
): Promise<ResolvedAutoModeRun> {
  if (options.backend === 'linx') {
    const session = await runtime.createPodDataSession()
    if (!session) {
      throw new Error('No LinX cloud login found. Run `linx login` first.')
    }
    await session.close().catch(() => undefined)
    return {
      options: withResolvedSource(options, 'cloud'),
      authPreflight: { state: 'authenticated' },
    }
  }

  if (requestedCredentialSource(options) === 'local') {
    return {
      options: withResolvedSource(options, 'local'),
      authPreflight: await runtime.preflightAutoModeAuth(options.backend),
    }
  }

  const { commandEnv } = await probeCloudCredentialSource(options.backend, runtime)
  return {
    options: withResolvedSource(options, 'cloud', commandEnv),
    authPreflight: { state: 'authenticated' },
  }
}

abstract class BaseSession implements AutoModeConversationSession {
  readonly record: AutoModeSessionRecord
  readonly display: AutoModeDisplay
  protected child: ChildProcessWithoutNullStreams | null = null
  private activeExitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null
  private activeExitResolve: ((result: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null
  private activeClosePromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null
  private activeCloseResolve: ((result: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null
  protected closed = false
  protected lastExit: { code: number | null; signal: NodeJS.Signals | null } | null = null

  constructor(record: AutoModeSessionRecord, prompt: typeof autoModeRuntime.promptText, options: { quiet?: boolean } = {}) {
    this.record = record
    this.display = createAutoModeDisplay(record, prompt, { quiet: options.quiet })
  }

  protected spawnProcess(command: string, args: string[], cwd: string, env?: Record<string, string>): ChildProcessWithoutNullStreams {
    this.activeExitPromise = new Promise((resolve) => {
      this.activeExitResolve = resolve
    })
    this.activeClosePromise = new Promise((resolve) => {
      this.activeCloseResolve = resolve
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
      this.onProcessExit(code, signal)
    })

    child.on('close', (code, signal) => {
      this.activeCloseResolve?.({ code, signal })
      this.activeCloseResolve = null
      if (this.child === child) {
        this.child = null
      }
    })

    return child
  }

  async finalizeAndClose(status: 'completed' | 'failed', error?: string): Promise<AutoModeSessionRecord> {
    const exitState = await this.waitForActiveExit()
    const next = finishAutoModeSession(this.record, {
      status,
      exitCode: exitState.code,
      signal: exitState.signal,
      error,
    })
    this.display.finish(status, next, error)
    return next
  }

  protected recordParsedLine(stream: OutputStream, line: string, events: AutoModeNormalizedEvent[]): void {
    appendEntry(this.record, stream, line, events)

    if (events.length > 0) {
      this.display.renderEvents(events)
      return
    }

    this.display.renderRawLine(stream, line)
  }

  protected updateRecord(updates: Partial<AutoModeSessionRecord>): void {
    Object.assign(this.record, updates)
    writeAutoModeSession(this.record)
    this.display.updateRecord(this.record)
  }

  protected adoptSessionId(sessionId: string): void {
    adoptAutoModeSessionId(this.record, sessionId)
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

  protected waitForActiveClose(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    if (this.child === null) {
      return Promise.resolve(this.lastExit ?? { code: null, signal: null })
    }

    if (this.activeClosePromise) {
      return this.activeClosePromise
    }

    return Promise.resolve(this.lastExit ?? { code: null, signal: null })
  }

  protected abstract onProcessExit(code: number | null, signal: NodeJS.Signals | null): void
  protected abstract onProcessFailure(error: Error): void

  abstract start(): Promise<void>
  abstract sendTurn(text: string): Promise<void>
  abstract setModel(model: string): Promise<void>
  abstract applyResolvedOptions(options: AutoRunOptions): void

  async abort(): Promise<void> {
    this.closed = true

    const child = this.child
    if (!child) {
      return
    }

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
    await this.waitForActiveClose()
  }

  async close(): Promise<void> {
    this.closed = true

    const child = this.child
    if (!child) {
      return
    }

    if (!child.stdin.destroyed && !child.stdin.writableEnded) {
      child.stdin.end()
    }
    const settled = await Promise.race([
      this.waitForActiveClose().then(() => true),
      delay(1500).then(() => false),
    ])

    if (!settled) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
      }
      await this.waitForActiveClose()
    }
  }
}

class AcpSession extends BaseSession {
  private readonly hook: AutoModeBackendHook
  private options: AutoRunOptions
  private requestId = 1
  private readonly pendingRequests = new Map<number, PendingRpcRequest>()
  private turnState: AutoModeTurnState | null = null
  private sessionId: string | null = null
  private authFailureMessage: string | null = null
  private turnSettleTimer: NodeJS.Timeout | null = null
  private activeAgentRequests = 0

  constructor(options: AutoRunOptions, hook: AutoModeBackendHook) {
    const plan = hook.buildSpawnPlan(options)
    super(createAutoModeSession({ ...options, transport: options.transport ?? 'acp' }, plan), autoModeRuntime.promptText, {
      quiet: options.quiet === true,
    })
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

    const sessionResponse = this.options.resumeSessionId
      ? await this.sendRequest('session/resume', {
        cwd: this.options.cwd,
        mcpServers: [],
        sessionId: this.options.resumeSessionId,
      }) as Record<string, unknown>
      : await this.sendRequest('session/new', {
        cwd: this.options.cwd,
        mcpServers: [],
      }) as Record<string, unknown>

    const sessionId = extractAcpSessionId(sessionResponse) ?? this.options.resumeSessionId ?? null

    if (!sessionId) {
      throw new Error(`ACP backend ${this.options.backend} did not return a session id`)
    }

    this.sessionId = sessionId
    this.adoptSessionId(sessionId)
    this.updateRecord({
      backendSessionId: sessionId,
      error: undefined,
    })

    if (this.options.model && this.hook.capabilities.canSetModel) {
      await this.trySetModel(this.options.model)
    } else if (this.options.model) {
      appendEntry(this.record, 'system', JSON.stringify({
        type: 'session.set_model.skipped',
        model: this.options.model,
        reason: `${this.record.backend} does not advertise runtime model switching`,
      }), [])
    }
  }

  applyResolvedOptions(options: AutoRunOptions): void {
    this.options = options
    const plan = this.hook.buildSpawnPlan(options)
    this.updateRecord(syncRecordFromOptions(this.record, options, plan))
  }

  async setModel(model: string): Promise<void> {
    const normalized = model.trim()
    if (!normalized) {
      throw new Error('Model id cannot be empty')
    }
    if (!this.hook.capabilities.canSetModel) {
      throw new Error(`${this.record.backend} does not advertise runtime model switching`)
    }

    await this.trySetModel(normalized, true)
    this.options = {
      ...this.options,
      model: normalized,
    }
    this.updateRecord({
      model: normalized,
    })
  }

  async sendTurn(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('ACP session is not initialized')
    }
    if (this.turnState) {
      throw new Error('An auto-mode turn is already in progress')
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

      const turnState = this.turnState as AutoModeTurnState | null
      if (turnState === null) {
        return
      }

      ;(turnState as AutoModeTurnState).responseReceived = true
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
    const authFailure = detectAutoModeAuthFailure(this.record.backend, line)
    if (authFailure) {
      this.authFailureMessage = authFailure.message
    }

    if (stream === 'stderr') {
      this.recordParsedLine(stream, line, [])
      this.markTurnActivity()
      return
    }

    const message = parseAutoModeJsonLine(line)
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
      if (events.length > 0) {
        this.recordParsedLine(stream, line, events)
      } else {
        appendEntry(this.record, stream, line, [])
      }
      void this.handleAgentRequest(message)
      this.markTurnActivity()
      return
    }

    if (typeof message.method === 'string') {
      const events = normalizeAcpSessionNotification(message)
      if (events.length > 0) {
        this.recordParsedLine(stream, line, events)
      } else {
        appendEntry(this.record, stream, line, [])
      }
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
      const authFailure = detectAutoModeAuthFailure(this.record.backend, JSON.stringify(message))
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
          '[note] Backend credentials are resolved from LinX Cloud Pod settings, not local backend login.',
        ]
        const authAction = await promptLinxCloudAuth(this.display, lines, 'expired')
        if (authAction !== 'retry') {
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

      this.sendResponse(id, await this.resolveInteraction(interaction))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      this.sendError(id, -32000, messageText)
    } finally {
      this.activeAgentRequests = Math.max(0, this.activeAgentRequests - 1)
      this.scheduleTurnSettle()
    }
  }

  private async resolveInteraction(interaction: AutoModeInteractionRequest): Promise<unknown> {
    let result: unknown
    let wakeError: unknown
    const autoEnabled = this.record.autoEnabled === true
    const cycle = await runThreadReconcilerCycle({
      policy: {
        kind: autoEnabled ? 'auto' : 'direct',
        secretaryAgent: '__secretary__',
      },
      handleWakeJob: async ({ decisionSummary, record }) => {
        try {
          result = await this.resolveInteractionDirect(interaction)
          return {
            requestKind: interaction.kind,
            responseKind: interaction.kind === 'user-input' ? 'user-input' : 'approval',
            reconciler: decisionSummary.id,
            wakeJob: record.key,
          }
        } catch (error) {
          wakeError = error
          throw error
        }
      },
      event: createAcpInteractionThreadEvent(this.record, interaction),
      dispatchOptions: {
        randomId: `acp-${interaction.kind}-${Date.now()}`,
      },
      onDispatched: (dispatch) => {
        appendSessionNote(this.record, `Thread Reconciler dispatched ${interaction.kind}`, {
        requestKind: interaction.kind,
        reconciler: dispatch.summary,
        scheduler: {
          wakeRecords: dispatch.wakeRecordSummaries,
        },
      })
      if (dispatch.summary.wakeJobs.length === 0) {
        result = this.resolveInteractionDirect(interaction)
      }
    },
    })

    result = await result
    appendSessionNote(this.record, `Thread Reconciler resolved ${interaction.kind}`, {
      requestKind: interaction.kind,
      reconciler: cycle.summary,
      scheduler: cycle.schedulerSummary,
    })

    if (cycle.schedulerSummary.failed.length > 0) {
      throw wakeError ?? new Error(String(cycle.schedulerSummary.failed[0]?.error ?? 'AI Secretary interaction wake job failed'))
    }
    if (result === undefined) {
      throw new Error('AI Secretary was not awakened for ACP interaction.')
    }
    return result
  }

  private async resolveInteractionDirect(interaction: AutoModeInteractionRequest): Promise<unknown> {
    if (interaction.kind === 'user-input') {
      return this.resolveToolUserInput(interaction)
    }

    const decision = await this.resolveApproval(interaction)
    return buildAcpPermissionResponse(interaction, decision)
  }

  private async resolveToolUserInput(interaction: AutoModeUserInputRequest): Promise<unknown> {
    const recommendation = await this.resolveSecretaryRecommendation(interaction)
    const answers = await this.resolveToolUserInputAnswers(interaction.questions, recommendation?.kind === 'user-input' ? recommendation : null)
    this.display.setPhase('running', 'Continuing turn')
    return buildAutoModeUserInputResponse(answers)
  }

  private async resolveToolUserInputAnswers(
    questions: AutoModeUserInputQuestion[],
    recommendation?: AutoModeSecretaryUserInputRecommendation | null,
  ): Promise<AutoModeUserInputAnswers> {
    this.display.setPhase('question', questions[0]?.header ?? 'Input required')
    if (!recommendation?.answers || !recommendation.canAutoDecide) {
      if (recommendation?.answers) {
        this.display.showActivity(`AI secretary suggests: ${autoModeUserInputAnswersSummary(recommendation.answers)}`)
      }
      return this.display.chooseQuestions(questions)
    }

    const reactionWindowMs = resolveSecretaryReactionWindowMs(recommendation)
    const displayRecommendation = {
      ...recommendation,
      reactionWindowMs,
    }

    const useAiAnswer = await promptWithAutoDefault({
      fallback: (signal) => this.display.chooseOption(
        'Input required',
        [
          `[input] ${questions[0]?.question ?? 'Input required'}`,
          `[secretary] suggests ${autoModeUserInputAnswersSummary(recommendation.answers!)}`,
          ...(recommendation.reason ? [`[secretary] ${recommendation.reason}`] : []),
          ...(displayRecommendation.reactionWindowMs ? [`[secretary] auto-uses this answer after ${formatReactionWindow(displayRecommendation.reactionWindowMs)}`] : []),
        ],
        [
          { label: 'Use AI answer (recommended)', value: 'use', shortcuts: ['u', 'y', '1'] },
          { label: 'Answer myself', value: 'manual', shortcuts: ['m', 'n', '2'] },
        ],
        signal,
      ),
      defaultValue: 'use',
      reactionWindowMs,
      onProgress: reactionWindowMs > 0
        ? (detail) => this.display.setPhase('question', detail)
        : undefined,
      onAuto: () => this.display.showActivity(
        `AI secretary answered input | ${autoModeUserInputAnswersSummary(recommendation.answers!)}`,
        'success',
      ),
    })

    if (useAiAnswer === 'use' || useAiAnswer === 'u' || useAiAnswer === 'y' || useAiAnswer === 'yes') {
      return recommendation.answers
    }
    return this.display.chooseQuestions(questions)
  }

  private async resolveApproval(interaction: AutoModeApprovalRequest): Promise<AutoModeApprovalDecision> {
    const recommendation = await this.resolveSecretaryRecommendation(interaction)
    const approvalRecommendation = recommendation?.kind === interaction.kind
      ? recommendation as AutoModeSecretaryApprovalRecommendation
      : null
    const approvalStrategy = resolveApprovalStrategy(this.options)

    if (approvalStrategy === 'local') {
      const promptMessage = approvalPromptMessage(interaction)
      const decision = await promptApprovalWithRecommendation(this.display, promptMessage, approvalRecommendation)
      appendSessionNote(this.record, `Local approval resolved | ${decision}`)
      this.display.setPhase('running', 'Continuing turn')
      return decision
    }

    const granted = await autoModeRuntime.resolveExistingRemoteAutoModeGrant({
      record: this.record,
      request: interaction,
    }).catch(() => null)

    if (granted) {
      appendSessionNote(this.record, `Existing grant covered approval | ${autoModeApprovalDecisionLabel(granted)}`)
      this.display.showActivity(`Existing grant covered approval | ${autoModeApprovalDecisionLabel(granted)}`, 'success')
      this.display.setPhase('running', 'Continuing turn')
      return granted
    }

    if (approvalStrategy === 'remote') {
      return this.resolveRemoteOnlyApproval(interaction, approvalRecommendation)
    }

    return this.resolveHybridApproval(interaction, approvalRecommendation)
  }

  private async resolveSecretaryRecommendation(interaction: AutoModeInteractionRequest): Promise<AutoModeSecretaryRecommendation | null> {
    return autoModeRuntime.resolveAutoModeSecretaryRecommendation({
      mode: requestedAutoModeMode(this.options),
      record: this.record,
      request: interaction,
    }).catch(() => null)
  }

  private async resolveRemoteOnlyApproval(
    interaction: AutoModeApprovalRequest,
    recommendation?: AutoModeSecretaryApprovalRecommendation | null,
  ): Promise<AutoModeApprovalDecision> {
    const promptMessage = approvalPromptMessage(interaction)
    appendSessionNote(this.record, `Waiting for remote approval | ${promptMessage}`)
    this.display.setPhase('approval', `${promptMessage} · remote`)

    const remote = await autoModeRuntime.createRemoteAutoModeApproval({
      record: this.record,
      request: interaction,
    })
    const remoteDecisionPromise = autoModeRuntime.waitForRemoteAutoModeApproval({
      approvalId: remote.id,
      approvalUri: remote.approvalUri,
    })
    void remoteDecisionPromise.catch(() => undefined)

    if (!recommendation?.canAutoDecide || !recommendation.decision) {
      const decision = await remoteDecisionPromise
      await materializeAutoModeGrantIfNeeded({
        approvalId: remote.id,
        approvalUri: remote.approvalUri,
        decision,
      })
      appendSessionNote(this.record, `Remote approval resolved | ${decision}`)
      this.display.setPhase('running', 'Continuing turn')
      return decision
    }

    const reactionWindowMs = resolveSecretaryReactionWindowMs(recommendation)
    const decision = await Promise.race([
      remoteDecisionPromise,
      delay(reactionWindowMs).then(async () => {
        this.display.showActivity(
          `AI secretary selected ${autoModeApprovalDecisionLabel(recommendation.decision!)} | ${recommendation.reason ?? 'auto decision'}`,
          'success',
        )
        await autoModeRuntime.resolveRemoteAutoModeApproval({
          approvalId: remote.id,
          approvalUri: remote.approvalUri,
          decision: recommendation.decision!,
          decisionRole: 'secretary',
          note: recommendation.reason ?? 'resolved by AI secretary',
        }).catch(() => undefined)
        return recommendation.decision!
      }),
    ])

    await materializeAutoModeGrantIfNeeded({
      approvalId: remote.id,
      approvalUri: remote.approvalUri,
      decision,
      decisionRole: recommendation?.canAutoDecide ? 'secretary' : undefined,
    })
    appendSessionNote(this.record, `Remote approval resolved | ${decision}`)
    this.display.setPhase('running', 'Continuing turn')
    return decision
  }

  private async resolveHybridApproval(
    interaction: AutoModeApprovalRequest,
    recommendation?: AutoModeSecretaryApprovalRecommendation | null,
  ): Promise<AutoModeApprovalDecision> {
    const promptMessage = approvalPromptMessage(interaction)

    let remoteApproval: { id: string; approvalUri?: string } | null = null
    try {
      remoteApproval = await autoModeRuntime.createRemoteAutoModeApproval({
        record: this.record,
        request: interaction,
      })
      appendSessionNote(this.record, `Remote approval opened | ${remoteApproval.id}`)
    } catch (error) {
      appendSessionNote(
        this.record,
        `Remote approval unavailable | ${error instanceof Error ? error.message : String(error)}`,
      )
      const decision = await promptApprovalWithRecommendation(this.display, promptMessage, recommendation)
      appendSessionNote(this.record, `Local approval resolved | ${decision}`)
      this.display.setPhase('running', 'Continuing turn')
      return decision
    }

    const localAbort = new AbortController()
    const remoteAbort = new AbortController()
    let secretaryAutoResolved = false
    const localDecisionPromise = promptApprovalWithRecommendation(
      this.display,
      promptMessage,
      recommendation,
      localAbort.signal,
      () => {
        secretaryAutoResolved = true
      },
    )
      .then((decision) => ({ source: 'local' as const, decision }))
    const remoteDecisionPromise = autoModeRuntime.waitForRemoteAutoModeApproval({
      approvalId: remoteApproval.id,
      approvalUri: remoteApproval.approvalUri,
      signal: remoteAbort.signal,
    }).then((decision) => ({ source: 'remote' as const, decision }))

    void localDecisionPromise.catch(() => undefined)
    void remoteDecisionPromise.catch(() => undefined)

    try {
      const winner = await Promise.race([localDecisionPromise, remoteDecisionPromise])

      if (winner.source === 'local') {
        remoteAbort.abort()
        appendSessionNote(this.record, `Local approval resolved | ${winner.decision}`)
        void autoModeRuntime.resolveRemoteAutoModeApproval({
          approvalId: remoteApproval.id,
          approvalUri: remoteApproval.approvalUri,
          decision: winner.decision,
          decisionRole: secretaryAutoResolved ? 'secretary' : 'human',
          note: secretaryAutoResolved
            ? (recommendation?.reason ?? 'resolved by AI secretary')
            : 'resolved from active local auto-mode session',
        })
          .then(() => materializeAutoModeGrantIfNeeded({
            approvalId: remoteApproval.id,
            approvalUri: remoteApproval.approvalUri,
            decision: winner.decision,
            decisionRole: secretaryAutoResolved ? 'secretary' : 'human',
          }))
          .catch(() => undefined)
        this.display.setPhase('running', 'Continuing turn')
        return winner.decision
      }

      localAbort.abort()
      await materializeAutoModeGrantIfNeeded({
        approvalId: remoteApproval.id,
        approvalUri: remoteApproval.approvalUri,
        decision: winner.decision,
      })
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

  private async trySetModel(model: string, throwOnFailure = false): Promise<boolean> {
    if (!this.sessionId) {
      return false
    }

    try {
      await this.sendRequest('session/set_model', {
        sessionId: this.sessionId,
        modelId: model,
      })
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      appendEntry(this.record, 'system', JSON.stringify({
        type: 'session.set_model.skipped',
        model,
        reason,
      }), [])
      if (throwOnFailure) {
        throw new Error(reason)
      }
      return false
    }
  }
}

class LinxNativeSession extends BaseSession {
  private options: AutoRunOptions
  private podSession: PodDataSession | null = null

  constructor(options: AutoRunOptions) {
    super(createAutoModeSession({ ...options, transport: 'native' }, buildLinxNativeSpawnPlan(options)), autoModeRuntime.promptText, {
      quiet: options.quiet === true,
    })
    this.options = options
  }

  async start(): Promise<void> {
    const podSession = await autoModeRuntime.createPodDataSession()
    if (!podSession) {
      throw new Error('No LinX cloud login found. Run `linx login` first.')
    }

    this.podSession = podSession
    this.updateRecord({
      backendSessionId: this.record.id,
      transport: 'native',
      resolvedCredentialSource: 'cloud',
      error: undefined,
    })
    appendSessionNote(this.record, `LinX native worker connected as ${podSession.webId}`)
  }

  applyResolvedOptions(options: AutoRunOptions): void {
    this.options = {
      ...options,
      transport: 'native',
    }
    this.updateRecord(syncRecordFromOptions(this.record, this.options, buildLinxNativeSpawnPlan(this.options)))
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
    appendSessionNote(this.record, `LinX native worker model set to ${normalized}`)
  }

  async sendTurn(text: string): Promise<void> {
    const podSession = this.podSession
    if (!podSession) {
      throw new Error('LinX native session is not initialized')
    }

    appendUserTurn(this.record, text)
    appendTurnStart(this.record, this.record.command, this.record.args)

    const result = await autoModeRuntime.createRemoteCompletionResult({
      runtimeUrl: resolveRuntimeTarget({ issuerUrl: podSession.credentials.url }).runtimeUrl,
      authSession: podSession,
      model: this.options.model,
      messages: [{ role: 'user', content: text }],
      signal: this.options.signal,
    })

    this.recordLinxCompletion(result)
  }

  protected onProcessExit(): void {}

  protected onProcessFailure(): void {}

  async abort(): Promise<void> {
    await this.close()
  }

  async close(): Promise<void> {
    const session = this.podSession
    this.podSession = null
    await session?.close().catch(() => undefined)
    await super.close()
  }

  private recordLinxCompletion(result: RemoteCompletionResult): void {
    const content = result.content.trim()
    const toolEvents = result.toolCalls.map((toolCall) => ({
      type: 'tool.call' as const,
      name: toolCall.function.name,
      arguments: parseLinxToolCallArguments(toolCall.function.arguments),
      raw: toolCall,
    }))
    const events: AutoModeNormalizedEvent[] = [
      ...toolEvents,
      ...(content ? [{ type: 'assistant.delta' as const, text: content, raw: result }] : []),
      { type: 'assistant.done' as const, ...(content ? { text: content } : {}), raw: result },
    ]

    this.recordParsedLine('stdout', JSON.stringify({
      type: 'assistant.message',
      content,
      ...(result.reasoningContent ? { reasoningContent: result.reasoningContent } : {}),
      ...(result.finishReason ? { finishReason: result.finishReason } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
    }), events)
  }
}

function buildLinxNativeSpawnPlan(_options: AutoRunOptions): AutoModeSpawnPlan {
  return {
    command: 'linx-cloud',
    args: ['chat/completions'],
  }
}

function parseLinxToolCallArguments(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed }
  } catch {
    return { raw: value }
  }
}

function buildConversationSession(options: AutoRunOptions): BaseSession {
  if (options.backend === 'linx') {
    return new LinxNativeSession(options)
  }

  const hook = getAutoModeHook(options.backend)
  return new AcpSession(options, hook)
}

async function handleAutoModeShellCommand(args: {
  input: string
  session: AutoModeConversationSession
  display: AutoModeDisplay
  queueState: AutoModeQueueState
  backend: string
  record: AutoModeSessionRecord
}): Promise<'handled' | 'exit' | 'pass' | { kind: 'send'; text: string }> {
  const { input, session, display, queueState, backend, record } = args

  if (input === '/exit' || input === '/quit') {
    return 'exit'
  }

  if (input === '/help' || input === '/hotkeys' || input === '/keymap') {
    display.showHelp()
    return 'handled'
  }

  if (input === '/login') {
    try {
      await runBackendLinxLogin(display)
      appendSessionNote(record, 'LinX Cloud login refreshed from auto-mode')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendAndDisplaySessionNote(record, display, `LinX Cloud login failed | ${message}`, 'error', { error: message })
    }
    return 'handled'
  }

  if (input === '/logout') {
    runBackendLinxLogout(display)
    appendSessionNote(record, 'LinX Cloud logout requested from auto-mode')
    return 'handled'
  }

  if (input === '/session') {
    appendAndDisplaySessionNote(record, display, [
      `session=${record.backendSessionId ?? record.id}`,
      `backend=${record.backend}`,
      `runtime=${record.runtime}`,
      'credentials=pod',
      `model=${record.model ?? 'default'}`,
      `cwd=${record.cwd}`,
    ].join(' | '))
    return 'handled'
  }

  const autoModeRoute = resolveAutoModeCommandRoute(input)
  if (autoModeRoute) {
    return handleAutoModeCommandRoute({
      route: autoModeRoute,
      session,
      display,
      record,
    })
  }

  if (input === '/queue') {
    appendAndDisplaySessionNote(record, display, `queue | steer=${queueState.steeringCount} | follow-up=${queueState.followUpCount}`)
    return 'handled'
  }

  if (input.startsWith('/follow-up ')) {
    return 'pass'
  }

  if (input === '/sessions') {
    const summaries = listAutoModeSessions().slice(0, 5).map(formatAutoModeSessionSummary)
    if (summaries.length === 0) {
      appendAndDisplaySessionNote(record, display, 'No archived auto-mode sessions found')
      return 'handled'
    }

    for (const summary of summaries) {
      appendAndDisplaySessionNote(record, display, summary)
    }
    return 'handled'
  }

  if (input === '/new') {
    appendAndDisplaySessionNote(record, display, 'Use `linx --backend <backend>` to start a fresh auto-mode session')
    return 'handled'
  }

  if (input === '/debug' || input === '/debug on') {
    display.setDebugMode(true)
    appendSessionNote(record, 'Debug protocol view enabled', { debug: true })
    return 'handled'
  }

  if (input === '/debug off') {
    display.setDebugMode(false)
    appendSessionNote(record, 'Debug protocol view disabled', { debug: false })
    return 'handled'
  }

  if (input.startsWith('/model ')) {
    const model = input.slice('/model '.length).trim()
    if (!model) {
      appendAndDisplaySessionNote(record, display, 'Usage: /model <modelId>', 'error')
      return 'handled'
    }

    try {
      await session.setModel(model)
      appendAndDisplaySessionNote(record, display, `Model set to ${model}`, 'success', { backend, model })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      appendAndDisplaySessionNote(record, display, `Model switch failed | ${reason}`, 'error', { backend, model, reason })
    }
    return 'handled'
  }

  return 'pass'
}

function handleAutoModeCommandRoute(args: {
  route: AutoModeControlCommandRoute | AutoModePeerCommandRoute
  session: AutoModeConversationSession
  display: AutoModeDisplay
  record: AutoModeSessionRecord
}): 'handled' | { kind: 'send'; text: string } {
  const { route, session, display, record } = args
  if (route.kind === 'control-command') {
    return handleAutoModeControlCommand({ route, session, display, record })
  }
  return handleAutoModePeerCommand({ route, session, display, record })
}

function handleAutoModeControlCommand(args: {
  route: AutoModeControlCommandRoute
  session: AutoModeConversationSession
  display: AutoModeDisplay
  record: AutoModeSessionRecord
}): 'handled' | { kind: 'send'; text: string } {
  const { route, session, display, record } = args
  const auto = route.auto
  if (!auto || auto.action === 'status') {
    const enabled = record.autoEnabled === true
    appendAndDisplaySessionNote(record, display, `Auto is ${enabled ? 'on' : 'off'}. Use /auto on or /auto off.`)
    return 'handled'
  }

  if (!isAutoModeWorkerBackend(record.backend)) {
    throw new Error(`Auto control commands cannot run backend ${record.backend}`)
  }

  applyAutoModeAutoEnabled(session, record, auto.enabled)
  appendAndDisplaySessionNote(
    record,
    display,
    `Auto ${auto.enabled ? 'on' : 'off'}: ${auto.enabled ? 'Secretary drives the session and asks when blocked' : 'user drives the session directly'}.`,
    'success',
    { autoEnabled: auto.enabled },
  )

  if (auto.initialInput) {
    const projectedRoute = resolveAutoModeCommandRoute(auto.initialInput)
    if (projectedRoute) {
      return handleAutoModeCommandRoute({
        route: projectedRoute,
        session,
        display,
        record,
      })
    }
    return { kind: 'send', text: auto.initialInput }
  }
  return 'handled'
}

function handleAutoModePeerCommand(args: {
  route: AutoModePeerCommandRoute
  session: AutoModeConversationSession
  display: AutoModeDisplay
  record: AutoModeSessionRecord
}): { kind: 'send'; text: string } {
  const { route, session, display, record } = args
  const goalMirror = route.secretaryBehavior?.goalMode
  if (goalMirror !== undefined) {
    applyAutoModeGoalMode(session, record, goalMirror)
    appendAndDisplaySessionNote(
      record,
      display,
      `Goal command routed to current chat peer; local supervision mirror is ${goalMirror ? 'active' : 'paused'}.`,
      'success',
      { goalMode: goalMirror, peerCommand: route.text },
    )
  } else {
    appendAndDisplaySessionNote(
      record,
      display,
      'Goal command routed to current chat peer.',
      'note',
      { peerCommand: route.text },
    )
  }
  return { kind: 'send', text: route.text }
}

function applyAutoModeAutoEnabled(
  session: AutoModeConversationSession,
  record: AutoModeSessionRecord,
  enabled: boolean,
): void {
  session.applyResolvedOptions({
    backend: record.backend,
    autoEnabled: enabled,
    mode: enabled ? 'auto' : 'off',
    cwd: record.cwd,
    plain: false,
    model: record.model,
    prompt: record.prompt,
    passthroughArgs: record.passthroughArgs,
    goalMode: record.goalMode,
    runtime: record.runtime,
    transport: record.transport,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalStrategy: resolveApprovalStrategy({ approvalStrategy: record.approvalSource }),
  })
  record.autoEnabled = enabled
  record.mode = enabled ? 'auto' : 'off'
}

function applyAutoModeGoalMode(
  session: AutoModeConversationSession,
  record: AutoModeSessionRecord,
  enabled: boolean,
): void {
  if (!isAutoModeWorkerBackend(record.backend)) {
    throw new Error(`Goal peer commands cannot run backend ${record.backend}`)
  }

  session.applyResolvedOptions({
    backend: record.backend,
    autoEnabled: record.autoEnabled === true,
    mode: record.mode,
    cwd: record.cwd,
    plain: false,
    model: record.model,
    prompt: record.prompt,
    passthroughArgs: record.passthroughArgs,
    goalMode: enabled,
    runtime: record.runtime,
    transport: record.transport,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalStrategy: resolveApprovalStrategy({ approvalStrategy: record.approvalSource }),
  })
  record.goalMode = enabled || undefined
}

export const __testHandleAutoModeShellCommand = handleAutoModeShellCommand
export const __testPromptLinxCloudAuth = promptLinxCloudAuth

export async function runAutoMode(options: AutoRunOptions): Promise<number> {
  const previousPlainEnv = process.env.LINX_BACKEND_PLAIN
  if (options.plain) {
    process.env.LINX_BACKEND_PLAIN = '1'
  }

  let fatalError: Error | null = null
  let session: BaseSession | null = null
  let abortCleanup: (() => void) | null = null

  const requestedOptions = {
    ...options,
    runtime: requestedRuntime(options),
    transport: (options.transport ?? (options.backend === 'linx' ? 'native' : 'acp')) as AutoRunOptions['transport'],
    mode: requestedAutoModeMode(options),
    autoEnabled: requestedAutoEnabled(options),
    credentialSource: requestedCredentialSource(options),
    approvalStrategy: resolveApprovalStrategy(options),
  }

  try {
    throwIfAborted(requestedOptions.signal)
    session = buildConversationSession(requestedOptions)
    const activeSession = session

    if (requestedOptions.signal) {
      const abortRun = () => {
        const reason = requestedOptions.signal?.reason
        const error = reason instanceof Error
          ? reason
          : createAbortError(typeof reason === 'string' && reason.trim() ? reason : 'Auto-mode run aborted')
        fatalError ??= error
        void activeSession.abort().catch(() => undefined)
      }
      if (requestedOptions.signal.aborted) {
        abortRun()
      } else {
        requestedOptions.signal.addEventListener('abort', abortRun, { once: true })
        abortCleanup = () => requestedOptions.signal?.removeEventListener('abort', abortRun)
      }
    }

    throwIfAborted(requestedOptions.signal)
    activeSession.display.start()
    activeSession.display.setPhase('starting', `Preparing ${requestedOptions.backend}`)
    activeSession.display.updateQueue({
      steeringCount: 0,
      followUpCount: 0,
    })

    let resolvedRun: ResolvedAutoModeRun

    for (let attempt = 0; ; attempt += 1) {
      try {
        throwIfAborted(requestedOptions.signal)
        resolvedRun = await withAbortSignal(resolveAutoRunOptions(requestedOptions), requestedOptions.signal)
        throwIfAborted(requestedOptions.signal)
        break
      } catch (error) {
        if (isAbortError(error)) {
          throw error
        }
        const message = error instanceof Error ? error.message : String(error)
        appendEntry(activeSession.record, 'system', JSON.stringify({
          type: 'credentials.resolve',
          backend: requestedOptions.backend,
          requestedCredentialSource: requestedOptions.credentialSource,
          error: message,
        }), [])
        if (isAcpAutoModeWorkerBackend(requestedOptions.backend)
          && isMissingProviderCredentialError(requestedOptions.backend, message)) {
          if (requestedOptions.quiet) {
            throw new Error(`${message} Quiet worker sessions cannot prompt for provider credentials; configure the credential before dispatching Symphony workers.`)
          }
          if (attempt >= 2) {
            throw error
          }

          appendEntry(activeSession.record, 'system', JSON.stringify({
            type: 'credentials.secretary.repair',
            backend: requestedOptions.backend,
            reason: 'missing',
          }), [])
          const keyAction = await promptBackendProviderCredential(activeSession.display, requestedOptions.backend, 'missing')
          if (keyAction !== 'saved') {
            throw error
          }
          continue
        }

        if (attempt >= 2 || !isRecoverableLinxCloudAuthError(message)) {
          throw error
        }

        const authAction = await promptLinxCloudAuth(activeSession.display, [
          message,
          `Backend ${requestedOptions.backend} reads provider credentials from your LinX Cloud Pod.`,
          'Re-authorize LinX Cloud, then LinX will retry backend startup.',
        ], 'startup')
        if (authAction !== 'retry') {
          const cancelError = new Error('Backend startup cancelled before LinX Cloud authorization.')
          fatalError = cancelError
          appendAndDisplaySessionNote(activeSession.record, activeSession.display, cancelError.message, 'note')
          return 1
        }
      }
    }

    throwIfAborted(requestedOptions.signal)
    activeSession.applyResolvedOptions(resolvedRun.options)
    appendEntry(activeSession.record, 'system', JSON.stringify({
      type: 'credentials.resolve',
      backend: resolvedRun.options.backend,
      requestedCredentialSource: resolvedRun.options.credentialSource,
      resolvedCredentialSource: resolvedRun.options.resolvedCredentialSource,
    }), [])

    const authPreflight = resolvedRun.authPreflight
    if (authPreflight.state === 'unauthenticated') {
      const message = authPreflight.message ?? `${resolvedRun.options.backend} is not authenticated`
      appendEntry(activeSession.record, 'system', JSON.stringify({
        type: 'auth.preflight',
        backend: resolvedRun.options.backend,
        state: authPreflight.state,
        resolvedCredentialSource: resolvedRun.options.resolvedCredentialSource,
      }), [
        { type: 'session.note', message, raw: { backend: resolvedRun.options.backend, state: authPreflight.state } },
      ])
      throw new Error(message)
    }

    await withAbortSignal(activeSession.start(), requestedOptions.signal)
    throwIfAborted(requestedOptions.signal)
    const steeringQueue: AutoModePromptSubmission[] = []
    const followUpQueue: AutoModePromptSubmission[] = []
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
      activeSession.display.updateQueue({
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

    if (requestedOptions.signal) {
      const wakeOnAbort = () => {
        const reason = requestedOptions.signal?.reason
        fatalError ??= reason instanceof Error
          ? reason
          : createAbortError(typeof reason === 'string' && reason.trim() ? reason : 'Auto-mode run aborted')
        stopRequested = true
        clearQueuedSubmissions()
        resolveWake()
      }
      if (requestedOptions.signal.aborted) {
        wakeOnAbort()
      } else {
        requestedOptions.signal.addEventListener('abort', wakeOnAbort, { once: true })
        const previousCleanup = abortCleanup
        abortCleanup = () => {
          previousCleanup?.()
          requestedOptions.signal?.removeEventListener('abort', wakeOnAbort)
        }
      }
    }

    const restoreQueuedSubmission = (): AutoModePromptSubmission | null => {
      const restored = steeringQueue.pop() ?? followUpQueue.pop() ?? null
      updateQueueState()
      return restored
    }

    const inputController: AutoModeInputController = {
      restoreQueuedSubmission,
    }
    session.display.bindInputController(inputController)

    const enqueueSubmission = (submission: AutoModePromptSubmission) => {
      if (submission.mode === 'follow-up') {
        followUpQueue.push(submission)
      } else {
        steeringQueue.push(submission)
      }

      updateQueueState()
      appendSessionNote(
        activeSession.record,
        submission.mode === 'follow-up'
          ? `Queued follow-up message (${followUpQueue.length} total)`
          : `Queued steering message (${steeringQueue.length} total)`,
        { text: submission.text, mode: submission.mode },
      )
      resolveWake()
    }

    const dequeueSubmission = (): AutoModePromptSubmission | null => {
      const next = steeringQueue.shift() ?? followUpQueue.shift() ?? null
      updateQueueState()
      return next
    }

    const runTurn = (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }
      if (requestedOptions.signal?.aborted) {
        const reason = requestedOptions.signal.reason
        fatalError ??= reason instanceof Error
          ? reason
          : createAbortError(typeof reason === 'string' && reason.trim() ? reason : 'Auto-mode run aborted')
        stopRequested = true
        resolveWake()
        return
      }

      activeSession.display.showUserTurn(trimmed)
      activeSession.display.setPhase('running', `Running ${resolvedRun.options.backend}`)

      activeTurn = activeSession.sendTurn(trimmed)
        .catch((error) => {
          fatalError ??= error instanceof Error ? error : new Error(String(error))
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

          activeSession.display.setPhase('ready', 'Waiting for input')
          resolveWake()
        })
    }

    const dispatchSubmission = async (submission: AutoModePromptSubmission): Promise<void> => {
      const trimmed = submission.text.trim()
      if (!trimmed) {
        return
      }
      throwIfAborted(requestedOptions.signal)

      const shellCommand = await handleAutoModeShellCommand({
        input: trimmed,
        session: activeSession,
        display: activeSession.display,
        queueState: {
          steeringCount: steeringQueue.length,
          followUpCount: followUpQueue.length,
        },
        backend: resolvedRun.options.backend,
        record: activeSession.record,
      })

      if (shellCommand === 'handled') {
        activeSession.display.setPhase(activeTurn ? 'running' : 'ready', activeTurn ? `Running ${resolvedRun.options.backend}` : 'Waiting for input')
        resolveWake()
        return
      }

      if (shellCommand === 'exit') {
        stopRequested = true
        resolveWake()
        return
      }

      if (shellCommand !== 'pass') {
        const projectedText = shellCommand.text.trim()
        if (!projectedText) {
          resolveWake()
          return
        }
        if (activeTurn) {
          enqueueSubmission({
            text: projectedText,
            mode: submission.mode,
          })
          return
        }
        runTurn(projectedText)
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

    let inputLoop: Promise<void> | null = null

    if (resolvedRun.options.prompt) {
      await dispatchSubmission({
        text: resolvedRun.options.prompt,
        mode: 'send',
      })
      stopRequested = !resolvedRun.options.goalMode
    }

    if (!resolvedRun.options.prompt || resolvedRun.options.goalMode) {
      inputLoop = (async () => {
        activeSession.display.setPhase('ready', resolvedRun.options.goalMode ? 'Pursuing goal' : 'Waiting for input')
        while (!fatalError && !stopRequested) {
          const submission = await activeSession.display.promptInput('you> ')
          await dispatchSubmission(submission)
        }
      })().catch((error) => {
        fatalError = error instanceof Error ? error : new Error(String(error))
        stopRequested = true
        clearQueuedSubmissions()
        resolveWake()
      })
    }

    while (!fatalError && (!stopRequested || activeTurn !== null || steeringQueue.length > 0 || followUpQueue.length > 0)) {
      await waitForWake()
    }

    void inputLoop
    if (fatalError) {
      throw fatalError
    }

    return 0
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error(String(error))
    throw fatalError
  } finally {
    abortCleanup?.()
    if (session) {
      await session.close()
      const finalRecord = await session.finalizeAndClose(fatalError ? 'failed' : 'completed', fatalError?.message)
      const podSyncAbort = new AbortController()
      const podSyncTimeoutMessage = `timed out after ${POD_PERSISTENCE_TIMEOUT_MS}ms`
      const podSyncSignal = options.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([options.signal, podSyncAbort.signal])
        : podSyncAbort.signal
      await withTimeout(
        autoModeRuntime.persistAutoModeConversationToPod(finalRecord, undefined, {
          signal: podSyncSignal,
        }),
        POD_PERSISTENCE_TIMEOUT_MS,
        podSyncTimeoutMessage,
        () => podSyncAbort.abort(new Error(podSyncTimeoutMessage)),
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        writeFailedPodSyncCheckpoint(finalRecord, message)
        appendSessionNote(finalRecord, `Pod sync failed | ${message}`, { error: message })
        if (!options.quiet) {
          process.emitWarning(`LinX auto-mode Pod sync failed: ${message}`)
        }
      })
    }

    if (options.plain) {
      if (previousPlainEnv === undefined) {
        delete process.env.LINX_BACKEND_PLAIN
      } else {
        process.env.LINX_BACKEND_PLAIN = previousPlainEnv
      }
    }
  }
}

export function listArchivedAutoModeSessions(): AutoModeSessionRecord[] {
  return listAutoModeSessions()
}

export function loadArchivedAutoModeSession(id: string): AutoModeSessionRecord | null {
  return loadAutoModeSession(id)
}

export function loadArchivedAutoModeEvents(id: string): AutoModeEventLogEntry[] {
  return loadAutoModeEvents(id)
}

export function listArchivedAutoModeSessionsWithPendingSync(): AutoModeSessionRecord[] {
  return listAutoModeSessionsWithPendingSync()
}

export function hasArchivedAutoModeSessionPendingSync(record: AutoModeSessionRecord): boolean {
  return hasPendingAutoModeSync(record)
}

export async function retryArchivedAutoModePodSync(id: string): Promise<boolean> {
  const record = loadAutoModeSession(id)
  if (!record) {
    throw new Error(`Auto-mode session not found: ${id}`)
  }
  if (record.status === 'running') {
    throw new Error(`Auto-mode session is still running: ${id}`)
  }
  return autoModeRuntime.persistAutoModeConversationToPod(record)
}

export function resumeAutoModeSession(record: AutoModeSessionRecord, options: {
  cwd?: string
  model?: string
  plain?: boolean
  prompt?: string
  goalMode?: boolean
} = {}): Promise<number> {
  if (!isAutoModeWorkerBackend(record.backend)) {
    throw new Error(`Cannot resume ${record.backend} through the worker auto-mode runner`)
  }
  const sessionId = record.backendSessionId?.trim() || record.id
  return runAutoMode({
    backend: record.backend,
    autoEnabled: record.autoEnabled ?? record.mode === 'auto',
    mode: record.mode,
    resumeSessionId: sessionId,
    cwd: options.cwd || record.cwd,
    plain: Boolean(options.plain),
    model: options.model || record.model,
    prompt: options.prompt,
    goalMode: options.goalMode ?? record.goalMode,
    passthroughArgs: [...record.passthroughArgs],
    runtime: record.runtime,
    transport: record.transport ?? (record.backend === 'linx' ? 'native' : 'acp'),
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
  })
}

export { formatAutoModeSessionSummary }

export function listSupportedAutoModeBackends(): Array<{
  backend: string
  label: string
  description: string
  capabilities: AgentRuntimeCapabilities
  auto: string
}> {
  return [
    {
      backend: linxNativeBackend.backend,
      label: linxNativeBackend.label,
      description: linxNativeBackend.description,
      capabilities: linxNativeBackend.capabilities,
      auto: describeAutoControl(),
    },
    ...listAutoModeHooks().map((hook) => ({
      backend: hook.id,
      label: hook.label,
      description: hook.description,
      capabilities: hook.capabilities,
      auto: describeAutoControl(),
    })),
  ]
}
