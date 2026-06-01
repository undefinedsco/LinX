export type AutoModeBackend = 'linx' | 'codex' | 'claude' | 'codebuddy'
export type AutoModeWorkerBackend = Exclude<AutoModeBackend, 'linx'>
export type AutoModeMode = 'off' | 'auto'
export type LegacyAutoModeMode = AutoModeMode | 'manual' | 'smart'
export type AutoModeSessionStatus = 'running' | 'completed' | 'failed'
export type AutoModeOutputStream = 'stdout' | 'stderr' | 'system'
export type AutoModeCredentialSource = 'cloud'
export type AutoModeResolvedCredentialSource = 'cloud'
type LegacyAutoModeCredentialSource = AutoModeCredentialSource | 'auto' | 'local'
export type AutoModeApprovalSource = 'local' | 'remote' | 'hybrid'
export type AutoModeRuntime = 'local'
export type AutoModeTransport = 'native' | 'acp'
export type AutoModeAuthState = 'authenticated' | 'unauthenticated' | 'unknown'

export interface AutoModeAuthStatus {
  state: AutoModeAuthState
  message?: string
}

export interface AutoModeAuthFailure {
  message: string
}

export type AutoModeCloudCredentialProbeStatus = 'available' | 'unavailable' | 'error'

export interface AutoModeCloudCredentialProbe {
  status: AutoModeCloudCredentialProbeStatus
  message?: string
}

export interface AutoModeCredentialSourceResolution {
  requestedSource: AutoModeCredentialSource
  resolvedSource?: AutoModeResolvedCredentialSource
  authStatus: AutoModeAuthStatus
  error?: string
}

export interface AutoModeSessionRecord {
  id: string
  backend: AutoModeBackend
  runtime: AutoModeRuntime
  transport?: AutoModeTransport
  mode: LegacyAutoModeMode
  autoEnabled?: boolean
  goalMode?: boolean
  cwd: string
  model?: string
  prompt?: string
  passthroughArgs: string[]
  credentialSource: AutoModeCredentialSource
  resolvedCredentialSource?: AutoModeResolvedCredentialSource
  approvalSource?: AutoModeApprovalSource
  command: string
  args: string[]
  status: AutoModeSessionStatus
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  signal?: string | null
  error?: string
  backendSessionId?: string
  metadata?: Record<string, unknown>
  archiveDir: string
  eventsFile: string
}

export type AutoModeApprovalRequestKind =
  | 'command-approval'
  | 'file-change-approval'
  | 'permissions-approval'
  | 'codex-approval'

export type AutoModeInteractionRequestKind = AutoModeApprovalRequestKind | 'user-input'
export type AutoModeApprovalDecision = 'accept' | 'accept_for_session' | 'accept_always' | 'decline' | 'cancel'
export type AutoModeSecretaryApprovalDecision = 'accept' | 'decline' | 'cancel'
export type AutoModeApprovalOptionKind = 'allow_once' | 'allow_for_session' | 'allow_always' | 'reject_once' | 'reject_always' | (string & {})
export type AutoModeApprovalRisk = 'low' | 'medium' | 'high'
export type AutoModeGrantScope = 'session' | 'durable'

export interface AutoModeApprovalOption {
  optionId: string
  label: string
  kind?: AutoModeApprovalOptionKind
  description?: string
}

export type AutoModeStoredApprovalStatus = 'pending' | 'approved' | 'rejected' | (string & {})

export interface AutoModeApprovalDecisionReason {
  source?: string
  decision?: AutoModeApprovalDecision
  note?: string
  selectedOptionId?: string
  selectedLabel?: string
}

export interface BuildAutoModeApprovalDecisionReasonOptions {
  source?: string
  decision?: AutoModeApprovalDecision
  note?: string
  selectedOption?: AutoModeApprovalOption
  selectedOptionId?: string
  selectedLabel?: string
}

interface AutoModeInteractionRequestBase {
  kind: AutoModeInteractionRequestKind
  message: string
  approvalOptions?: AutoModeApprovalOption[]
  timeoutMs?: number
  expiresAt?: string
  raw?: unknown
}

export interface AutoModeCommandApprovalRequest extends AutoModeInteractionRequestBase {
  kind: 'command-approval'
  command?: string
  cwd?: string
}

export interface AutoModeFileChangeApprovalRequest extends AutoModeInteractionRequestBase {
  kind: 'file-change-approval'
  reason?: string
}

export interface AutoModePermissionsApprovalRequest extends AutoModeInteractionRequestBase {
  kind: 'permissions-approval'
  permissions: Record<string, unknown>
}

export interface AutoModeCodexApprovalRequest extends AutoModeInteractionRequestBase {
  kind: 'codex-approval'
}

export interface AutoModeUserInputOption {
  label: string
  description?: string
}

export interface AutoModeUserInputQuestion {
  id: string
  header: string
  question: string
  options: AutoModeUserInputOption[]
}

export interface AutoModeUserInputRequest extends AutoModeInteractionRequestBase {
  kind: 'user-input'
  questions: AutoModeUserInputQuestion[]
}

export type AutoModeApprovalRequest =
  | AutoModeCommandApprovalRequest
  | AutoModeFileChangeApprovalRequest
  | AutoModePermissionsApprovalRequest
  | AutoModeCodexApprovalRequest

export type AutoModeInteractionRequest = AutoModeApprovalRequest | AutoModeUserInputRequest

export interface AutoModeUserInputAnswerRecord {
  answers: string[]
}

export type AutoModeUserInputAnswers = Record<string, AutoModeUserInputAnswerRecord>

export type AutoModeSecretaryRecommendationSource = 'model' | 'fallback'

export interface AutoModeSecretaryRecommendationBase {
  kind: AutoModeInteractionRequestKind
  canAutoDecide: boolean
  confidence?: number
  reason?: string
  reactionWindowMs?: number
  source?: AutoModeSecretaryRecommendationSource
}

export interface AutoModeSecretaryApprovalRecommendation extends AutoModeSecretaryRecommendationBase {
  kind: AutoModeApprovalRequestKind
  decision?: AutoModeSecretaryApprovalDecision
}

export interface AutoModeSecretaryUserInputRecommendation extends AutoModeSecretaryRecommendationBase {
  kind: 'user-input'
  answers?: AutoModeUserInputAnswers
}

export type AutoModeSecretaryRecommendation =
  | AutoModeSecretaryApprovalRecommendation
  | AutoModeSecretaryUserInputRecommendation

export interface AutoModeGrantCoverageDecision {
  covers: boolean
  confidence?: number
  reason?: string
  source?: AutoModeSecretaryRecommendationSource
}

export function autoModeApprovalActionUri(request: AutoModeApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return 'https://undefineds.co/ns#commandExecution'
  }

  if (request.kind === 'file-change-approval') {
    return 'https://undefineds.co/ns#fileChange'
  }

  if (request.kind === 'permissions-approval') {
    return 'https://undefineds.co/ns#permissionRequest'
  }

  return 'https://undefineds.co/ns#runtimeApproval'
}

export function autoModeApprovalToolName(request: AutoModeApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return 'commandExecution'
  }

  if (request.kind === 'file-change-approval') {
    return 'fileChange'
  }

  if (request.kind === 'permissions-approval') {
    return 'permissionRequest'
  }

  return 'runtimeApproval'
}

export function autoModeApprovalRisk(request: AutoModeApprovalRequest): AutoModeApprovalRisk {
  if (request.kind === 'permissions-approval' || request.kind === 'file-change-approval') {
    return 'high'
  }

  return 'medium'
}

export function autoModeApprovalRequestMessage(request: AutoModeApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return request.command?.trim() || request.message
  }

  if (request.kind === 'file-change-approval') {
    return request.reason?.trim() || request.message
  }

  return request.message
}

export interface ParseAutoModeSecretaryRecommendationOptions {
  mode: LegacyAutoModeMode
  autoEnabled?: boolean
  request: AutoModeInteractionRequest
  defaultReactionWindowMs?: number
}

export const DEFAULT_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS = 5_000
export const MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS = 5_000
export const MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS = 60_000

export interface AutoModeToolCallEvent {
  type: 'tool.call'
  name: string
  arguments?: Record<string, unknown>
  raw?: unknown
}

export interface AutoModeApprovalRequiredEvent {
  type: 'approval.required'
  message: string
  request?: AutoModeApprovalRequest
  raw?: unknown
}

export interface AutoModeInputRequiredEvent {
  type: 'input.required'
  message: string
  request: AutoModeUserInputRequest
  raw?: unknown
}

export interface AutoModeAssistantDeltaEvent {
  type: 'assistant.delta'
  text: string
  raw?: unknown
}

export interface AutoModeAssistantDoneEvent {
  type: 'assistant.done'
  text?: string
  raw?: unknown
}

export interface AutoModeNoteEvent {
  type: 'session.note'
  message: string
  raw?: unknown
}

export type AutoModeNormalizedEvent =
  | AutoModeToolCallEvent
  | AutoModeApprovalRequiredEvent
  | AutoModeInputRequiredEvent
  | AutoModeAssistantDeltaEvent
  | AutoModeAssistantDoneEvent
  | AutoModeNoteEvent

export interface AutoModeEventLogEntry {
  timestamp: string
  stream: AutoModeOutputStream
  line: string
  events: AutoModeNormalizedEvent[]
}

export interface AutoModeThreadMetadata extends Record<string, unknown> {
  kind: 'auto-mode'
  delegatedTo: 'secretary'
  sessionId: string
  backend: AutoModeBackend
  runtime: AutoModeRuntime
  transport?: AutoModeTransport
  mode: LegacyAutoModeMode
  autoEnabled?: boolean
  goalMode?: boolean
  cwd: string
  model?: string
  credentialSource: AutoModeCredentialSource
  resolvedCredentialSource?: AutoModeResolvedCredentialSource
  approvalSource?: AutoModeApprovalSource
  status: AutoModeSessionStatus
  backendSessionId?: string
}

export type AutoModeTranscriptMessageRole = 'user' | 'assistant' | 'system'
export type AutoModeTranscriptMessageSource =
  | 'user'
  | 'primary-agent'
  | 'secretary'
  | 'tool'
  | 'system'

export interface AutoModeTranscriptMessage {
  role: AutoModeTranscriptMessageRole
  source: AutoModeTranscriptMessageSource
  content: string
  createdAt: string
}

export interface CreateAutoModeSessionIdOptions {
  now?: Date
  randomId?: string
}

export interface AutoModeArchiveRelativePaths {
  sessionDir: string
  sessionFile: string
  eventsFile: string
}

export const AUTO_MODE_HOME_DIRNAME = 'auto-mode'
export const AUTO_MODE_SESSIONS_DIRNAME = 'sessions'
export const AUTO_MODE_SESSION_FILE_NAME = 'session.json'
export const AUTO_MODE_EVENTS_FILE_NAME = 'events.jsonl'

interface AutoModeTranscriptState {
  assistantText: string
  assistantTimestamp?: string
}

function fallbackRandomId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0')
}

function extractAutoModeJsonText(value: unknown, depth = 0): string | undefined {
  if (depth > 4) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractAutoModeJsonText(item, depth + 1))
      .filter((item): item is string => typeof item === 'string' && item.length > 0)

    return parts.length > 0 ? parts.join('') : undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  return firstNonEmpty([
    extractAutoModeJsonText(value.text, depth + 1),
    extractAutoModeJsonText(value.delta, depth + 1),
    extractAutoModeJsonText(value.message, depth + 1),
    extractAutoModeJsonText(value.content, depth + 1),
    extractAutoModeJsonText(value.result, depth + 1),
    extractAutoModeJsonText(value.summary, depth + 1),
    extractAutoModeJsonText(value.error, depth + 1),
  ])
}

function extractAutoModeJsonArguments(value: unknown): Record<string, unknown> | undefined {
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

function normalizeAutoModeUserInputOption(value: unknown): AutoModeUserInputOption | null {
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

export function normalizeAutoModeUserInputQuestion(
  value: unknown,
  fallbackId = 'question-1',
): AutoModeUserInputQuestion | null {
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
      .map((option) => normalizeAutoModeUserInputOption(option))
      .filter((option): option is AutoModeUserInputOption => option !== null)
    : []

  return {
    id: firstNonEmpty([typeof value.id === 'string' ? value.id : undefined, fallbackId]) ?? fallbackId,
    header,
    question,
    options,
  }
}

export function resolveAutoModeQuestionAnswer(question: AutoModeUserInputQuestion, answer: string): string[] {
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

  return command ?? extractAutoModeJsonText(record)
}

function normalizeAcpPermissionOptions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is Record<string, unknown> => isRecord(item))
}

export function normalizeAutoModeApprovalOptions(value: unknown): AutoModeApprovalOption[] {
  return normalizeAcpPermissionOptions(value)
    .map((option) => {
      const optionId = typeof option.optionId === 'string' && option.optionId.trim()
        ? option.optionId.trim()
        : undefined
      const label = firstNonEmpty([
        typeof option.name === 'string' ? option.name : undefined,
        typeof option.label === 'string' ? option.label : undefined,
        optionId,
      ])

      if (!optionId || !label) {
        return null
      }

      const kind = typeof option.kind === 'string' && option.kind.trim()
        ? option.kind.trim() as AutoModeApprovalOptionKind
        : undefined
      const description = firstNonEmpty([
        typeof option.description === 'string' ? option.description : undefined,
        typeof option.detail === 'string' ? option.detail : undefined,
      ])

      return {
        optionId,
        label,
        ...(kind ? { kind } : {}),
        ...(description ? { description } : {}),
      }
    })
    .filter((option): option is AutoModeApprovalOption => option !== null)
}

export function parseAutoModeApprovalOptions(value: unknown): AutoModeApprovalOption[] {
  if (Array.isArray(value)) {
    return normalizeAutoModeApprovalOptions(value)
  }

  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return normalizeAutoModeApprovalOptions(parsed)
  } catch {
    return []
  }
}

export function encodeAutoModeApprovalOptions(options: AutoModeApprovalOption[] | undefined): string | undefined {
  return options && options.length > 0 ? JSON.stringify(options) : undefined
}

export function buildAutoModeApprovalDecisionReason(
  options: AutoModeApprovalDecision | BuildAutoModeApprovalDecisionReasonOptions,
  note?: string,
): string {
  const input = typeof options === 'string' ? { decision: options, note } : options
  const selectedOptionId = input.selectedOption?.optionId ?? input.selectedOptionId
  const selectedLabel = input.selectedOption?.label ?? input.selectedLabel
  return JSON.stringify({
    ...(input.source?.trim() ? { source: input.source.trim() } : {}),
    ...(input.decision ? { decision: input.decision } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(selectedOptionId?.trim() ? { selectedOptionId: selectedOptionId.trim() } : {}),
    ...(selectedLabel?.trim() ? { selectedLabel: selectedLabel.trim() } : {}),
  })
}

export function parseAutoModeApprovalDecisionReason(value: unknown): AutoModeApprovalDecisionReason | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    const record = recordFromUnknown(parsed)
    if (!record) {
      return null
    }

    const decision = normalizeAutoModeApprovalDecision(record.decision)
    const nested = parseAutoModeApprovalDecisionReason(record.note)
    const source = stringFromUnknown(record.source)
    const note = stringFromUnknown(record.note)
    const selectedOptionId = stringFromUnknown(record.selectedOptionId) ?? nested?.selectedOptionId
    const selectedLabel = stringFromUnknown(record.selectedLabel) ?? nested?.selectedLabel

    if (!source && !decision && !note && !selectedOptionId && !selectedLabel) {
      return null
    }

    return {
      ...(source ? { source } : {}),
      ...(decision ? { decision } : {}),
      ...(note ? { note } : {}),
      ...(selectedOptionId ? { selectedOptionId } : {}),
      ...(selectedLabel ? { selectedLabel } : {}),
    }
  } catch {
    return null
  }
}

export function autoModeApprovalDecisionForOption(option: AutoModeApprovalOption): AutoModeApprovalDecision {
  if (option.kind === 'allow_for_session') {
    return 'accept_for_session'
  }
  if (option.kind === 'allow_always') {
    return 'accept_always'
  }
  if (option.kind === 'reject_once' || option.kind === 'reject_always') {
    return 'decline'
  }
  if (option.kind === 'cancel') {
    return 'cancel'
  }
  return 'accept'
}

export function autoModeApprovalDecisionForStoredApproval(input: {
  status: AutoModeStoredApprovalStatus | undefined
  reason?: unknown
  approvalOptions?: unknown
}): AutoModeApprovalDecision | null {
  if (input.status === 'pending') {
    return null
  }

  const parsed = parseAutoModeApprovalDecisionReason(input.reason)

  if (input.status === 'rejected') {
    return parsed?.decision === 'cancel' ? 'cancel' : 'decline'
  }

  const option = parsed?.selectedOptionId
    ? parseAutoModeApprovalOptions(input.approvalOptions).find((entry) => entry.optionId === parsed.selectedOptionId)
    : null
  if (option) {
    return autoModeApprovalDecisionForOption(option)
  }

  if (parsed?.decision === 'accept_for_session') {
    return 'accept_for_session'
  }

  if (parsed?.decision === 'accept_always') {
    return 'accept_always'
  }

  if (parsed?.decision === 'decline' || parsed?.decision === 'cancel') {
    return parsed.decision
  }

  return input.status === 'approved' ? 'accept' : null
}

export function shouldMaterializeAutoModeGrant(decision: AutoModeApprovalDecision | null | undefined): boolean {
  return decision === 'accept_for_session' || decision === 'accept_always'
}

export function autoModeGrantScopeForDecision(decision: AutoModeApprovalDecision | null | undefined): AutoModeGrantScope | null {
  if (decision === 'accept_for_session') {
    return 'session'
  }
  if (decision === 'accept_always') {
    return 'durable'
  }
  return null
}

function normalizeDurationMs(value: unknown, unit: 'ms' | 'seconds' | 'auto'): number | undefined {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined
  }

  const milliseconds = unit === 'ms'
    ? numeric
    : unit === 'seconds'
      ? numeric * 1000
      : numeric > 10_000
        ? numeric
        : numeric * 1000

  return Math.round(milliseconds)
}

function normalizeIsoDatetime(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function extractAutoModeApprovalTimeoutMs(params: Record<string, unknown>, raw: Record<string, unknown>): number | undefined {
  const meta = isRecord(params._meta)
    ? params._meta
    : isRecord(raw._meta)
      ? raw._meta
      : {}

  return normalizeDurationMs(params.timeoutMs ?? meta.timeoutMs, 'ms')
    ?? normalizeDurationMs(params.timeoutMillis ?? params.timeoutMilliseconds ?? meta.timeoutMillis ?? meta.timeoutMilliseconds, 'ms')
    ?? normalizeDurationMs(params.timeoutSeconds ?? params.timeoutSec ?? meta.timeoutSeconds ?? meta.timeoutSec, 'seconds')
    ?? normalizeDurationMs(params.timeout ?? meta.timeout, 'auto')
}

function extractAutoModeApprovalExpiresAt(params: Record<string, unknown>, raw: Record<string, unknown>): string | undefined {
  const meta = isRecord(params._meta)
    ? params._meta
    : isRecord(raw._meta)
      ? raw._meta
      : {}

  return normalizeIsoDatetime(params.expiresAt ?? params.deadline ?? params.expires ?? meta.expiresAt ?? meta.deadline ?? meta.expires)
}

function extractAutoModeApprovalMetadata(
  raw: Record<string, unknown>,
  params: Record<string, unknown>,
): Pick<AutoModeApprovalRequest, 'approvalOptions' | 'timeoutMs' | 'expiresAt'> {
  const approvalOptions = normalizeAutoModeApprovalOptions(params.options)
  const timeoutMs = extractAutoModeApprovalTimeoutMs(params, raw)
  const expiresAt = extractAutoModeApprovalExpiresAt(params, raw)

  return {
    ...(approvalOptions.length > 0 ? { approvalOptions } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
}

function selectAcpPermissionOption(
  options: Array<Record<string, unknown>>,
  decision: AutoModeApprovalDecision,
): string | undefined {
  if (decision === 'cancel') {
    return undefined
  }

  const preferredKinds = decision === 'accept'
    ? ['allow_once', 'allow_for_session', 'allow_always']
    : decision === 'accept_for_session'
      ? ['allow_for_session', 'allow_always', 'allow_once']
      : decision === 'accept_always'
        ? ['allow_always', 'allow_for_session', 'allow_once']
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

export function createAutoModeSessionId(options: CreateAutoModeSessionIdOptions = {}): string {
  const now = options.now ?? new Date()
  const randomId = (options.randomId?.trim() || globalThis.crypto?.randomUUID?.() || fallbackRandomId()).slice(0, 8)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `auto_${stamp}_${randomId}`
}

export function normalizeAutoModeCredentialSource(_source?: LegacyAutoModeCredentialSource | null): AutoModeCredentialSource {
  return 'cloud'
}

export function shouldAttemptCloudCredentialProbe(
  _requestedSource: LegacyAutoModeCredentialSource,
  _localAuthStatus: AutoModeAuthStatus,
): boolean {
  return true
}

export function formatAutoModeAutoFallbackMessage(localMessage: string, detail: string): string {
  return `${localMessage} Cloud credential fallback unavailable: ${detail}`
}

export function resolveAutoModeCredentialSourceResolution(input: {
  requestedSource?: LegacyAutoModeCredentialSource | null
  localAuthStatus: AutoModeAuthStatus
  cloudCredentialProbe?: AutoModeCloudCredentialProbe
  defaultLocalMessage?: string
}): AutoModeCredentialSourceResolution {
  const requestedSource = normalizeAutoModeCredentialSource(input.requestedSource)
  const cloudCredentialProbe = input.cloudCredentialProbe

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

export function resolveAutoModeAutoApprovalDecision(input: {
  mode: LegacyAutoModeMode
  autoEnabled?: boolean
  request: AutoModeApprovalRequest
}): AutoModeApprovalDecision | null {
  const { request } = input
  const autoEnabled = isAutoModeSecretaryControlEnabled(input)

  if (request.kind === 'command-approval') {
    if (autoEnabled) {
      return 'accept_for_session'
    }

    return null
  }

  if (request.kind === 'file-change-approval') {
    if (autoEnabled) {
      return 'accept_for_session'
    }

    return null
  }

  if (request.kind === 'permissions-approval') {
    if (autoEnabled) {
      return 'accept_for_session'
    }

    return null
  }

  return null
}

export function createFallbackAutoModeSecretaryRecommendation(input: {
  mode: LegacyAutoModeMode
  autoEnabled?: boolean
  request: AutoModeInteractionRequest
}): AutoModeSecretaryRecommendation | null {
  if (!isAutoModeSecretaryControlEnabled(input) || input.request.kind === 'user-input') {
    return null
  }

  const decision = resolveAutoModeAutoApprovalDecision({
    mode: input.mode,
    autoEnabled: input.autoEnabled,
    request: input.request,
  })
  const secretaryDecision = normalizeAutoModeDecisionForSecretary(decision)
  if (!secretaryDecision) {
    return null
  }

  return {
    kind: input.request.kind,
    canAutoDecide: true,
    decision: secretaryDecision,
    confidence: 0.7,
    reason: 'Matched local fallback policy while AI secretary was unavailable.',
    reactionWindowMs: 0,
    source: 'fallback',
  }
}

export function parseAutoModeSecretaryRecommendation(
  text: string,
  options: ParseAutoModeSecretaryRecommendationOptions,
): AutoModeSecretaryRecommendation | null {
  const raw = parseJsonObjectFromText(text)
  if (!raw) {
    return null
  }

  const canAutoDecide = booleanFromUnknown(
    raw.canAutoDecide
      ?? raw.can_auto_decide
      ?? raw.autoApprove
      ?? raw.auto_approve
      ?? raw.canAnswer
      ?? raw.can_answer,
  )
  const confidence = normalizeConfidence(raw.confidence ?? raw.confidenceScore ?? raw.confidence_score)
  const reason = stringFromUnknown(raw.reason ?? raw.rationale ?? raw.explanation)
  const fallbackReactionWindowMs = options.defaultReactionWindowMs ?? DEFAULT_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS
  const reactionWindowMs = confidence !== undefined
    ? computeAutoModeSecretaryReactionWindowMs(confidence, fallbackReactionWindowMs)
    : normalizeReactionWindowMs(
      raw.reactionWindowMs
        ?? raw.reaction_window_ms
        ?? raw.reviewWindowMs
        ?? raw.review_window_ms
        ?? raw.autoDecisionDelayMs
        ?? raw.auto_decision_delay_ms,
      fallbackReactionWindowMs,
    )

  if (options.request.kind === 'user-input') {
    const answers = normalizeSecretaryUserInputAnswers(
      options.request.questions,
      raw.answers ?? raw.answer ?? raw.userInputAnswers ?? raw.user_input_answers,
    )

    return {
      kind: 'user-input',
      canAutoDecide: canAutoDecide === true && !!answers,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(reason ? { reason } : {}),
      ...(reactionWindowMs !== undefined ? { reactionWindowMs } : {}),
      ...(answers ? { answers } : {}),
      source: 'model',
    }
  }

  const decision = normalizeSecretaryApprovalDecision(raw.decision ?? raw.recommendedDecision ?? raw.recommended_decision)
  if (!decision) {
    return {
      kind: options.request.kind,
      canAutoDecide: false,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(reason ? { reason } : {}),
      ...(reactionWindowMs !== undefined ? { reactionWindowMs } : {}),
      source: 'model',
    }
  }

  return {
    kind: options.request.kind,
    canAutoDecide: canAutoDecide === true,
    decision,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(reason ? { reason } : {}),
    ...(reactionWindowMs !== undefined ? { reactionWindowMs } : {}),
    source: 'model',
  }
}

export function autoModeApprovalDecisionLabel(decision: AutoModeApprovalDecision): string {
  if (decision === 'accept') {
    return 'Allow once'
  }
  if (decision === 'accept_for_session') {
    return 'Grant'
  }
  if (decision === 'accept_always') {
    return 'Always allow'
  }
  if (decision === 'decline') {
    return 'Deny'
  }
  return 'Cancel'
}

export function autoModeUserInputAnswersSummary(answers: AutoModeUserInputAnswers): string {
  return Object.entries(answers)
    .map(([key, value]) => `${key}: ${value.answers.join(', ')}`)
    .join('; ')
}

export function parseAutoModeGrantCoverageDecision(text: string): AutoModeGrantCoverageDecision | null {
  const raw = parseJsonObjectFromText(text)
  if (!raw) {
    return null
  }

  const covers = booleanFromUnknown(raw.covers ?? raw.covered ?? raw.applies ?? raw.allowed)
  if (covers === undefined) {
    return null
  }

  const confidence = normalizeConfidence(raw.confidence ?? raw.confidenceScore ?? raw.confidence_score)
  const reason = stringFromUnknown(raw.reason ?? raw.rationale ?? raw.explanation)

  return {
    covers,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(reason ? { reason } : {}),
    source: 'model',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function booleanFromUnknown(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(normalized)) {
      return true
    }
    if (['false', 'no', 'n', '0'].includes(normalized)) {
      return false
    }
  }
  return undefined
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1 && value <= 100) {
      return Math.max(0, Math.min(1, value / 100))
    }
    return Math.max(0, Math.min(1, value))
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? normalizeConfidence(parsed) : undefined
  }

  return undefined
}

function normalizeReactionWindowMs(value: unknown, fallback: number): number | undefined {
  const parsed = normalizeDurationMs(value ?? fallback, 'ms')
  if (parsed === undefined) {
    return undefined
  }
  return Math.max(0, Math.min(MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS, parsed))
}

export function computeAutoModeSecretaryReactionWindowMs(
  confidence: number | undefined,
  fallback = DEFAULT_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS,
): number {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return Math.max(0, Math.min(MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS, fallback))
  }

  const normalized = Math.max(0, Math.min(1, confidence))
  const window = Math.round(
    MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS
      + (1 - normalized) * (MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS - MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS),
  )
  return Math.max(MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS, Math.min(MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS, window))
}

function normalizeSecretaryApprovalDecision(value: unknown): AutoModeSecretaryApprovalDecision | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase().replace(/-/g, '_')
  if (['accept', 'allow', 'allow_once', 'approve', 'yes', 'accept_for_session', 'accept_always', 'allow_for_session', 'allow_always', 'grant', 'session', 'approve_for_session'].includes(normalized)) {
    return 'accept'
  }
  if (['decline', 'deny', 'reject', 'reject_once', 'reject_always', 'no'].includes(normalized)) {
    return 'decline'
  }
  if (['cancel', 'abort'].includes(normalized)) {
    return 'cancel'
  }
  return undefined
}

function normalizeAutoModeDecisionForSecretary(decision: AutoModeApprovalDecision | null | undefined): AutoModeSecretaryApprovalDecision | undefined {
  if (decision === 'accept' || decision === 'accept_for_session' || decision === 'accept_always') {
    return 'accept'
  }
  if (decision === 'decline' || decision === 'cancel') {
    return decision
  }
  return undefined
}

function normalizeAutoModeApprovalDecision(value: unknown): AutoModeApprovalDecision | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase().replace(/-/g, '_')
  if (['accept', 'allow', 'allow_once', 'approve', 'yes'].includes(normalized)) {
    return 'accept'
  }
  if (['accept_for_session', 'allow_for_session', 'session', 'approve_for_session'].includes(normalized)) {
    return 'accept_for_session'
  }
  if (['accept_always', 'allow_always', 'grant', 'always', 'approve_always'].includes(normalized)) {
    return 'accept_always'
  }
  if (['decline', 'deny', 'reject', 'reject_once', 'reject_always', 'no'].includes(normalized)) {
    return 'decline'
  }
  if (['cancel', 'abort'].includes(normalized)) {
    return 'cancel'
  }
  return undefined
}

function parseJsonObjectFromText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  for (const candidate of [
    trimmed,
    extractFencedJson(trimmed),
    extractBracedJson(trimmed),
  ]) {
    if (!candidate) {
      continue
    }
    try {
      const parsed = JSON.parse(candidate) as unknown
      return recordFromUnknown(parsed)
    } catch {
      // Try the next extraction shape.
    }
  }

  return null
}

function extractFencedJson(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)
  return match?.[1]?.trim() || null
}

function extractBracedJson(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : null
}

function normalizeSecretaryUserInputAnswers(
  questions: AutoModeUserInputQuestion[],
  rawAnswers: unknown,
): AutoModeUserInputAnswers | undefined {
  const source = recordFromUnknown(rawAnswers)
  if (!source) {
    return undefined
  }

  const answers: AutoModeUserInputAnswers = {}
  for (const question of questions) {
    const raw = source[question.id] ?? source[question.header] ?? source[question.question]
    const normalizedAnswers = normalizeSecretaryAnswerValues(raw)
    if (normalizedAnswers.length > 0) {
      answers[question.id] = { answers: normalizedAnswers }
    }
  }

  return Object.keys(answers).length > 0 ? answers : undefined
}

function normalizeSecretaryAnswerValues(value: unknown): string[] {
  const answerRecord = recordFromUnknown(value)
  if (answerRecord) {
    return normalizeSecretaryAnswerValues(answerRecord.answers ?? answerRecord.value ?? answerRecord.answer)
  }

  const values = Array.isArray(value) ? value : [value]
  return values
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter(Boolean)
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function normalizeAutoModeAuthText(value: unknown, depth = 0): string | undefined {
  if (depth > 5) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeAutoModeAuthText(item, depth + 1))
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

    return parts.length > 0 ? parts.join(' ') : undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  return firstNonEmpty([
    normalizeAutoModeAuthText(value.message, depth + 1),
    normalizeAutoModeAuthText(value.error, depth + 1),
    normalizeAutoModeAuthText(value.result, depth + 1),
    normalizeAutoModeAuthText(value.text, depth + 1),
    normalizeAutoModeAuthText(value.reason, depth + 1),
    normalizeAutoModeAuthText(value.content, depth + 1),
    normalizeAutoModeAuthText(value.summary, depth + 1),
  ])
}

export function getAutoModeAuthLoginCommand(backend: AutoModeBackend): string | null {
  if (backend === 'linx') {
    return null
  }

  if (backend === 'claude') {
    return 'claude auth login'
  }

  if (backend === 'codex') {
    return 'codex login'
  }

  return null
}

export function formatAutoModeBackendAuthMessage(backend: AutoModeBackend, detail?: string): string {
  const command = getAutoModeAuthLoginCommand(backend)
  const label = backend === 'linx'
    ? 'LinX'
    : backend === 'claude'
      ? 'Claude Code'
      : backend === 'codebuddy'
        ? 'CodeBuddy Code'
        : 'Codex'

  if (backend === 'linx') {
    return detail
      ? `${label} backend is unavailable. Native message: ${detail}`
      : `${label} backend is unavailable.`
  }

  if (backend === 'codebuddy') {
    return detail
      ? `${label} is not authenticated. Open \`codebuddy\` and complete login first. Native message: ${detail}`
      : `${label} is not authenticated. Open \`codebuddy\` and complete login first.`
  }

  return detail
    ? `${label} is not authenticated. Run \`${command}\` and try again. Native message: ${detail}`
    : `${label} is not authenticated. Run \`${command}\` and try again.`
}

export function looksLikeAutoModeAuthFailureText(text: string): boolean {
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

export function parseAutoModeClaudeAuthStatus(stdout: string): AutoModeAuthStatus {
  const payload = parseAutoModeJsonLine(stdout.trim())
  if (!payload || typeof payload.loggedIn !== 'boolean') {
    return { state: 'unknown' }
  }

  return payload.loggedIn
    ? { state: 'authenticated' }
    : { state: 'unauthenticated', message: formatAutoModeBackendAuthMessage('claude') }
}

export function detectAutoModeAuthFailure(backend: AutoModeBackend, line: string): AutoModeAuthFailure | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const payload = parseAutoModeJsonLine(trimmed)
  if (payload) {
    if (backend === 'claude' && payload.error === 'authentication_failed') {
      const detail = normalizeAutoModeAuthText(payload) ?? 'authentication_failed'
      return { message: formatAutoModeBackendAuthMessage(backend, detail) }
    }

    if (backend === 'claude' && payload.loggedIn === false) {
      return { message: formatAutoModeBackendAuthMessage(backend) }
    }

    if (payload.error) {
      const detail = normalizeAutoModeAuthText(payload.error) ?? normalizeAutoModeAuthText(payload)
      if (detail && looksLikeAutoModeAuthFailureText(detail)) {
        return { message: formatAutoModeBackendAuthMessage(backend, detail) }
      }
    }

    if (payload.is_error === true) {
      const detail = normalizeAutoModeAuthText(payload)
      if (detail && looksLikeAutoModeAuthFailureText(detail)) {
        return { message: formatAutoModeBackendAuthMessage(backend, detail) }
      }
    }

    const detail = normalizeAutoModeAuthText(payload)
    if (detail && looksLikeAutoModeAuthFailureText(detail)) {
      return { message: formatAutoModeBackendAuthMessage(backend, detail) }
    }
  }

  if (!looksLikeAutoModeAuthFailureText(trimmed)) {
    return null
  }

  return { message: formatAutoModeBackendAuthMessage(backend, trimmed) }
}

export function parseAutoModeJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function extractAutoModeSessionIdFromJsonLine(line: string): string | undefined {
  const json = parseAutoModeJsonLine(line)
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

export function isTrustedAutoModeCommand(command: string | null | undefined): boolean {
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

export function normalizeCodexAppServerInteractionRequest(message: Record<string, unknown>): AutoModeInteractionRequest | null {
  const method = typeof message.method === 'string' ? message.method : ''
  const params = (typeof message.params === 'object' && message.params !== null
    ? message.params
    : {}) as Record<string, unknown>
  const approvalMetadata = extractAutoModeApprovalMetadata(message, params)

  if (method === 'item/commandExecution/requestApproval') {
    const command = typeof params.command === 'string' ? params.command : undefined
    const cwd = typeof params.cwd === 'string' ? params.cwd : undefined

    return {
      kind: 'command-approval',
      message: command || 'Codex requests command approval',
      command,
      cwd,
      ...approvalMetadata,
      raw: message,
    }
  }

  if (method === 'item/fileChange/requestApproval') {
    const reason = typeof params.reason === 'string' ? params.reason : undefined

    return {
      kind: 'file-change-approval',
      message: reason && reason.trim() ? reason : 'Codex requests file-change approval',
      ...(reason ? { reason } : {}),
      ...approvalMetadata,
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
      ...approvalMetadata,
      raw: message,
    }
  }

  if (method === 'item/tool/requestUserInput') {
    const questions = Array.isArray(params.questions)
      ? params.questions
        .map((question, index) => normalizeAutoModeUserInputQuestion(question, `question-${index + 1}`))
        .filter((question): question is AutoModeUserInputQuestion => question !== null)
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
      ...approvalMetadata,
      raw: message,
    }
  }

  return null
}

export function resolveAutoModeInteractionAutoResponse(input: {
  mode: AutoModeMode
  autoEnabled?: boolean
  request: AutoModeInteractionRequest
}): unknown | null {
  const { request } = input

  if (request.kind === 'user-input' || request.kind === 'codex-approval') {
    return null
  }

  const decision = resolveAutoModeAutoApprovalDecision({
    mode: input.mode,
    autoEnabled: input.autoEnabled,
    request,
  })

  if (!decision) {
    return null
  }

  return buildCodexApprovalResponse(request, decision)
}

function isAutoModeSecretaryControlEnabled(input: {
  mode?: LegacyAutoModeMode
  autoEnabled?: boolean
}): boolean {
  return typeof input.autoEnabled === 'boolean'
    ? input.autoEnabled
    : input.mode === 'auto'
}

export function buildCodexApprovalResponse(
  request: AutoModeApprovalRequest,
  decision: AutoModeApprovalDecision,
): unknown {
  if (request.kind === 'permissions-approval') {
    if (decision === 'accept') {
      return { permissions: request.permissions, scope: 'turn' }
    }

    if (decision === 'accept_for_session' || decision === 'accept_always') {
      return { permissions: request.permissions, scope: 'session' }
    }

    return { permissions: {}, scope: 'turn' }
  }

  if (request.kind === 'codex-approval') {
    if (decision === 'accept') {
      return { decision: 'approved' }
    }

    if (decision === 'accept_for_session' || decision === 'accept_always') {
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

  if (decision === 'accept_for_session' || decision === 'accept_always') {
    return { decision: 'acceptForSession' }
  }

  if (decision === 'cancel') {
    return { decision: 'cancel' }
  }

  return { decision: 'decline' }
}

export function buildCodexUserInputResponse(answers: AutoModeUserInputAnswers): { answers: AutoModeUserInputAnswers } {
  return { answers }
}

export function buildAutoModeUserInputResponse(answers: AutoModeUserInputAnswers): { answers: AutoModeUserInputAnswers } {
  return buildCodexUserInputResponse(answers)
}

export function normalizeAcpInteractionRequest(message: Record<string, unknown>): AutoModeInteractionRequest | null {
  const method = typeof message.method === 'string' ? message.method.toLowerCase() : ''
  const params = (recordFromUnknown(message.params) ?? {}) as Record<string, unknown>

  if (method === 'session/request_permission' || Array.isArray(params.options)) {
    const approvalMetadata = extractAutoModeApprovalMetadata(message, params)
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
      extractAutoModeJsonText(toolCall),
      method || undefined,
    ]) ?? 'Approval required'

    if (toolKind === 'execute' || command) {
      return {
        kind: 'command-approval',
        message: command ?? messageText,
        ...(command ? { command } : {}),
        ...(cwd ? { cwd } : {}),
        ...approvalMetadata,
        raw: message,
      }
    }

    if (toolKind === 'edit' || toolKind === 'delete' || toolKind === 'move') {
      return {
        kind: 'file-change-approval',
        message: messageText,
        reason: messageText,
        ...approvalMetadata,
        raw: message,
      }
    }

    return {
      kind: 'permissions-approval',
      message: messageText,
      permissions: recordFromUnknown(toolCall.rawInput) ?? {},
      ...approvalMetadata,
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
      .map((question, index) => normalizeAutoModeUserInputQuestion(question, `question-${index + 1}`))
      .filter((question): question is AutoModeUserInputQuestion => question !== null)
    : []

  return {
    kind: 'user-input',
    message: firstNonEmpty([
      extractAutoModeJsonText(params.message),
      extractAutoModeJsonText(params.prompt),
      extractAutoModeJsonText(params.question),
      questions[0]?.question,
    ]) ?? 'Input required',
    questions,
    raw: message,
  }
}

export function normalizeAcpRequest(message: Record<string, unknown>): AutoModeNormalizedEvent[] {
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

  const events: AutoModeNormalizedEvent[] = [{
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
): AutoModeToolCallEvent | null {
  const name = firstNonEmpty([
    typeof update.title === 'string' ? update.title : undefined,
    typeof update.kind === 'string' ? update.kind : undefined,
    typeof update.toolCallId === 'string' ? update.toolCallId : undefined,
  ])

  if (!name) {
    return null
  }

  const args = extractAutoModeJsonArguments(update.rawInput)
  return {
    type: 'tool.call',
    name,
    ...(args ? { arguments: args } : {}),
    raw,
  }
}

export function normalizeAcpSessionNotification(message: Record<string, unknown>): AutoModeNormalizedEvent[] {
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

  if (updateType === 'available_commands_update' || updateType === 'usage_update') {
    return []
  }

  if (updateType === 'agent_message_chunk') {
    const text = extractAutoModeJsonText(update.content ?? update)
    return text ? [{ type: 'assistant.delta', text, raw: message }] : []
  }

  if (updateType === 'agent_thought_chunk') {
    return []
  }

  if (updateType === 'tool_call' || updateType === 'tool_call_update') {
    const toolEvent = normalizeAcpToolCallEvent(update, message)
    if (toolEvent) {
      return [toolEvent]
    }
  }

  const text = extractAutoModeJsonText(update)
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
  request: AutoModeApprovalRequest,
  decision: AutoModeApprovalDecision,
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

function maybeAutoModeToolEvent(json: Record<string, unknown>, lowerType: string): AutoModeNormalizedEvent | null {
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
    arguments: extractAutoModeJsonArguments(json.arguments ?? json.args ?? json.input),
    raw: json,
  }
}

function maybeAutoModeInputEvent(json: Record<string, unknown>, lowerType: string): AutoModeInputRequiredEvent | null {
  const looksLikeInput = lowerType.includes('request_user_input')
    || lowerType.includes('user_input')
    || Array.isArray(json.questions)

  if (!looksLikeInput) {
    return null
  }

  const questions = Array.isArray(json.questions)
    ? json.questions
      .map((question, index) => normalizeAutoModeUserInputQuestion(question, `question-${index + 1}`))
      .filter((question): question is AutoModeUserInputQuestion => question !== null)
    : []

  const message = firstNonEmpty([
    extractAutoModeJsonText(json.message),
    extractAutoModeJsonText(json.prompt),
    extractAutoModeJsonText(json.question),
    extractAutoModeJsonText(json.description),
  ]) || 'Input required'

  const request: AutoModeUserInputRequest = {
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

function maybeAutoModeApprovalEvent(json: Record<string, unknown>, lowerType: string): AutoModeNormalizedEvent | null {
  const looksLikeApproval = lowerType.includes('approval')
    || lowerType.includes('permission')
    || isRecord(json.permissions)

  if (!looksLikeApproval) {
    return null
  }

  const message = firstNonEmpty([
    extractAutoModeJsonText(json.message),
    extractAutoModeJsonText(json.reason),
    extractAutoModeJsonText(json.prompt),
    extractAutoModeJsonText(json.question),
    extractAutoModeJsonText(json.description),
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
          ...extractAutoModeApprovalMetadata(json, json),
          raw: json,
        },
      }
      : {}),
    raw: json,
  }
}

function maybeAutoModeAssistantDoneEvent(json: Record<string, unknown>, lowerType: string): AutoModeNormalizedEvent | null {
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
    text: extractAutoModeJsonText(json),
    raw: json,
  }
}

function maybeAutoModeAssistantDeltaEvent(json: Record<string, unknown>, lowerType: string): AutoModeNormalizedEvent | null {
  const isDelta = lowerType.includes('delta')
    || lowerType.includes('assistant')
    || lowerType.includes('message')
    || lowerType.includes('content_block')
    || lowerType.includes('text')

  if (!isDelta) {
    return null
  }

  const text = firstNonEmpty([
    extractAutoModeJsonText(json.delta),
    extractAutoModeJsonText(json.text),
    extractAutoModeJsonText(json.message),
    extractAutoModeJsonText(json.content),
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

export function parseAutoModeJsonProtocolLine(line: string): AutoModeNormalizedEvent[] {
  const json = parseAutoModeJsonLine(line)
  if (!json) {
    return []
  }

  const lowerType = typeof json.type === 'string' ? json.type.toLowerCase() : ''
  const events: AutoModeNormalizedEvent[] = []

  const inputEvent = maybeAutoModeInputEvent(json, lowerType)
  if (inputEvent) {
    events.push(inputEvent)
  }

  const approvalEvent = maybeAutoModeApprovalEvent(json, lowerType)
  if (approvalEvent) {
    events.push(approvalEvent)
  }

  const toolEvent = maybeAutoModeToolEvent(json, lowerType)
  if (toolEvent) {
    events.push(toolEvent)
  }

  const doneEvent = maybeAutoModeAssistantDoneEvent(json, lowerType)
  if (doneEvent) {
    events.push(doneEvent)
  } else {
    const deltaEvent = maybeAutoModeAssistantDeltaEvent(json, lowerType)
    if (deltaEvent) {
      events.push(deltaEvent)
    }
  }

  if (events.length === 0) {
    const text = extractAutoModeJsonText(json)
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

function normalizeCodexThreadItem(item: Record<string, unknown>, raw: Record<string, unknown>): AutoModeNormalizedEvent[] {
  const type = typeof item.type === 'string' ? item.type : ''

  if (type === 'userMessage') {
    const content = Array.isArray(item.content)
      ? item.content
        .map((part) => (typeof part === 'object' && part !== null ? part : null))
        .filter((part): part is Record<string, unknown> => part !== null)
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .filter((text) => text.length > 0)
        .join('')
      : ''

    return content
      ? [{
        type: 'session.note',
        message: `userMessage · ${content}`,
        raw,
      }]
      : []
  }

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

export function normalizeCodexAppServerNotification(message: Record<string, unknown>): AutoModeNormalizedEvent[] {
  const method = typeof message.method === 'string' ? message.method : ''
  const params = (typeof message.params === 'object' && message.params !== null
    ? message.params
    : {}) as Record<string, unknown>

  if (method === 'thread/started') {
    return [{
      type: 'session.note',
      message: 'Thread started',
      raw: message,
    }]
  }

  if (method === 'thread/status/changed') {
    const status = (typeof params.status === 'object' && params.status !== null ? params.status : {}) as Record<string, unknown>
    const statusType = typeof status.type === 'string' ? status.type : 'unknown'
    return [{
      type: 'session.note',
      message: `Thread status · ${statusType}`,
      raw: message,
    }]
  }

  if (method === 'turn/started') {
    return [{
      type: 'session.note',
      message: 'Turn started',
      raw: message,
    }]
  }

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
      message: extractAutoModeJsonText(params.error) || 'Codex error',
      raw: message,
    }]
  }

  return []
}

export function normalizeCodexAppServerRequest(message: Record<string, unknown>): AutoModeNormalizedEvent[] {
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
    const events: AutoModeNormalizedEvent[] = [{
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

export function getAutoModeArchiveRelativePaths(sessionId: string): AutoModeArchiveRelativePaths {
  const normalizedId = sessionId.trim()
  const sessionDir = `${AUTO_MODE_SESSIONS_DIRNAME}/${normalizedId}`

  return {
    sessionDir,
    sessionFile: `${sessionDir}/${AUTO_MODE_SESSION_FILE_NAME}`,
    eventsFile: `${sessionDir}/${AUTO_MODE_EVENTS_FILE_NAME}`,
  }
}

export function buildAutoModeThreadMetadata(record: AutoModeSessionRecord): AutoModeThreadMetadata {
  return {
    kind: 'auto-mode',
    delegatedTo: 'secretary',
    sessionId: record.id,
    backend: record.backend,
    runtime: record.runtime,
    transport: record.transport,
    mode: record.mode,
    ...(record.autoEnabled !== undefined ? { autoEnabled: record.autoEnabled } : {}),
    ...(record.goalMode !== undefined ? { goalMode: record.goalMode } : {}),
    cwd: record.cwd,
    model: record.model,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalSource: record.approvalSource,
    status: record.status,
    backendSessionId: record.backendSessionId,
  }
}

function pushAutoModeTranscriptMessage(
  messages: AutoModeTranscriptMessage[],
  role: AutoModeTranscriptMessageRole,
  source: AutoModeTranscriptMessageSource,
  content: string | undefined,
  createdAt: string,
): void {
  const normalized = content?.replace(/\r/g, '').trimEnd()
  if (!normalized) {
    return
  }

  messages.push({
    role,
    source,
    content: normalized,
    createdAt,
  })
}

function flushAutoModeAssistantMessage(
  messages: AutoModeTranscriptMessage[],
  state: AutoModeTranscriptState,
  fallbackTimestamp: string,
): void {
  if (!state.assistantText.trim()) {
    state.assistantText = ''
    state.assistantTimestamp = undefined
    return
  }

  pushAutoModeTranscriptMessage(
    messages,
    'assistant',
    'primary-agent',
    state.assistantText,
    state.assistantTimestamp ?? fallbackTimestamp,
  )
  state.assistantText = ''
  state.assistantTimestamp = undefined
}

function appendAutoModeTranscriptEvent(
  messages: AutoModeTranscriptMessage[],
  state: AutoModeTranscriptState,
  entry: AutoModeEventLogEntry,
  event: AutoModeNormalizedEvent,
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
      pushAutoModeTranscriptMessage(messages, 'assistant', 'primary-agent', event.text, entry.timestamp)
      return
    }

    flushAutoModeAssistantMessage(messages, state, entry.timestamp)
    return
  }

  flushAutoModeAssistantMessage(messages, state, entry.timestamp)

  if (event.type === 'tool.call') {
    pushAutoModeTranscriptMessage(
      messages,
      'system',
      'tool',
      `[tool] ${event.name}${event.arguments ? ` ${JSON.stringify(event.arguments)}` : ''}`,
      entry.timestamp,
    )
    return
  }

  if (event.type === 'approval.required') {
    pushAutoModeTranscriptMessage(messages, 'system', 'secretary', `[approval] ${event.message}`, entry.timestamp)
    return
  }

  if (event.type === 'input.required') {
    pushAutoModeTranscriptMessage(messages, 'system', 'secretary', `[input] ${event.message}`, entry.timestamp)
    return
  }

  pushAutoModeTranscriptMessage(messages, 'system', 'system', `[note] ${event.message}`, entry.timestamp)
}

function appendAutoModeTranscriptRawEntry(
  messages: AutoModeTranscriptMessage[],
  entry: AutoModeEventLogEntry,
): void {
  const trimmed = entry.line.trim()
  if (!trimmed) {
    return
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const type = typeof parsed.type === 'string' ? parsed.type : ''

    if (type === 'user.turn' && typeof parsed.text === 'string') {
      pushAutoModeTranscriptMessage(messages, 'user', 'user', parsed.text, entry.timestamp)
      return
    }

    if (type === 'turn.start') {
      const command = typeof parsed.command === 'string' ? parsed.command : 'unknown'
      const args = Array.isArray(parsed.args)
        ? parsed.args.filter((value): value is string => typeof value === 'string')
        : []
      pushAutoModeTranscriptMessage(messages, 'system', 'system', `[turn] ${[command, ...args].join(' ').trim()}`, entry.timestamp)
      return
    }

    if (type === 'credentials.resolve') {
      const requested = typeof parsed.requestedCredentialSource === 'string' ? parsed.requestedCredentialSource : 'auto'
      const resolved = typeof parsed.resolvedCredentialSource === 'string' ? parsed.resolvedCredentialSource : requested
      pushAutoModeTranscriptMessage(messages, 'system', 'system', `[credentials] ${requested} -> ${resolved}`, entry.timestamp)
      return
    }

    if (type === 'process.error' && typeof parsed.message === 'string') {
      pushAutoModeTranscriptMessage(messages, 'system', 'system', `[error] ${parsed.message}`, entry.timestamp)
      return
    }
  } catch {
    // Keep original line when it is not structured JSON.
  }

  pushAutoModeTranscriptMessage(
    messages,
    'system',
    entry.stream === 'stderr' ? 'system' : 'primary-agent',
    entry.stream === 'stderr' ? `stderr> ${trimmed}` : trimmed,
    entry.timestamp,
  )
}

export function buildAutoModeTranscriptMessages(entries: AutoModeEventLogEntry[]): AutoModeTranscriptMessage[] {
  const messages: AutoModeTranscriptMessage[] = []
  const state: AutoModeTranscriptState = {
    assistantText: '',
  }

  for (const entry of entries) {
    if (entry.events.length > 0) {
      for (const event of entry.events) {
        appendAutoModeTranscriptEvent(messages, state, entry, event)
      }
      continue
    }

    flushAutoModeAssistantMessage(messages, state, entry.timestamp)
    appendAutoModeTranscriptRawEntry(messages, entry)
  }

  flushAutoModeAssistantMessage(messages, state, new Date().toISOString())
  return messages
}
