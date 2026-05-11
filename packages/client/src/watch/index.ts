export type WatchBackend = 'codex' | 'claude' | 'codebuddy'
export type WatchMode = 'manual' | 'smart' | 'auto'
export type WatchSessionStatus = 'running' | 'completed' | 'failed'
export type WatchOutputStream = 'stdout' | 'stderr' | 'system'
export type WatchCredentialSource = 'auto' | 'local' | 'cloud'
export type WatchResolvedCredentialSource = 'local' | 'cloud'
export type WatchApprovalSource = 'local' | 'remote' | 'hybrid'
export type WatchRuntime = 'local'
export type WatchTransport = 'native' | 'acp'
export type WatchAuthState = 'authenticated' | 'unauthenticated' | 'unknown'

export interface WatchAuthStatus {
  state: WatchAuthState
  message?: string
}

export interface WatchAuthFailure {
  message: string
}

export type WatchCloudCredentialProbeStatus = 'available' | 'unavailable' | 'error'

export interface WatchCloudCredentialProbe {
  status: WatchCloudCredentialProbeStatus
  message?: string
}

export interface WatchCredentialSourceResolution {
  requestedSource: WatchCredentialSource
  resolvedSource?: WatchResolvedCredentialSource
  authStatus: WatchAuthStatus
  error?: string
}

export interface WatchSessionRecord {
  id: string
  backend: WatchBackend
  runtime: WatchRuntime
  transport?: WatchTransport
  mode: WatchMode
  cwd: string
  model?: string
  prompt?: string
  passthroughArgs: string[]
  credentialSource: WatchCredentialSource
  resolvedCredentialSource?: WatchResolvedCredentialSource
  approvalSource?: WatchApprovalSource
  command: string
  args: string[]
  status: WatchSessionStatus
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  signal?: string | null
  error?: string
  backendSessionId?: string
  archiveDir: string
  eventsFile: string
}

export type WatchApprovalRequestKind =
  | 'command-approval'
  | 'file-change-approval'
  | 'permissions-approval'
  | 'codex-approval'

export type WatchInteractionRequestKind = WatchApprovalRequestKind | 'user-input'
export type WatchApprovalDecision = 'accept' | 'accept_for_session' | 'decline' | 'cancel'

interface WatchInteractionRequestBase {
  kind: WatchInteractionRequestKind
  message: string
  raw?: unknown
}

export interface WatchCommandApprovalRequest extends WatchInteractionRequestBase {
  kind: 'command-approval'
  command?: string
  cwd?: string
}

export interface WatchFileChangeApprovalRequest extends WatchInteractionRequestBase {
  kind: 'file-change-approval'
  reason?: string
}

export interface WatchPermissionsApprovalRequest extends WatchInteractionRequestBase {
  kind: 'permissions-approval'
  permissions: Record<string, unknown>
}

export interface WatchCodexApprovalRequest extends WatchInteractionRequestBase {
  kind: 'codex-approval'
}

export interface WatchUserInputOption {
  label: string
  description?: string
}

export interface WatchUserInputQuestion {
  id: string
  header: string
  question: string
  options: WatchUserInputOption[]
}

export interface WatchUserInputRequest extends WatchInteractionRequestBase {
  kind: 'user-input'
  questions: WatchUserInputQuestion[]
}

export type WatchApprovalRequest =
  | WatchCommandApprovalRequest
  | WatchFileChangeApprovalRequest
  | WatchPermissionsApprovalRequest
  | WatchCodexApprovalRequest

export type WatchInteractionRequest = WatchApprovalRequest | WatchUserInputRequest

export interface WatchUserInputAnswerRecord {
  answers: string[]
}

export type WatchUserInputAnswers = Record<string, WatchUserInputAnswerRecord>

export interface WatchToolCallEvent {
  type: 'tool.call'
  name: string
  arguments?: Record<string, unknown>
  raw?: unknown
}

export interface WatchApprovalRequiredEvent {
  type: 'approval.required'
  message: string
  request?: WatchApprovalRequest
  raw?: unknown
}

export interface WatchInputRequiredEvent {
  type: 'input.required'
  message: string
  request: WatchUserInputRequest
  raw?: unknown
}

export interface WatchAssistantDeltaEvent {
  type: 'assistant.delta'
  text: string
  raw?: unknown
}

export interface WatchAssistantDoneEvent {
  type: 'assistant.done'
  text?: string
  raw?: unknown
}

export interface WatchNoteEvent {
  type: 'session.note'
  message: string
  raw?: unknown
}

export type WatchNormalizedEvent =
  | WatchToolCallEvent
  | WatchApprovalRequiredEvent
  | WatchInputRequiredEvent
  | WatchAssistantDeltaEvent
  | WatchAssistantDoneEvent
  | WatchNoteEvent

export interface WatchEventLogEntry {
  timestamp: string
  stream: WatchOutputStream
  line: string
  events: WatchNormalizedEvent[]
}

export interface WatchThreadMetadata extends Record<string, unknown> {
  kind: 'watch'
  delegatedTo: 'secretary'
  sessionId: string
  backend: WatchBackend
  runtime: WatchRuntime
  transport?: WatchTransport
  mode: WatchMode
  cwd: string
  model?: string
  credentialSource: WatchCredentialSource
  resolvedCredentialSource?: WatchResolvedCredentialSource
  approvalSource?: WatchApprovalSource
  status: WatchSessionStatus
  backendSessionId?: string
}

export type WatchTranscriptMessageRole = 'user' | 'assistant' | 'system'

export interface WatchTranscriptMessage {
  role: WatchTranscriptMessageRole
  content: string
  createdAt: string
}

export interface CreateWatchSessionIdOptions {
  now?: Date
  randomId?: string
}

export interface WatchArchiveRelativePaths {
  sessionDir: string
  sessionFile: string
  eventsFile: string
}

export const WATCH_HOME_DIRNAME = 'watch'
export const WATCH_SESSIONS_DIRNAME = 'sessions'
export const WATCH_SESSION_FILE_NAME = 'session.json'
export const WATCH_EVENTS_FILE_NAME = 'events.jsonl'

interface WatchTranscriptState {
  assistantText: string
  assistantTimestamp?: string
}

function fallbackRandomId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0')
}

function extractWatchJsonText(value: unknown, depth = 0): string | undefined {
  if (depth > 4) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractWatchJsonText(item, depth + 1))
      .filter((item): item is string => typeof item === 'string' && item.length > 0)

    return parts.length > 0 ? parts.join('') : undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  return firstNonEmpty([
    extractWatchJsonText(value.text, depth + 1),
    extractWatchJsonText(value.delta, depth + 1),
    extractWatchJsonText(value.message, depth + 1),
    extractWatchJsonText(value.content, depth + 1),
    extractWatchJsonText(value.result, depth + 1),
    extractWatchJsonText(value.summary, depth + 1),
    extractWatchJsonText(value.error, depth + 1),
  ])
}

function extractWatchJsonArguments(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function normalizeWatchUserInputOption(value: unknown): WatchUserInputOption | null {
  if (!isRecord(value)) {
    return null
  }

  const label = firstNonEmpty([
    typeof value.label === 'string' ? value.label : undefined,
    typeof value.value === 'string' ? value.value : undefined,
  ])

  if (!label) {
    return null
  }

  const description = firstNonEmpty([
    typeof value.description === 'string' ? value.description : undefined,
    typeof value.details === 'string' ? value.details : undefined,
  ])

  return {
    label,
    ...(description ? { description } : {}),
  }
}

export function normalizeWatchUserInputQuestion(
  value: unknown,
  fallbackId = 'question-1',
): WatchUserInputQuestion | null {
  if (!isRecord(value)) {
    return null
  }

  const header = firstNonEmpty([
    typeof value.header === 'string' ? value.header : undefined,
    typeof value.title === 'string' ? value.title : undefined,
    typeof value.label === 'string' ? value.label : undefined,
  ]) ?? 'Question'

  const question = firstNonEmpty([
    typeof value.question === 'string' ? value.question : undefined,
    typeof value.prompt === 'string' ? value.prompt : undefined,
    typeof value.message === 'string' ? value.message : undefined,
    header,
  ]) ?? header

  const options = Array.isArray(value.options)
    ? value.options
      .map((option) => normalizeWatchUserInputOption(option))
      .filter((option): option is WatchUserInputOption => option !== null)
    : []

  return {
    id: firstNonEmpty([typeof value.id === 'string' ? value.id : undefined, fallbackId]) ?? fallbackId,
    header,
    question,
    options,
  }
}

export function resolveWatchQuestionAnswer(question: WatchUserInputQuestion, answer: string): string[] {
  const normalized = answer.trim()
  if (!normalized) {
    return []
  }

  if (question.options.length > 0 && /^\d+$/u.test(normalized)) {
    const index = Number(normalized) - 1
    const option = question.options[index]
    if (option?.label) {
      return [option.label]
    }
  }

  return [normalized]
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function extractAcpCommand(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  const record = recordFromUnknown(value)
  if (!record) {
    return undefined
  }

  const command = firstNonEmpty([
    typeof record.command === 'string' ? record.command : undefined,
    typeof record.cmd === 'string' ? record.cmd : undefined,
  ])
  const args = Array.isArray(record.args)
    ? record.args.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  if (command && args.length > 0) {
    return `${command} ${args.join(' ')}`
  }

  return command ?? extractWatchJsonText(record)
}

function normalizeAcpPermissionOptions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is Record<string, unknown> => isRecord(item))
}

function selectAcpPermissionOption(
  options: Array<Record<string, unknown>>,
  decision: WatchApprovalDecision,
): string | undefined {
  if (decision === 'cancel') {
    return undefined
  }

  const preferredKinds = decision === 'accept'
    ? ['allow_once', 'allow_always']
    : decision === 'accept_for_session'
      ? ['allow_always', 'allow_once']
      : ['reject_once', 'reject_always']

  for (const kind of preferredKinds) {
    const match = options.find((option) => option.kind === kind && typeof option.optionId === 'string')
    if (match && typeof match.optionId === 'string') {
      return match.optionId
    }
  }

  const preferredNames = decision === 'decline'
    ? ['reject', 'deny', 'decline', 'no']
    : ['allow', 'approve', 'yes']

  for (const option of options) {
    if (typeof option.optionId !== 'string' || typeof option.name !== 'string') {
      continue
    }

    const name = option.name.toLowerCase()
    if (preferredNames.some((token) => name.includes(token))) {
      return option.optionId
    }
  }

  const fallback = decision === 'decline'
    ? options.find((option) => typeof option.optionId === 'string')
    : options.find((option) => typeof option.optionId === 'string')

  return typeof fallback?.optionId === 'string' ? fallback.optionId : undefined
}

export function createWatchSessionId(options: CreateWatchSessionIdOptions = {}): string {
  const now = options.now ?? new Date()
  const randomId = (options.randomId?.trim() || globalThis.crypto?.randomUUID?.() || fallbackRandomId()).slice(0, 8)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `watch_${stamp}_${randomId}`
}

export function normalizeWatchCredentialSource(source?: WatchCredentialSource | null): WatchCredentialSource {
  return source ?? 'auto'
}

export function shouldAttemptCloudCredentialProbe(
  requestedSource: WatchCredentialSource,
  localAuthStatus: WatchAuthStatus,
): boolean {
  return requestedSource === 'cloud'
    || (requestedSource === 'auto' && localAuthStatus.state === 'unauthenticated')
}

export function formatWatchAutoFallbackMessage(localMessage: string, detail: string): string {
  return `${localMessage} Cloud credential fallback unavailable: ${detail}`
}

export function resolveWatchCredentialSourceResolution(input: {
  requestedSource?: WatchCredentialSource | null
  localAuthStatus: WatchAuthStatus
  cloudCredentialProbe?: WatchCloudCredentialProbe
  defaultLocalMessage?: string
}): WatchCredentialSourceResolution {
  const requestedSource = normalizeWatchCredentialSource(input.requestedSource)
  const localAuthStatus = input.localAuthStatus
  const cloudCredentialProbe = input.cloudCredentialProbe

  if (requestedSource === 'local') {
    return {
      requestedSource,
      resolvedSource: 'local',
      authStatus: localAuthStatus,
    }
  }

  if (requestedSource === 'cloud') {
    if (cloudCredentialProbe?.status === 'available') {
      return {
        requestedSource,
        resolvedSource: 'cloud',
        authStatus: { state: 'authenticated' },
      }
    }

    return {
      requestedSource,
      authStatus: { state: 'unauthenticated', message: cloudCredentialProbe?.message },
      error: cloudCredentialProbe?.message ?? 'Cloud credential resolution unavailable.',
    }
  }

  if (localAuthStatus.state !== 'unauthenticated') {
    return {
      requestedSource,
      resolvedSource: 'local',
      authStatus: localAuthStatus,
    }
  }

  if (cloudCredentialProbe?.status === 'available') {
    return {
      requestedSource,
      resolvedSource: 'cloud',
      authStatus: { state: 'authenticated' },
    }
  }

  const localMessage = localAuthStatus.message ?? input.defaultLocalMessage ?? 'Local authentication unavailable.'
  const detail = cloudCredentialProbe?.message ?? 'Cloud credential fallback unavailable.'

  return {
    requestedSource,
    resolvedSource: 'local',
    authStatus: {
      state: 'unauthenticated',
      message: formatWatchAutoFallbackMessage(localMessage, detail),
    },
  }
}

export function resolveWatchAutoApprovalDecision(input: {
  mode: WatchMode
  request: WatchApprovalRequest
}): WatchApprovalDecision | null {
  const { mode, request } = input

  if (request.kind === 'command-approval') {
    if (mode === 'auto') {
      return 'accept_for_session'
    }

    if (mode === 'smart' && isTrustedWatchCommand(request.command)) {
      return 'accept'
    }

    return null
  }

  if (request.kind === 'file-change-approval') {
    if (mode === 'auto') {
      return 'accept_for_session'
    }

    if (mode === 'smart') {
      return 'accept'
    }

    return null
  }

  if (request.kind === 'permissions-approval') {
    if (mode === 'auto') {
      return 'accept_for_session'
    }

    return null
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function normalizeWatchAuthText(value: unknown, depth = 0): string | undefined {
  if (depth > 5) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeWatchAuthText(item, depth + 1))
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

    return parts.length > 0 ? parts.join(' ') : undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  return firstNonEmpty([
    normalizeWatchAuthText(value.message, depth + 1),
    normalizeWatchAuthText(value.error, depth + 1),
    normalizeWatchAuthText(value.result, depth + 1),
    normalizeWatchAuthText(value.text, depth + 1),
    normalizeWatchAuthText(value.reason, depth + 1),
    normalizeWatchAuthText(value.content, depth + 1),
    normalizeWatchAuthText(value.summary, depth + 1),
  ])
}

export function getWatchAuthLoginCommand(backend: WatchBackend): string | null {
  if (backend === 'claude') {
    return 'claude auth login'
  }

  if (backend === 'codex') {
    return 'codex login'
  }

  return null
}

export function formatWatchBackendAuthMessage(backend: WatchBackend, detail?: string): string {
  const command = getWatchAuthLoginCommand(backend)
  const label = backend === 'claude'
    ? 'Claude Code'
    : backend === 'codebuddy'
      ? 'CodeBuddy Code'
      : 'Codex'

  if (backend === 'codebuddy') {
    return detail
      ? `${label} is not authenticated. Open \`codebuddy\` and complete login first. Native message: ${detail}`
      : `${label} is not authenticated. Open \`codebuddy\` and complete login first.`
  }

  return detail
    ? `${label} is not authenticated. Run \`${command}\` and try again. Native message: ${detail}`
    : `${label} is not authenticated. Run \`${command}\` and try again.`
}

export function looksLikeWatchAuthFailureText(text: string): boolean {
  return [
    /\bnot logged in\b/iu,
    /\bauthentication_failed\b/iu,
    /\bunauthenticated\b/iu,
    /\bauthentication required\b/iu,
    /\bplease run \/login\b/iu,
    /\bplease sign in\b/iu,
    /\bsign in first\b/iu,
    /\blogin required\b/iu,
    /\bunauthorized\b/iu,
    /\binvalid api key\b/iu,
  ].some((pattern) => pattern.test(text))
}

export function parseWatchClaudeAuthStatus(stdout: string): WatchAuthStatus {
  const payload = parseWatchJsonLine(stdout.trim())
  if (!payload || typeof payload.loggedIn !== 'boolean') {
    return { state: 'unknown' }
  }

  return payload.loggedIn
    ? { state: 'authenticated' }
    : { state: 'unauthenticated', message: formatWatchBackendAuthMessage('claude') }
}

export function detectWatchAuthFailure(backend: WatchBackend, line: string): WatchAuthFailure | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const payload = parseWatchJsonLine(trimmed)
  if (payload) {
    if (backend === 'claude' && payload.error === 'authentication_failed') {
      const detail = normalizeWatchAuthText(payload) ?? 'authentication_failed'
      return { message: formatWatchBackendAuthMessage(backend, detail) }
    }

    if (backend === 'claude' && payload.loggedIn === false) {
      return { message: formatWatchBackendAuthMessage(backend) }
    }

    if (payload.error) {
      const detail = normalizeWatchAuthText(payload.error) ?? normalizeWatchAuthText(payload)
      if (detail && looksLikeWatchAuthFailureText(detail)) {
        return { message: formatWatchBackendAuthMessage(backend, detail) }
      }
    }

    if (payload.is_error === true) {
      const detail = normalizeWatchAuthText(payload)
      if (detail && looksLikeWatchAuthFailureText(detail)) {
        return { message: formatWatchBackendAuthMessage(backend, detail) }
      }
    }

    const detail = normalizeWatchAuthText(payload)
    if (detail && looksLikeWatchAuthFailureText(detail)) {
      return { message: formatWatchBackendAuthMessage(backend, detail) }
    }
  }

  if (!looksLikeWatchAuthFailureText(trimmed)) {
    return null
  }

  return { message: formatWatchBackendAuthMessage(backend, trimmed) }
}

export function parseWatchJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function extractWatchSessionIdFromJsonLine(line: string): string | undefined {
  const json = parseWatchJsonLine(line)
  if (!json) {
    return undefined
  }

  return firstNonEmpty([
    typeof json.session_id === 'string' ? json.session_id : undefined,
    typeof json.sessionId === 'string' ? json.sessionId : undefined,
    isRecord(json.message) && typeof json.message.session_id === 'string' ? json.message.session_id : undefined,
    isRecord(json.message) && typeof json.message.sessionId === 'string' ? json.message.sessionId : undefined,
  ])
}

export function isTrustedWatchCommand(command: string | null | undefined): boolean {
  if (!command) {
    return false
  }

  const normalized = command.trim()
  const safePatterns = [
    /^pwd(?:\s|$)/,
    /^ls(?:\s|$)/,
    /^cat(?:\s|$)/,
    /^sed(?:\s|$)/,
    /^head(?:\s|$)/,
    /^tail(?:\s|$)/,
    /^wc(?:\s|$)/,
    /^sort(?:\s|$)/,
    /^uniq(?:\s|$)/,
    /^find(?:\s|$)/,
    /^grep(?:\s|$)/,
    /^rg(?:\s|$)/,
    /^git status(?:\s|$)/,
    /^git diff(?:\s|$)/,
    /^git log(?:\s|$)/,
  ]

  return safePatterns.some((pattern) => pattern.test(normalized))
}

export function normalizeCodexAppServerInteractionRequest(message: Record<string, unknown>): WatchInteractionRequest | null {
  const method = typeof message.method === 'string' ? message.method : ''
  const params = (typeof message.params === 'object' && message.params !== null
    ? message.params
    : {}) as Record<string, unknown>

  if (method === 'item/commandExecution/requestApproval') {
    const command = typeof params.command === 'string' ? params.command : undefined
    const cwd = typeof params.cwd === 'string' ? params.cwd : undefined

    return {
      kind: 'command-approval',
      message: command || 'Codex requests command approval',
      command,
      cwd,
      raw: message,
    }
  }

  if (method === 'item/fileChange/requestApproval') {
    const reason = typeof params.reason === 'string' ? params.reason : undefined

    return {
      kind: 'file-change-approval',
      message: reason && reason.trim() ? reason : 'Codex requests file-change approval',
      ...(reason ? { reason } : {}),
      raw: message,
    }
  }

  if (method === 'item/permissions/requestApproval') {
    const reason = typeof params.reason === 'string' ? params.reason : undefined
    const permissions = isRecord(params.permissions) ? params.permissions : {}

    return {
      kind: 'permissions-approval',
      message: reason && reason.trim() ? reason : 'Codex requests additional permissions',
      permissions,
      raw: message,
    }
  }

  if (method === 'item/tool/requestUserInput') {
    const questions = Array.isArray(params.questions)
      ? params.questions
        .map((question, index) => normalizeWatchUserInputQuestion(question, `question-${index + 1}`))
        .filter((question): question is WatchUserInputQuestion => question !== null)
      : []

    return {
      kind: 'user-input',
      message: 'Codex requests structured user input',
      questions,
      raw: message,
    }
  }

  if (method === 'applyPatchApproval' || method === 'execCommandApproval') {
    return {
      kind: 'codex-approval',
      message: 'Codex requests approval',
      raw: message,
    }
  }

  return null
}

export function resolveWatchInteractionAutoResponse(input: {
  mode: WatchMode
  request: WatchInteractionRequest
}): unknown | null {
  const { mode, request } = input

  if (request.kind === 'user-input' || request.kind === 'codex-approval') {
    return null
  }

  const decision = resolveWatchAutoApprovalDecision({
    mode,
    request,
  })

  if (!decision) {
    return null
  }

  return buildCodexApprovalResponse(request, decision)
}

export function buildCodexApprovalResponse(
  request: WatchApprovalRequest,
  decision: WatchApprovalDecision,
): unknown {
  if (request.kind === 'permissions-approval') {
    if (decision === 'accept') {
      return { permissions: request.permissions, scope: 'turn' }
    }

    if (decision === 'accept_for_session') {
      return { permissions: request.permissions, scope: 'session' }
    }

    return { permissions: {}, scope: 'turn' }
  }

  if (request.kind === 'codex-approval') {
    if (decision === 'accept') {
      return { decision: 'approved' }
    }

    if (decision === 'accept_for_session') {
      return { decision: 'approved_for_session' }
    }

    if (decision === 'cancel') {
      return { decision: 'abort' }
    }

    return { decision: 'denied' }
  }

  if (decision === 'accept') {
    return { decision: 'accept' }
  }

  if (decision === 'accept_for_session') {
    return { decision: 'acceptForSession' }
  }

  if (decision === 'cancel') {
    return { decision: 'cancel' }
  }

  return { decision: 'decline' }
}

export function buildCodexUserInputResponse(answers: WatchUserInputAnswers): { answers: WatchUserInputAnswers } {
  return { answers }
}

export function buildWatchUserInputResponse(answers: WatchUserInputAnswers): { answers: WatchUserInputAnswers } {
  return buildCodexUserInputResponse(answers)
}

export function normalizeAcpInteractionRequest(message: Record<string, unknown>): WatchInteractionRequest | null {
  const method = typeof message.method === 'string' ? message.method.toLowerCase() : ''
  const params = (recordFromUnknown(message.params) ?? {}) as Record<string, unknown>

  if (method === 'session/request_permission' || Array.isArray(params.options)) {
    const toolCall = (recordFromUnknown(params.toolCall) ?? {}) as Record<string, unknown>
    const toolKind = typeof toolCall.kind === 'string' ? toolCall.kind : ''
    const command = extractAcpCommand(toolCall.rawInput)
    const cwd = firstNonEmpty([
      typeof toolCall.cwd === 'string' ? toolCall.cwd : undefined,
      recordFromUnknown(toolCall.rawInput) && typeof recordFromUnknown(toolCall.rawInput)?.cwd === 'string'
        ? recordFromUnknown(toolCall.rawInput)?.cwd as string
        : undefined,
    ])
    const messageText = firstNonEmpty([
      typeof toolCall.title === 'string' ? toolCall.title : undefined,
      command,
      extractWatchJsonText(toolCall),
      method || undefined,
    ]) ?? 'Approval required'

    if (toolKind === 'execute' || command) {
      return {
        kind: 'command-approval',
        message: command ?? messageText,
        ...(command ? { command } : {}),
        ...(cwd ? { cwd } : {}),
        raw: message,
      }
    }

    if (toolKind === 'edit' || toolKind === 'delete' || toolKind === 'move') {
      return {
        kind: 'file-change-approval',
        message: messageText,
        reason: messageText,
        raw: message,
      }
    }

    return {
      kind: 'permissions-approval',
      message: messageText,
      permissions: recordFromUnknown(toolCall.rawInput) ?? {},
      raw: message,
    }
  }

  const looksLikeInput = method.includes('request_input')
    || method.includes('requestuserinput')
    || method.includes('user_input')
    || Array.isArray(params.questions)

  if (!looksLikeInput) {
    return null
  }

  const questions = Array.isArray(params.questions)
    ? params.questions
      .map((question, index) => normalizeWatchUserInputQuestion(question, `question-${index + 1}`))
      .filter((question): question is WatchUserInputQuestion => question !== null)
    : []

  return {
    kind: 'user-input',
    message: firstNonEmpty([
      extractWatchJsonText(params.message),
      extractWatchJsonText(params.prompt),
      extractWatchJsonText(params.question),
      questions[0]?.question,
    ]) ?? 'Input required',
    questions,
    raw: message,
  }
}

export function normalizeAcpRequest(message: Record<string, unknown>): WatchNormalizedEvent[] {
  const interaction = normalizeAcpInteractionRequest(message)
  if (!interaction) {
    return []
  }

  if (interaction.kind === 'user-input') {
    return [{
      type: 'input.required',
      message: interaction.message,
      request: interaction,
      raw: message,
    }]
  }

  const events: WatchNormalizedEvent[] = [{
    type: 'approval.required',
    message: interaction.message,
    request: interaction,
    raw: message,
  }]

  if (interaction.kind === 'command-approval' && interaction.command) {
    events.push({
      type: 'tool.call',
      name: 'commandExecution',
      arguments: {
        command: interaction.command,
        cwd: interaction.cwd,
      },
      raw: message,
    })
  }

  return events
}

function normalizeAcpToolCallEvent(
  update: Record<string, unknown>,
  raw: Record<string, unknown>,
): WatchToolCallEvent | null {
  const name = firstNonEmpty([
    typeof update.title === 'string' ? update.title : undefined,
    typeof update.kind === 'string' ? update.kind : undefined,
    typeof update.toolCallId === 'string' ? update.toolCallId : undefined,
  ])

  if (!name) {
    return null
  }

  return {
    type: 'tool.call',
    name,
    arguments: extractWatchJsonArguments(update.rawInput),
    raw,
  }
}

export function normalizeAcpSessionNotification(message: Record<string, unknown>): WatchNormalizedEvent[] {
  const method = typeof message.method === 'string' ? message.method : ''
  const params = (recordFromUnknown(message.params) ?? {}) as Record<string, unknown>

  if (method !== 'session/update') {
    return []
  }

  const update = (recordFromUnknown(params.update) ?? {}) as Record<string, unknown>
  const updateType = firstNonEmpty([
    typeof update.sessionUpdate === 'string' ? update.sessionUpdate : undefined,
    typeof update.type === 'string' ? update.type : undefined,
  ])?.toLowerCase() ?? ''

  if (updateType === 'agent_message_chunk') {
    const text = extractWatchJsonText(update.content ?? update)
    return text ? [{ type: 'assistant.delta', text, raw: message }] : []
  }

  if (updateType === 'agent_thought_chunk') {
    const text = extractWatchJsonText(update.content ?? update)
    return text ? [{ type: 'session.note', message: text, raw: message }] : []
  }

  if (updateType === 'tool_call' || updateType === 'tool_call_update') {
    const toolEvent = normalizeAcpToolCallEvent(update, message)
    if (toolEvent) {
      return [toolEvent]
    }
  }

  const text = extractWatchJsonText(update)
  if (!text) {
    return []
  }

  return [{
    type: 'session.note',
    message: text,
    raw: message,
  }]
}

export function buildAcpPermissionResponse(
  request: WatchApprovalRequest,
  decision: WatchApprovalDecision,
): { outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' } } {
  if (decision === 'cancel') {
    return {
      outcome: { outcome: 'cancelled' },
    }
  }

  const raw = recordFromUnknown(request.raw)
  const params = recordFromUnknown(raw?.params) ?? {}
  const optionId = selectAcpPermissionOption(
    normalizeAcpPermissionOptions(params.options),
    decision,
  )

  if (!optionId) {
    return {
      outcome: { outcome: 'cancelled' },
    }
  }

  return {
    outcome: {
      outcome: 'selected',
      optionId,
    },
  }
}

function maybeWatchToolEvent(json: Record<string, unknown>, lowerType: string): WatchNormalizedEvent | null {
  const toolName = firstNonEmpty([
    typeof json.toolName === 'string' ? json.toolName : undefined,
    typeof json.name === 'string' ? json.name : undefined,
    typeof json.tool === 'string' ? json.tool : undefined,
    isRecord(json.tool) && typeof json.tool.name === 'string' ? json.tool.name : undefined,
    typeof json.command === 'string' ? json.command : undefined,
  ])

  const looksLikeTool = lowerType.includes('tool')
    || lowerType.includes('command')
    || lowerType.includes('function_call')
    || (toolName !== undefined && !lowerType.includes('approval'))

  if (!looksLikeTool || !toolName) {
    return null
  }

  return {
    type: 'tool.call',
    name: toolName,
    arguments: extractWatchJsonArguments(json.arguments ?? json.args ?? json.input),
    raw: json,
  }
}

function maybeWatchInputEvent(json: Record<string, unknown>, lowerType: string): WatchInputRequiredEvent | null {
  const looksLikeInput = lowerType.includes('request_user_input')
    || lowerType.includes('user_input')
    || Array.isArray(json.questions)

  if (!looksLikeInput) {
    return null
  }

  const questions = Array.isArray(json.questions)
    ? json.questions
      .map((question, index) => normalizeWatchUserInputQuestion(question, `question-${index + 1}`))
      .filter((question): question is WatchUserInputQuestion => question !== null)
    : []

  const message = firstNonEmpty([
    extractWatchJsonText(json.message),
    extractWatchJsonText(json.prompt),
    extractWatchJsonText(json.question),
    extractWatchJsonText(json.description),
  ]) || 'Input required'

  const request: WatchUserInputRequest = {
    kind: 'user-input',
    message,
    questions,
    raw: json,
  }

  return {
    type: 'input.required',
    message,
    request,
    raw: json,
  }
}

function maybeWatchApprovalEvent(json: Record<string, unknown>, lowerType: string): WatchNormalizedEvent | null {
  const looksLikeApproval = lowerType.includes('approval')
    || lowerType.includes('permission')
    || isRecord(json.permissions)

  if (!looksLikeApproval) {
    return null
  }

  const message = firstNonEmpty([
    extractWatchJsonText(json.message),
    extractWatchJsonText(json.reason),
    extractWatchJsonText(json.prompt),
    extractWatchJsonText(json.question),
    extractWatchJsonText(json.description),
    lowerType || undefined,
  ])

  return {
    type: 'approval.required',
    message: message || 'Approval required',
    ...(isRecord(json.permissions)
      ? {
        request: {
          kind: 'permissions-approval' as const,
          message: message || 'Approval required',
          permissions: json.permissions,
          raw: json,
        },
      }
      : {}),
    raw: json,
  }
}

function maybeWatchAssistantDoneEvent(json: Record<string, unknown>, lowerType: string): WatchNormalizedEvent | null {
  const isDone = lowerType.includes('done')
    || lowerType.includes('completed')
    || lowerType === 'result'
    || lowerType.endsWith('.result')
    || lowerType.endsWith('.done')

  if (!isDone) {
    return null
  }

  return {
    type: 'assistant.done',
    text: extractWatchJsonText(json),
    raw: json,
  }
}

function maybeWatchAssistantDeltaEvent(json: Record<string, unknown>, lowerType: string): WatchNormalizedEvent | null {
  const isDelta = lowerType.includes('delta')
    || lowerType.includes('assistant')
    || lowerType.includes('message')
    || lowerType.includes('content_block')
    || lowerType.includes('text')

  if (!isDelta) {
    return null
  }

  const text = firstNonEmpty([
    extractWatchJsonText(json.delta),
    extractWatchJsonText(json.text),
    extractWatchJsonText(json.message),
    extractWatchJsonText(json.content),
  ])

  if (!text) {
    return null
  }

  return {
    type: 'assistant.delta',
    text,
    raw: json,
  }
}

export function parseWatchJsonProtocolLine(line: string): WatchNormalizedEvent[] {
  const json = parseWatchJsonLine(line)
  if (!json) {
    return []
  }

  const lowerType = typeof json.type === 'string' ? json.type.toLowerCase() : ''
  const events: WatchNormalizedEvent[] = []

  const inputEvent = maybeWatchInputEvent(json, lowerType)
  if (inputEvent) {
    events.push(inputEvent)
  }

  const approvalEvent = maybeWatchApprovalEvent(json, lowerType)
  if (approvalEvent) {
    events.push(approvalEvent)
  }

  const toolEvent = maybeWatchToolEvent(json, lowerType)
  if (toolEvent) {
    events.push(toolEvent)
  }

  const doneEvent = maybeWatchAssistantDoneEvent(json, lowerType)
  if (doneEvent) {
    events.push(doneEvent)
  } else {
    const deltaEvent = maybeWatchAssistantDeltaEvent(json, lowerType)
    if (deltaEvent) {
      events.push(deltaEvent)
    }
  }

  if (events.length === 0) {
    const text = extractWatchJsonText(json)
    if (text) {
      events.push({
        type: 'session.note',
        message: text,
        raw: json,
      })
    }
  }

  return events
}

function normalizeCodexThreadItem(item: Record<string, unknown>, raw: Record<string, unknown>): WatchNormalizedEvent[] {
  const type = typeof item.type === 'string' ? item.type : ''

  if (type === 'commandExecution') {
    return [{
      type: 'tool.call',
      name: 'commandExecution',
      arguments: {
        command: item.command,
        cwd: item.cwd,
        status: item.status,
      },
      raw,
    }]
  }

  if (type === 'fileChange') {
    return [{
      type: 'tool.call',
      name: 'fileChange',
      arguments: {
        status: item.status,
      },
      raw,
    }]
  }

  if (type === 'mcpToolCall' || type === 'dynamicToolCall') {
    return [{
      type: 'tool.call',
      name: typeof item.tool === 'string' ? item.tool : type,
      arguments: (typeof item.arguments === 'object' && item.arguments !== null ? item.arguments : undefined) as Record<string, unknown> | undefined,
      raw,
    }]
  }

  return []
}

export function normalizeCodexAppServerNotification(message: Record<string, unknown>): WatchNormalizedEvent[] {
  const method = typeof message.method === 'string' ? message.method : ''
  const params = (typeof message.params === 'object' && message.params !== null
    ? message.params
    : {}) as Record<string, unknown>

  if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    return [{ type: 'assistant.delta', text: params.delta, raw: message }]
  }

  if (method === 'turn/completed') {
    return [{ type: 'assistant.done', raw: message }]
  }

  if (
    (method === 'item/commandExecution/outputDelta' || method === 'item/reasoning/textDelta' || method === 'item/reasoning/summaryTextDelta')
    && typeof params.delta === 'string'
  ) {
    return [{ type: 'session.note', message: params.delta, raw: message }]
  }

  if (method === 'item/started' || method === 'item/completed') {
    const item = (typeof params.item === 'object' && params.item !== null ? params.item : {}) as Record<string, unknown>
    return normalizeCodexThreadItem(item, message)
  }

  if (method === 'error') {
    return [{
      type: 'session.note',
      message: extractWatchJsonText(params.error) || 'Codex error',
      raw: message,
    }]
  }

  return []
}

export function normalizeCodexAppServerRequest(message: Record<string, unknown>): WatchNormalizedEvent[] {
  const method = typeof message.method === 'string' ? message.method : ''
  const params = (typeof message.params === 'object' && message.params !== null
    ? message.params
    : {}) as Record<string, unknown>

  const interaction = normalizeCodexAppServerInteractionRequest(message)
  if (interaction?.kind === 'user-input') {
    return [{
      type: 'input.required',
      message: interaction.message,
      request: interaction,
      raw: message,
    }]
  }

  if (interaction) {
    const events: WatchNormalizedEvent[] = [{
      type: 'approval.required',
      message: interaction.message,
      request: interaction,
      raw: message,
    }]

    if (interaction.kind === 'command-approval' && interaction.command) {
      events.push({
        type: 'tool.call',
        name: 'commandExecution',
        arguments: {
          command: interaction.command,
          cwd: interaction.cwd,
        },
        raw: message,
      })
    }

    return events
  }

  if (method === 'item/tool/call') {
    return [{
      type: 'tool.call',
      name: typeof params.tool === 'string' ? params.tool : 'dynamicToolCall',
      arguments: (typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : undefined) as Record<string, unknown> | undefined,
      raw: message,
    }]
  }

  return []
}

export function getWatchArchiveRelativePaths(sessionId: string): WatchArchiveRelativePaths {
  const normalizedId = sessionId.trim()
  const sessionDir = `${WATCH_SESSIONS_DIRNAME}/${normalizedId}`

  return {
    sessionDir,
    sessionFile: `${sessionDir}/${WATCH_SESSION_FILE_NAME}`,
    eventsFile: `${sessionDir}/${WATCH_EVENTS_FILE_NAME}`,
  }
}

export function buildWatchThreadMetadata(record: WatchSessionRecord): WatchThreadMetadata {
  return {
    kind: 'watch',
    delegatedTo: 'secretary',
    sessionId: record.id,
    backend: record.backend,
    runtime: record.runtime,
    transport: record.transport,
    mode: record.mode,
    cwd: record.cwd,
    model: record.model,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalSource: record.approvalSource,
    status: record.status,
    backendSessionId: record.backendSessionId,
  }
}

function pushWatchTranscriptMessage(
  messages: WatchTranscriptMessage[],
  role: WatchTranscriptMessageRole,
  content: string | undefined,
  createdAt: string,
): void {
  const normalized = content?.replace(/\r/g, '').trimEnd()
  if (!normalized) {
    return
  }

  messages.push({
    role,
    content: normalized,
    createdAt,
  })
}

function flushWatchAssistantMessage(
  messages: WatchTranscriptMessage[],
  state: WatchTranscriptState,
  fallbackTimestamp: string,
): void {
  if (!state.assistantText.trim()) {
    state.assistantText = ''
    state.assistantTimestamp = undefined
    return
  }

  pushWatchTranscriptMessage(
    messages,
    'assistant',
    state.assistantText,
    state.assistantTimestamp ?? fallbackTimestamp,
  )
  state.assistantText = ''
  state.assistantTimestamp = undefined
}

function appendWatchTranscriptEvent(
  messages: WatchTranscriptMessage[],
  state: WatchTranscriptState,
  entry: WatchEventLogEntry,
  event: WatchNormalizedEvent,
): void {
  if (event.type === 'assistant.delta') {
    if (!state.assistantTimestamp) {
      state.assistantTimestamp = entry.timestamp
    }

    state.assistantText += event.text
    return
  }

  if (event.type === 'assistant.done') {
    if (event.text && !state.assistantText) {
      pushWatchTranscriptMessage(messages, 'assistant', event.text, entry.timestamp)
      return
    }

    flushWatchAssistantMessage(messages, state, entry.timestamp)
    return
  }

  flushWatchAssistantMessage(messages, state, entry.timestamp)

  if (event.type === 'tool.call') {
    pushWatchTranscriptMessage(
      messages,
      'system',
      `[tool] ${event.name}${event.arguments ? ` ${JSON.stringify(event.arguments)}` : ''}`,
      entry.timestamp,
    )
    return
  }

  if (event.type === 'approval.required') {
    pushWatchTranscriptMessage(messages, 'system', `[approval] ${event.message}`, entry.timestamp)
    return
  }

  if (event.type === 'input.required') {
    pushWatchTranscriptMessage(messages, 'system', `[input] ${event.message}`, entry.timestamp)
    return
  }

  pushWatchTranscriptMessage(messages, 'system', `[note] ${event.message}`, entry.timestamp)
}

function appendWatchTranscriptRawEntry(
  messages: WatchTranscriptMessage[],
  entry: WatchEventLogEntry,
): void {
  const trimmed = entry.line.trim()
  if (!trimmed) {
    return
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const type = typeof parsed.type === 'string' ? parsed.type : ''

    if (type === 'user.turn' && typeof parsed.text === 'string') {
      pushWatchTranscriptMessage(messages, 'user', parsed.text, entry.timestamp)
      return
    }

    if (type === 'turn.start') {
      const command = typeof parsed.command === 'string' ? parsed.command : 'unknown'
      const args = Array.isArray(parsed.args)
        ? parsed.args.filter((value): value is string => typeof value === 'string')
        : []
      pushWatchTranscriptMessage(messages, 'system', `[turn] ${[command, ...args].join(' ').trim()}`, entry.timestamp)
      return
    }

    if (type === 'credentials.resolve') {
      const requested = typeof parsed.requestedCredentialSource === 'string' ? parsed.requestedCredentialSource : 'auto'
      const resolved = typeof parsed.resolvedCredentialSource === 'string' ? parsed.resolvedCredentialSource : requested
      pushWatchTranscriptMessage(messages, 'system', `[credentials] ${requested} -> ${resolved}`, entry.timestamp)
      return
    }

    if (type === 'process.error' && typeof parsed.message === 'string') {
      pushWatchTranscriptMessage(messages, 'system', `[error] ${parsed.message}`, entry.timestamp)
      return
    }
  } catch {
    // Keep original line when it is not structured JSON.
  }

  pushWatchTranscriptMessage(
    messages,
    'system',
    entry.stream === 'stderr' ? `stderr> ${trimmed}` : trimmed,
    entry.timestamp,
  )
}

export function buildWatchTranscriptMessages(entries: WatchEventLogEntry[]): WatchTranscriptMessage[] {
  const messages: WatchTranscriptMessage[] = []
  const state: WatchTranscriptState = {
    assistantText: '',
  }

  for (const entry of entries) {
    if (entry.events.length > 0) {
      for (const event of entry.events) {
        appendWatchTranscriptEvent(messages, state, entry, event)
      }
      continue
    }

    flushWatchAssistantMessage(messages, state, entry.timestamp)
    appendWatchTranscriptRawEntry(messages, entry)
  }

  flushWatchAssistantMessage(messages, state, new Date().toISOString())
  return messages
}
