import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import { getSolidLinxAppDir } from './solid-local-store.js'

export type LinxStatusLineToken =
  | 'total-input-tokens'
  | 'total-output-tokens'
  | 'context-usage'
  | 'context-remaining'
  | 'cache-rate'
  | 'model'
  | 'model-with-reasoning'
  | 'thinking'
  | 'provider'
  | 'current-dir'
  | 'git-branch'
  | 'session-name'

export const DEFAULT_STATUS_LINE_TOKENS: LinxStatusLineToken[] = [
  'total-input-tokens',
  'total-output-tokens',
  'context-usage',
  'cache-rate',
  'model-with-reasoning',
]

export const LINX_STATUS_LINE_CONFIG_FILE_NAME = 'config.json'

export const LINX_STATUS_LINE_TOKEN_NAMES: LinxStatusLineToken[] = [
  ...DEFAULT_STATUS_LINE_TOKENS,
  'context-remaining',
  'model',
  'thinking',
  'provider',
  'current-dir',
  'git-branch',
  'session-name',
]

const STATUS_LINE_TOKEN_ALIASES: Record<string, LinxStatusLineToken> = {
  input: 'total-input-tokens',
  'input-tokens': 'total-input-tokens',
  output: 'total-output-tokens',
  'output-tokens': 'total-output-tokens',
  context: 'context-usage',
  'context-left': 'context-remaining',
  'cache': 'cache-rate',
  'cache-percent': 'cache-rate',
  cwd: 'current-dir',
  pwd: 'current-dir',
  branch: 'git-branch',
  reasoning: 'thinking',
}

const STATUS_LINE_TOKENS = new Set<string>(LINX_STATUS_LINE_TOKEN_NAMES)

export interface LinxFooterDataLike {
  getGitBranch?(): string | null | undefined
}

export interface LinxStatusLineInput {
  session: any
  width: number
  autoCompactEnabled: boolean
  footerData?: LinxFooterDataLike
}

export interface LinxStatusLineConfig {
  tokens: LinxStatusLineToken[]
  useColors: boolean
  tokenSource: 'env' | 'file' | 'default'
  colorSource: 'env' | 'file' | 'default'
}

export function buildLinxFooterStatusLine(input: LinxStatusLineInput): string {
  const config = readLinxStatusLineConfig()
  const context = createStatusLineContext(input)
  const parts = config.tokens
    .map((token) => renderStatusLineToken(token, context))
    .filter((part): part is string => Boolean(part))

  return fitStatusLine(parts.join(' • '), input.width, config.useColors)
}

function createStatusLineContext(input: LinxStatusLineInput) {
  const session = input.session
  const state = session?.state ?? {}
  const model = state.model ?? {}
  const usage = calculateSessionUsage(session)
  const contextUsage = session?.getContextUsage?.()

  return {
    session,
    state,
    model,
    usage,
    contextUsage,
    autoCompactEnabled: input.autoCompactEnabled,
    gitBranch: normalizeText(input.footerData?.getGitBranch?.()),
  }
}

function renderStatusLineToken(
  token: LinxStatusLineToken,
  context: ReturnType<typeof createStatusLineContext>,
): string | null {
  switch (token) {
    case 'total-input-tokens':
      return context.usage.input > 0 ? `↑${formatTokenCount(context.usage.input)}` : null
    case 'total-output-tokens':
      return context.usage.output > 0 ? `↓${formatTokenCount(context.usage.output)}` : null
    case 'context-usage':
      return formatContextUsage(context)
    case 'context-remaining':
      return formatContextRemaining(context)
    case 'cache-rate':
      return context.usage.cacheRate === null ? null : `cache ${context.usage.cacheRate}%`
    case 'model':
      return normalizeText(context.model.id) ?? 'no-model'
    case 'model-with-reasoning':
      return formatModelWithReasoning(context)
    case 'thinking':
      return formatThinkingLevel(context)
    case 'provider':
      return normalizeText(context.model.provider)
    case 'current-dir':
      return formatCurrentDir(context.session)
    case 'git-branch':
      return context.gitBranch
    case 'session-name':
      return normalizeText(context.session?.sessionManager?.getSessionName?.())
  }
}

export function readLinxStatusLineConfig(): LinxStatusLineConfig {
  const fileConfig = readLinxStatusLineFileConfig()
  const envTokens = parseStatusLineTokens(process.env.LINX_STATUS_LINE)
  const fileTokens = parseStatusLineTokens(fileConfig.statusLine)
  const envUseColors = parseBoolean(process.env.LINX_STATUS_LINE_USE_COLORS)
  const fileUseColors = parseBoolean(fileConfig.statusLineUseColors)

  return {
    tokens: envTokens ?? fileTokens ?? DEFAULT_STATUS_LINE_TOKENS,
    useColors: envUseColors ?? fileUseColors ?? true,
    tokenSource: envTokens ? 'env' : fileTokens ? 'file' : 'default',
    colorSource: envUseColors !== undefined ? 'env' : fileUseColors !== undefined ? 'file' : 'default',
  }
}

export function readLinxStatusLineFileConfig(): {
  statusLine?: unknown
  statusLineUseColors?: unknown
} {
  const path = getLinxStatusLineConfigPath()
  if (!existsSync(path)) {
    return {}
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    return {
      statusLine: parsed.status_line ?? parsed.statusLine,
      statusLineUseColors: parsed.status_line_use_colors ?? parsed.statusLineUseColors,
    }
  } catch {
    return {}
  }
}

export function getLinxStatusLineConfigPath(): string {
  return join(getSolidLinxAppDir(), LINX_STATUS_LINE_CONFIG_FILE_NAME)
}

export function writeLinxStatusLineConfigPatch(patch: {
  statusLine?: LinxStatusLineToken[]
  statusLineUseColors?: boolean
}): void {
  const path = getLinxStatusLineConfigPath()
  const existing = readStatusLineConfigObject(path)
  if (patch.statusLine) {
    existing.status_line = patch.statusLine
    delete existing.statusLine
  }
  if (patch.statusLineUseColors !== undefined) {
    existing.status_line_use_colors = patch.statusLineUseColors
    delete existing.statusLineUseColors
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`)
}

export function resetLinxStatusLineConfig(): void {
  const path = getLinxStatusLineConfigPath()
  const existing = readStatusLineConfigObject(path)
  delete existing.status_line
  delete existing.statusLine
  delete existing.status_line_use_colors
  delete existing.statusLineUseColors
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`)
}

export function parseLinxStatusLineTokenArgs(args: string[]): LinxStatusLineToken[] {
  const rawTokens = args
    .flatMap((arg) => arg.split(/[, ]+/u))
    .map((arg) => arg.trim())
    .filter(Boolean)
  const invalid = rawTokens.filter((token) => normalizeStatusLineToken(token) === null)
  if (invalid.length > 0) {
    throw new Error(`Unknown status line token(s): ${invalid.join(', ')}`)
  }

  const tokens = rawTokens
    .map((token) => normalizeStatusLineToken(token))
    .filter((token): token is LinxStatusLineToken => token !== null)

  if (tokens.length === 0) {
    throw new Error('Status line needs at least one token.')
  }

  return tokens
}

export function parseLinxStatusLineColorArg(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) {
    return false
  }
  return undefined
}

export function parseStatusLineTokens(value: unknown): LinxStatusLineToken[] | null {
  const rawTokens = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[, ]+/u)
      : []
  const tokens = rawTokens
    .map((token) => normalizeStatusLineToken(token))
    .filter((token): token is LinxStatusLineToken => token !== null)

  return tokens.length > 0 ? tokens : null
}

function readStatusLineConfigObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {}
  }

  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return {}
}

export function normalizeStatusLineToken(value: unknown): LinxStatusLineToken | null {
  if (typeof value !== 'string') {
    return null
  }
  const token = value.trim().toLowerCase().replace(/_/gu, '-')
  if (!token) {
    return null
  }
  if (token in STATUS_LINE_TOKEN_ALIASES) {
    return STATUS_LINE_TOKEN_ALIASES[token]!
  }
  return STATUS_LINE_TOKENS.has(token) ? token as LinxStatusLineToken : null
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return undefined
}

export function calculateSessionUsage(session: any): {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cacheRate: number | null
} {
  const entries = session?.sessionManager?.getEntries?.()
  if (!Array.isArray(entries)) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheRate: null }
  }

  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  for (const entry of entries) {
    const message = entry?.type === 'message' ? entry.message : undefined
    if (message?.role !== 'assistant' || !message.usage) {
      continue
    }
    input += safeTokenCount(message.usage.input)
    output += safeTokenCount(message.usage.output)
    cacheRead += safeTokenCount(message.usage.cacheRead)
    cacheWrite += safeTokenCount(message.usage.cacheWrite)
  }

  const totalPromptTokens = input + cacheRead + cacheWrite
  if (totalPromptTokens <= 0) {
    return { input, output, cacheRead, cacheWrite, cacheRate: null }
  }

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cacheRate: Math.round((cacheRead / totalPromptTokens) * 100),
  }
}

function formatContextUsage(context: ReturnType<typeof createStatusLineContext>): string {
  const contextWindow = safeTokenCount(context.contextUsage?.contextWindow) || safeTokenCount(context.model.contextWindow)
  const percent = typeof context.contextUsage?.percent === 'number' && Number.isFinite(context.contextUsage.percent)
    ? `${context.contextUsage.percent.toFixed(1)}%`
    : '?'
  return `${percent}/${formatTokenCount(contextWindow)}${context.autoCompactEnabled ? ' (auto)' : ''}`
}

function formatContextRemaining(context: ReturnType<typeof createStatusLineContext>): string | null {
  const contextWindow = safeTokenCount(context.contextUsage?.contextWindow) || safeTokenCount(context.model.contextWindow)
  const percent = typeof context.contextUsage?.percent === 'number' && Number.isFinite(context.contextUsage.percent)
    ? context.contextUsage.percent
    : null
  if (!contextWindow || percent === null) {
    return null
  }
  const used = Math.round(contextWindow * percent / 100)
  const remaining = Math.max(0, contextWindow - used)
  return `ctx left ${formatTokenCount(remaining)}`
}

function formatModelWithReasoning(context: ReturnType<typeof createStatusLineContext>): string {
  const model = normalizeText(context.model.id) ?? 'no-model'
  if (!context.model.reasoning) {
    return model
  }
  return `${model} • ${formatThinkingLevel(context)}`
}

function formatThinkingLevel(context: ReturnType<typeof createStatusLineContext>): string {
  const thinkingLevel = normalizeText(context.state.thinkingLevel) ?? 'off'
  return thinkingLevel === 'off' ? 'thinking off' : thinkingLevel
}

function formatCurrentDir(session: any): string | null {
  const cwd = normalizeText(session?.sessionManager?.getCwd?.())
  if (!cwd) {
    return null
  }
  return formatCwdForStatusLine(cwd, process.env.HOME || process.env.USERPROFILE)
}

function formatCwdForStatusLine(cwd: string, home: string | undefined): string {
  if (!home) {
    return cwd
  }
  const resolvedCwd = resolve(cwd)
  const resolvedHome = resolve(home)
  const relativeToHome = relative(resolvedHome, resolvedCwd)
  const isInsideHome = relativeToHome === ''
    || (relativeToHome !== '..' && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome))

  if (!isInsideHome) {
    return cwd
  }
  return relativeToHome === '' ? '~' : `~${sep}${relativeToHome}`
}

function fitStatusLine(line: string, width: number, useColors: boolean): string {
  const truncated = truncateToWidth(line, width)
  const visible = visibleWidth(truncated)
  const padded = visible < width ? `${truncated}${' '.repeat(width - visible)}` : truncated

  return useColors ? `\x1b[2m${padded}\x1b[22m` : padded
}

export function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString()
  }
  if (count < 10000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  if (count < 1000000) {
    return `${Math.round(count / 1000)}k`
  }
  if (count < 10000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  return `${Math.round(count / 1000000)}M`
}

function safeTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
