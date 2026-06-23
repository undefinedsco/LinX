import { basename } from 'node:path'
import { keyHint, rawKeyHint } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import { LINX_TUI_KEYMAP_COMMAND, LINX_TUI_KEYMAP_LABEL, LINX_TUI_LOGIN_COMMAND } from './linx-tui-contract.js'
import { loadCredentials } from './credentials-store.js'
import { extractUsernameFromWebId, resolveProfileDisplayName } from './profile-identity.js'
import { suppressPodStatusOutput } from './pod-status-output.js'
import { LINX_CLI_VERSION } from './linx-self-update.js'
import { resolveRuntimeProviderLabel } from './linx-runtime-provider-label.js'
import { registerLinxTerminalTitleHandler } from './linx-terminal-title-router.js'
import { replaceLinxInteractiveHeader } from './linx-interactive-header-host.js'

export function installLinxWelcomeHeader(interactive: any): void {
  registerLinxTerminalTitleHandler(interactive, {
    name: 'linx-welcome-header:terminal-title',
    priority: 0,
    handler({ interactive: titleInteractive }) {
      setLinxWelcomeTerminalTitle(titleInteractive)
    },
  })
}

function setLinxWelcomeTerminalTitle(interactive: any): void {
  const cwd = interactive.sessionManager?.getCwd?.() || process.cwd()
  const sessionName = interactive.sessionManager?.getSessionName?.()
  const suffix = sessionName ? `${sessionName} - ${basename(cwd)}` : basename(cwd)
  interactive.ui?.terminal?.setTitle?.(`LinX - ${suffix}`)
}

export function renderLinxWelcomeHeaderAfterInit(interactive: any): void {
  const quietStartup = interactive?.options?.verbose ? false : interactive?.settingsManager?.getQuietStartup?.()
  if (quietStartup) {
    return
  }

  let profileDisplayName: string | null = null
  const replacement = new LinxWelcomeCard(() => buildLinxWelcomeCardState(interactive, profileDisplayName))
  replaceLinxInteractiveHeader(interactive, replacement)
  interactive.updateTerminalTitle?.()

  void suppressPodStatusOutput(() => resolveProfileDisplayName())
    .then((displayName) => {
      if (!displayName || displayName === profileDisplayName) {
        return
      }
      profileDisplayName = displayName
      replacement.invalidate()
      interactive.ui?.requestRender?.()
    })
    .catch(() => undefined)
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

export function buildLinxWelcomeCardState(interactive: any, profileDisplayName: string | null = null): HeaderState {
  const credentials = loadCredentials()
  const webId = credentials?.webId ?? 'not logged in'
  const workspace = interactive?.sessionManager?.getCwd?.() || process.cwd()
  const sessionId = interactive?.sessionManager?.getSessionId?.()
  const sessionName = interactive?.sessionManager?.getSessionName?.()
  const session = sessionName && sessionId ? `${sessionName} (${formatSessionId(sessionId)})` : formatSessionId(sessionId)
  const model = interactive?.session?.model?.id ?? 'unknown-model'

  return {
    webId,
    username: profileDisplayName ?? extractUsernameFromWebId(webId),
    provider: resolveRuntimeProviderLabel(interactive),
    model,
    workspace,
    session,
    next: [
      safeKeyHint('tui.input.submit', 'send'),
      safeKeyHint('app.model.select', 'model'),
      safeRawKeyHint(LINX_TUI_LOGIN_COMMAND, 'auth'),
      safeRawKeyHint(LINX_TUI_KEYMAP_COMMAND, LINX_TUI_KEYMAP_LABEL),
    ].join(' \x1b[2m·\x1b[22m '),
  }
}

function safeKeyHint(keybinding: string, description: string): string {
  try {
    return keyHint(keybinding as never, description)
  } catch {
    return `\x1b[2m${keybinding}\x1b[22m \x1b[2m${description}\x1b[22m`
  }
}

function safeRawKeyHint(key: string, description: string): string {
  try {
    return rawKeyHint(key, description)
  } catch {
    return `\x1b[2m${key}\x1b[22m \x1b[2m${description}\x1b[22m`
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

function formatSessionId(sessionId: unknown): string {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return 'new session'
  }
  return sessionId.trim()
}

function padLine(line: string, width: number): string {
  const visible = visibleWidth(line)
  if (visible >= width) {
    return truncateToWidth(line, width)
  }
  return `${line}${' '.repeat(width - visible)}`
}
