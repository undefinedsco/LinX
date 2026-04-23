import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { LINX_HOME_DIRNAME } from '@linx/models/client'
import { keyHint, keyText, rawKeyHint } from '@mariozechner/pi-coding-agent'
import { Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@mariozechner/pi-tui'
import { loadCredentials } from '../credentials-store.js'

export const LINX_AGENT_DIR = join(homedir(), LINX_HOME_DIRNAME, 'agent')
export const LINX_UPDATE_PACKAGE_NAME = '@linx/cli'
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
      `\x1b[2mNew version ${newVersion} is available. \x1b[22m\x1b[36mRun: npm install -g @linx/cli\x1b[39m`,
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

    const replacement = new LinxWelcomeCard(() => buildHeaderState(this))
    const currentHeader = this.customHeader ?? this.builtInHeader
    const index = this.headerContainer?.children?.indexOf?.(currentHeader) ?? -1
    if (index >= 0) {
      this.headerContainer.children[index] = replacement
    }
    this.customHeader = replacement
    this.ui?.requestRender?.()
    this.updateTerminalTitle?.()
  }
}

type HeaderState = {
  webId: string
  provider: string
  model: string
  workspace: string
  session: string
  status: string
  next: string
}

class LinxWelcomeCard {
  constructor(private readonly getState: () => HeaderState) {}

  invalidate(): void {}

  render(width: number): string[] {
    const innerWidth = Math.max(20, width - 4)
    const state = this.getState()
    const logo = buildLogoLines()
    const titleBlock = [
      `\x1b[1mLinX\x1b[22m \x1b[2mv${LINX_CLI_VERSION}\x1b[22m`,
      '\x1b[1mReady to chat\x1b[22m',
      `\x1b[2m${state.provider}\x1b[22m`,
    ]
    const rows = [
      renderField('WebID', state.webId, innerWidth),
      renderField('Provider', state.provider, innerWidth),
      renderField('Model', state.model, innerWidth),
      renderField('Workspace', state.workspace, innerWidth),
      renderField('Session', state.session, innerWidth),
      renderField('Status', state.status, innerWidth),
      '',
      truncateToWidth(`\x1b[2mNext\x1b[22m      ${state.next}`, innerWidth),
    ]

    const headerLines = mergeColumns(logo, titleBlock, innerWidth)
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

function buildHeaderState(interactive: any): HeaderState {
  const credentials = loadCredentials()
  const webId = credentials?.webId ?? 'not logged in'
  const workspace = interactive?.sessionManager?.getCwd?.() || process.cwd()
  const sessionName = interactive?.sessionManager?.getSessionName?.() || basename(workspace)
  const model = interactive?.session?.model?.id ?? 'unknown-model'

  return {
    webId,
    provider: resolveRuntimeProviderLabel(interactive),
    model,
    workspace,
    session: sessionName,
    status: 'Ready',
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

function buildLogoLines(): string[] {
  const pencil = '\x1b[35m'
  const pen = '\x1b[37m'
  const reset = '\x1b[39m'
  return [
    `${pencil}╲══◥${reset}`,
    ` ${pen}◣${reset}╳${pencil}◢${reset}`,
    `${pen}◣══╱${reset}`,
  ]
}

function mergeColumns(left: string[], right: string[], width: number): string[] {
  const rows = Math.max(left.length, right.length)
  const leftWidth = Math.max(...left.map((line) => visibleWidth(line)), 0)
  const gap = '  '
  const lines: string[] = []

  for (let index = 0; index < rows; index += 1) {
    const leftLine = left[index] ?? ''
    const rightLine = right[index] ?? ''
    const paddedLeft = leftLine + ' '.repeat(Math.max(0, leftWidth - visibleWidth(leftLine)))
    lines.push(truncateToWidth(`${paddedLeft}${gap}${rightLine}`, width))
  }

  return lines
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
