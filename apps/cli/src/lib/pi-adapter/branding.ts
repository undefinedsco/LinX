import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { LINX_HOME_DIRNAME } from '@undefineds.co/models/client'
import { keyHint, keyText, rawKeyHint } from '@mariozechner/pi-coding-agent'
import { Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@mariozechner/pi-tui'
import { loadCredentials } from '../credentials-store.js'
import { extractUsernameFromWebId, resolveProfileDisplayName } from '../profile-identity.js'

export const LINX_AGENT_DIR = join(homedir(), LINX_HOME_DIRNAME, 'agent')
export const LINX_UPDATE_PACKAGE_NAME = '@undefineds.co/linx'
export const LINX_CHANGELOG_URL = 'https://github.com/undefineds-co/linx-cli/releases'
export const LINX_CLI_VERSION = readLinxCliVersion()

export function applyLinxInteractiveBranding(interactive: any): void {
  patchTerminalTitle(interactive)
  patchVersionCheck(interactive)
  patchUpdateNotification(interactive)
  patchHeader(interactive)
}

function patchTerminalTitle(interactive: any): void {
  const original = interactive.updateTerminalTitle?.bind(interactive)
  interactive.updateTerminalTitle = function patchedUpdateTerminalTitle(): void {
    original?.()
    const cwd = this.sessionManager?.getCwd?.() || process.cwd()
    const sessionName = this.sessionManager?.getSessionName?.()
    const suffix = sessionName ? `${sessionName} - ${basename(cwd)}` : basename(cwd)
    this.ui?.terminal?.setTitle?.(`LinX - ${suffix}`)
  }
}

function patchVersionCheck(interactive: any): void {
  interactive.checkForNewVersion = async function patchedCheckForNewVersion(): Promise<string | undefined> {
    if (process.env.PI_OFFLINE) {
      return undefined
    }

    try {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(LINX_UPDATE_PACKAGE_NAME)}/latest`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) {
        return undefined
      }

      const body = await response.json() as { version?: string }
      const latest = typeof body.version === 'string' ? body.version.trim() : ''
      if (!latest || latest === this.version) {
        return undefined
      }
      return latest
    } catch {
      return undefined
    }
  }
}

function patchUpdateNotification(interactive: any): void {
  interactive.showNewVersionNotification = function patchedShowNewVersionNotification(newVersion: string): void {
    const lines = [
      '\x1b[1m\x1b[33mLinX Update Available\x1b[39m\x1b[22m',
      `\x1b[2mNew version ${newVersion} is available. \x1b[22m\x1b[36mRun: npm install -g @undefineds.co/linx\x1b[39m`,
      `\x1b[2mChangelog: \x1b[22m\x1b[36m${LINX_CHANGELOG_URL}\x1b[39m`,
    ]
    this.chatContainer?.addChild?.(new Text(lines.join('\n'), 1, 0))
    this.ui?.requestRender?.()
  }
}

function patchHeader(interactive: any): void {
  const originalInit = interactive.init.bind(interactive)
  interactive.init = async function patchedInit(): Promise<void> {
    await originalInit()

    const quietStartup = this.options?.verbose ? false : this.settingsManager?.getQuietStartup?.()
    if (quietStartup) {
      return
    }

    let profileDisplayName: string | null = null
    const replacement = new LinxWelcomeCard(() => buildHeaderState(this, profileDisplayName))
    const currentHeader = this.customHeader ?? this.builtInHeader
    const index = this.headerContainer?.children?.indexOf?.(currentHeader) ?? -1
    if (index >= 0) {
      this.headerContainer.children[index] = replacement
    }
    this.customHeader = replacement
    this.ui?.requestRender?.()
    this.updateTerminalTitle?.()

    void suppressPodStatusOutput(() => resolveProfileDisplayName())
      .then((displayName) => {
        if (!displayName || displayName === profileDisplayName) {
          return
        }
        profileDisplayName = displayName
        replacement.invalidate()
        this.ui?.requestRender?.()
      })
      .catch(() => undefined)
  }
}

type HeaderState = {
  webId: string
  username: string
  provider: string
  model: string
  workspace: string
  session: string
  next: string
}

class LinxWelcomeCard {
  constructor(private readonly getState: () => HeaderState) {}

  invalidate(): void {}

  render(width: number): string[] {
    const innerWidth = Math.max(20, width - 4)
    const state = this.getState()
    const titleBlock = [
      `\x1b[1mLinX\x1b[22m \x1b[2mv${LINX_CLI_VERSION}\x1b[22m`,
      `\x1b[1mWelcome back, ${state.username}\x1b[22m`,
    ]
    const rows = [
      renderField('WebID', state.webId, innerWidth),
      renderField('Provider', state.provider, innerWidth),
      renderField('Model', state.model, innerWidth),
      renderField('Workspace', state.workspace, innerWidth),
      renderField('Session', state.session, innerWidth),
      '',
      truncateToWidth(`\x1b[2mNext\x1b[22m      ${state.next}`, innerWidth),
    ]

    const headerLines = titleBlock.map((line) => truncateToWidth(line, innerWidth))
    const body = [
      ...headerLines.map((line) => padLine(line, innerWidth)),
      padLine('', innerWidth),
      ...rows.flatMap((line) => wrapAndPad(line, innerWidth)),
    ]

    return [
      `┌${'─'.repeat(innerWidth + 2)}┐`,
      ...body.map((line) => `│ ${line} │`),
      `└${'─'.repeat(innerWidth + 2)}┘`,
    ]
  }
}

function buildHeaderState(interactive: any, profileDisplayName: string | null = null): HeaderState {
  const credentials = loadCredentials()
  const webId = credentials?.webId ?? 'not logged in'
  const workspace = interactive?.sessionManager?.getCwd?.() || process.cwd()
  const sessionId = interactive?.sessionManager?.getSessionId?.()
  const sessionName = interactive?.sessionManager?.getSessionName?.()
  const session = sessionName && sessionId ? `${sessionName} (${shortSessionId(sessionId)})` : shortSessionId(sessionId)
  const model = interactive?.session?.model?.id ?? 'unknown-model'

  return {
    webId,
    username: profileDisplayName ?? extractUsernameFromWebId(webId),
    provider: resolveRuntimeProviderLabel(interactive),
    model,
    workspace,
    session,
    next: [
      keyHint('tui.input.submit', 'send'),
      keyHint('app.model.select', 'model'),
      rawKeyHint('/login', 'auth'),
      rawKeyHint('/help', 'help'),
    ].join(' \x1b[2m·\x1b[22m '),
  }
}

function renderField(label: string, value: string, width: number): string {
  const prefix = `\x1b[2m${label}\x1b[22m`
  const paddedPrefix = prefix + ' '.repeat(Math.max(1, 10 - visibleWidth(prefix)))
  return truncateToWidth(`${paddedPrefix} ${value}`, width)
}

function wrapAndPad(line: string, width: number): string[] {
  if (!line) {
    return [padLine('', width)]
  }

  const wrapped = wrapTextWithAnsi(line, width)
  return wrapped.length > 0
    ? wrapped.map((entry) => padLine(entry, width))
    : [padLine('', width)]
}

function shortSessionId(sessionId: unknown): string {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return 'new session'
  }
  return sessionId.length > 12 ? sessionId.slice(0, 12) : sessionId
}

function padLine(line: string, width: number): string {
  const visible = visibleWidth(line)
  if (visible >= width) {
    return truncateToWidth(line, width)
  }
  return `${line}${' '.repeat(width - visible)}`
}

function readLinxCliVersion(): string {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.1.0'
  } catch {
    return '0.1.0'
  }
}

function resolveRuntimeProviderLabel(interactive: any): string {
  const bridge = interactive?.runtimeHost?.linxAuthBridge ?? interactive?.linxAuthBridge
  if (bridge?.providerLabel) {
    return bridge.providerLabel
  }
  return 'undefineds(cloud)'
}

async function suppressPodStatusOutput<T>(operation: () => Promise<T>): Promise<T> {
  if (process.env.LINX_TUI_SHOW_POD_STATUS === '1') {
    return await operation()
  }

  const restoreStdout = patchPodStatusWriter(process.stdout)
  const restoreStderr = patchPodStatusWriter(process.stderr)
  try {
    return await operation()
  } finally {
    restoreStdout()
    restoreStderr()
  }
}

function patchPodStatusWriter(stream: NodeJS.WriteStream): () => void {
  const originalWrite = stream.write.bind(stream) as typeof stream.write
  ;(stream as unknown as { write: typeof stream.write }).write = function patchedWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean {
    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined
    const onComplete = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(encoding)
    const filtered = stripPodStatusLines(text)

    if (!filtered) {
      onComplete?.()
      return true
    }

    if (typeof chunk === 'string') {
      return originalWrite(filtered, encodingOrCallback as BufferEncoding, callback)
    }
    return originalWrite(Buffer.from(filtered, encoding), callback)
  } as typeof stream.write

  return () => {
    ;(stream as unknown as { write: typeof stream.write }).write = originalWrite
  }
}

function stripPodStatusLines(input: string): string {
  const urlPattern = String.raw`https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+`
  return input
    .replace(new RegExp(String.raw`\[Container\]\s*容器已存在:\s*${urlPattern}[ \t]*(?:\r?\n)?`, 'g'), '')
    .replace(new RegExp(String.raw`Connecting to Solid Pod:\s*${urlPattern}[ \t]*(?:\r?\n)?`, 'g'), '')
    .replace(new RegExp(String.raw`Using WebID:\s*${urlPattern}[ \t]*(?:\r?\n)?`, 'g'), '')
    .replace(/Successfully connected to Solid Pod[ \t]*(?:\r?\n)?/g, '')
}
