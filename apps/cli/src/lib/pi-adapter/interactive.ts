import { InteractiveMode } from '@mariozechner/pi-coding-agent'
import { FooterComponent } from '@mariozechner/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui'
import { applyLinxInteractiveBranding, requestLinxCloudLogin } from './branding.js'

export interface PiInteractiveBootstrap {
  init(): Promise<void>
  run(): Promise<void>
  requestLogin(reason?: LinxLoginReason): void
  stop(): void
}

export type LinxLoginReason = 'startup' | 'expired' | 'manual'

let footerPatched = false

export function bootstrapPiInteractiveMode(runtime: any): PiInteractiveBootstrap {
  patchPiFooter()
  const interactive = new InteractiveMode(runtime, {})
  applyLinxInteractiveBranding(interactive as any)
  patchInteractiveExitMessage(interactive as any)

  return {
    async init(): Promise<void> {
      await interactive.init()
      installLinxEscapeInterrupt(interactive as any)
    },
    async run(): Promise<void> {
      await interactive.run()
    },
    requestLogin(reason = 'manual'): void {
      requestLinxCloudLogin(interactive as any, reason)
    },
    stop(): void {
      interactive.stop()
    },
  }
}

export function installLinxEscapeInterrupt(interactive: any): void {
  const editor = interactive?.defaultEditor
  if (!editor || editor.__linxEscapeInterruptInstalled) {
    return
  }

  let currentOnEscape = typeof editor.onEscape === 'function'
    ? editor.onEscape
    : undefined

  Object.defineProperty(editor, 'onEscape', {
    configurable: true,
    get() {
      return function linxEscapeInterrupt(): void {
        const session = interactive?.session

        if (session?.isBashRunning && typeof session.abortBash === 'function') {
          void session.abortBash()
          return
        }

        if (isLinxSessionRunning(interactive) && typeof session?.abort === 'function') {
          void session.abort()
          return
        }

        currentOnEscape?.call(editor)
      }
    },
    set(next: unknown) {
      currentOnEscape = typeof next === 'function' ? next : undefined
    },
  })

  editor.__linxEscapeInterruptInstalled = true
}

function isLinxSessionRunning(interactive: any): boolean {
  return interactive?.session?.isStreaming === true
    || Boolean(interactive?.loadingAnimation)
    || Boolean(interactive?.autoCompactionEscapeHandler)
    || Boolean(interactive?.retryEscapeHandler)
}

function patchInteractiveExitMessage(interactive: any): void {
  const originalInit = interactive.init?.bind(interactive)
  const originalStop = interactive.stop?.bind(interactive)
  let initialized = false
  let exitMessageWritten = false

  if (typeof originalInit === 'function') {
    interactive.init = async function patchedInit(...args: unknown[]): Promise<unknown> {
      const result = await originalInit(...args)
      initialized = true
      return result
    }
  }

  if (typeof originalStop !== 'function') {
    return
  }

  interactive.stop = function patchedStop(...args: unknown[]): void {
    originalStop(...args)
    if (!initialized || exitMessageWritten || process.env.LINX_TUI_NO_EXIT_MESSAGE === '1') {
      return
    }
    exitMessageWritten = true
    if (process.stdout.isTTY) {
      process.stdout.write(`\n${buildLinxExitMessage(this)}\n`)
    }
  }
}

export function buildLinxExitMessage(interactive: any): string {
  const sessionId = interactive?.session?.sessionId
    ?? interactive?.sessionManager?.getSessionId?.()
    ?? interactive?.session?.sessionManager?.getSessionId?.()
  const usage = calculateSessionUsage(interactive?.session)
  const lines = ['LinX session closed.']

  if (usage.input > 0 || usage.output > 0 || usage.cacheRead > 0 || usage.cacheWrite > 0) {
    const usageParts = [
      `input ${formatTokenCount(usage.input)}`,
      `output ${formatTokenCount(usage.output)}`,
    ]
    if (usage.cacheRead > 0 || usage.cacheWrite > 0) {
      usageParts.push(`cache ${usage.cacheRate ?? 0}%`)
    }
    lines.push(`Token usage: ${usageParts.join(' · ')}`)
  }

  if (typeof sessionId === 'string' && sessionId.trim()) {
    lines.push(`Resume: linx resume ${sessionId}`)
  }

  return lines.join('\n')
}

function patchPiFooter(): void {
  if (footerPatched) {
    return
  }

  const originalRender = FooterComponent.prototype.render
  FooterComponent.prototype.render = function patchedRender(width: number): string[] {
    const lines = originalRender.call(this, width)
    if (Array.isArray(lines) && lines.length > 1 && typeof lines[1] === 'string') {
      const session = (this as unknown as { session?: unknown }).session
      const autoCompactEnabled = (this as unknown as { autoCompactEnabled?: boolean }).autoCompactEnabled !== false
      lines[1] = buildLinxFooterStatusLine(session, width, autoCompactEnabled)
    }
    return lines
  }
  footerPatched = true
}

function buildLinxFooterStatusLine(session: any, width: number, autoCompactEnabled: boolean): string {
  const usage = calculateSessionUsage(session)
  const state = session?.state ?? {}
  const model = state.model ?? {}
  const parts: string[] = []

  if (usage.input > 0) {
    parts.push(`↑${formatTokenCount(usage.input)}`)
  }
  if (usage.output > 0) {
    parts.push(`↓${formatTokenCount(usage.output)}`)
  }

  parts.push(formatContextUsage(session, model, autoCompactEnabled))

  if (usage.cacheRate !== null) {
    parts.push(`cache ${usage.cacheRate}%`)
  }

  parts.push(typeof model.id === 'string' && model.id ? model.id : 'no-model')
  if (model.reasoning) {
    const thinkingLevel = typeof state.thinkingLevel === 'string' && state.thinkingLevel
      ? state.thinkingLevel
      : 'off'
    parts.push(thinkingLevel === 'off' ? 'thinking off' : thinkingLevel)
  }

  return fitFooterLine(parts.join(' • '), width)
}

function fitFooterLine(line: string, width: number): string {
  const truncated = truncateToWidth(line, width)
  const visible = visibleWidth(truncated)
  const padded = visible < width ? `${truncated}${' '.repeat(width - visible)}` : truncated

  return `\x1b[2m${padded}\x1b[22m`
}

function calculateSessionUsage(session: any): {
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

function formatContextUsage(session: any, model: any, autoCompactEnabled: boolean): string {
  const contextUsage = session?.getContextUsage?.()
  const contextWindow = safeTokenCount(contextUsage?.contextWindow) || safeTokenCount(model.contextWindow)
  const percent = typeof contextUsage?.percent === 'number' && Number.isFinite(contextUsage.percent)
    ? `${contextUsage.percent.toFixed(1)}%`
    : '?'
  return `${percent}/${formatTokenCount(contextWindow)}${autoCompactEnabled ? ' (auto)' : ''}`
}

function formatTokenCount(count: number): string {
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
