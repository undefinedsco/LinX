import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { LINX_HOME_DIRNAME } from '@undefineds.co/models/client'
import { initTheme, keyHint, LoginDialogComponent, rawKeyHint } from '@mariozechner/pi-coding-agent'
import { Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@mariozechner/pi-tui'
import type { OAuthCredentials } from '@mariozechner/pi-ai'
import { loadCredentials } from '../credentials-store.js'
import { extractUsernameFromWebId, resolveProfileDisplayName } from '../profile-identity.js'

export const LINX_AGENT_DIR = join(homedir(), LINX_HOME_DIRNAME, 'agent')
export const LINX_UPDATE_PACKAGE_NAME = '@undefineds.co/linx'
export const LINX_CHANGELOG_URL = 'https://github.com/undefineds-co/linx-cli/releases'
export const LINX_CLI_VERSION = readLinxCliVersion()
const LINX_AUTH_LOGIN_IN_PROGRESS = Symbol.for('linx.tui.authLoginInProgress')
const LINX_AUTH_LOGIN_ON_INIT = Symbol.for('linx.tui.authLoginOnInit')
const LINX_AUTH_PENDING_RETRY = Symbol.for('linx.tui.authPendingRetry')
const LINX_AUTH_LOGIN_SCHEDULED = Symbol.for('linx.tui.authLoginScheduled')
const LINX_AUTH_REPORTING_ERROR = Symbol.for('linx.tui.authReportingError')
const LINX_UPDATE_IN_PROGRESS = Symbol.for('linx.tui.updateInProgress')
const LINX_PROVIDER_ID = 'undefineds'
const AUTH_OPTION_BROWSER = 'Authorize in browser'
const AUTH_OPTION_API_KEY = 'Enter API key'
const AUTH_OPTION_EXIT = 'Exit'
const UPDATE_OPTION_INSTALL = 'Install update and restart'
const UPDATE_OPTION_CHANGELOG = 'Open changelog'
const UPDATE_OPTION_LATER = 'Later'

type LinxAuthReason = 'startup' | 'expired' | 'manual'

type LinxAuthPendingRetry = {
  continueFromId?: string | null
  promptText?: string
  promptParentId?: string | null
}

export function applyLinxInteractiveBranding(interactive: any): void {
  patchTerminalTitle(interactive)
  patchVersionCheck(interactive)
  patchUpdateNotification(interactive)
  patchNativeOAuthSelectors(interactive)
  patchLoginCommand(interactive)
  patchAuthExpiredSessionEvents(interactive)
  patchAuthExpiredLoginPrompt(interactive)
  patchHeader(interactive)
}

export function requestLinxCloudLogin(interactive: any, reason: LinxAuthReason = 'manual'): void {
  if (!interactive.isInitialized) {
    interactive[LINX_AUTH_LOGIN_ON_INIT] = reason
    return
  }
  void startLinxCloudLogin(interactive, { reason })
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
      if (!latest || !isVersionNewer(latest, LINX_CLI_VERSION)) {
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
    void showLinxUpdateSelector(this, newVersion)
  }
}

async function showLinxUpdateSelector(interactive: any, newVersion: string): Promise<void> {
  if (interactive[LINX_UPDATE_IN_PROGRESS]) {
    return
  }
  interactive[LINX_UPDATE_IN_PROGRESS] = true
  try {
    const title = [
      'LinX update available',
      `Current ${LINX_CLI_VERSION} -> latest ${newVersion}`,
      'Choose how to handle this update.',
    ].join('\n')
    const options = [UPDATE_OPTION_INSTALL, UPDATE_OPTION_CHANGELOG, UPDATE_OPTION_LATER]
    const selected = typeof interactive.showExtensionSelector === 'function'
      ? await interactive.showExtensionSelector(title, options)
      : undefined

    if (selected === UPDATE_OPTION_INSTALL) {
      await installLinxUpdateAndRestart(interactive, newVersion)
      return
    }

    if (selected === UPDATE_OPTION_CHANGELOG) {
      openExternalUrl(LINX_CHANGELOG_URL, interactive)
      interactive.showStatus?.(`Opened LinX changelog for ${newVersion}.`)
      return
    }

    if (!selected) {
      showLinxUpdateFallback(interactive, newVersion)
      return
    }

    interactive.showStatus?.(`Skipped LinX ${newVersion} for now.`)
  } finally {
    interactive[LINX_UPDATE_IN_PROGRESS] = false
  }
}

async function installLinxUpdateAndRestart(interactive: any, newVersion: string): Promise<void> {
  interactive.showStatus?.(`Installing LinX ${newVersion}...`)
  interactive.ui?.requestRender?.()
  try {
    await runNpmInstallLatest()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showError?.(`LinX update failed: ${message}`)
    return
  }

  interactive.showStatus?.(`LinX ${newVersion} installed. Restarting...`)
  interactive.ui?.requestRender?.()
  restartCurrentProcess(interactive)
}

function runNpmInstallLatest(): Promise<void> {
  const npmCommand = process.env.npm_execpath || 'npm'
  const args = ['install', '-g', '--omit=peer', `${LINX_UPDATE_PACKAGE_NAME}@latest`]
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `npm install exited with code ${code ?? 'unknown'}`))
    })
  })
}

function restartCurrentProcess(interactive: any): void {
  const child = spawn(process.execPath, process.argv.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    detached: false,
  })
  child.on('error', (error) => {
    interactive.showError?.(`LinX restart failed: ${error.message}`)
  })
  interactive.stop?.()
  setTimeout(() => process.exit(0), 50)
}

function showLinxUpdateFallback(interactive: any, newVersion: string): void {
  const lines = [
    '\x1b[1m\x1b[33mLinX update available\x1b[39m\x1b[22m',
    `\x1b[2mCurrent ${LINX_CLI_VERSION} -> latest ${newVersion}\x1b[22m`,
    `\x1b[2mRun \x1b[22m\x1b[36mnpm install -g ${LINX_UPDATE_PACKAGE_NAME}@latest\x1b[39m\x1b[2m if this terminal cannot show the update selector.\x1b[22m`,
    `\x1b[2mChangelog: \x1b[22m\x1b[36m${LINX_CHANGELOG_URL}\x1b[39m`,
  ]
  interactive.chatContainer?.addChild?.(new Text(lines.join('\n'), 1, 0))
  interactive.ui?.requestRender?.()
}

function patchLoginCommand(interactive: any): void {
  const originalSetup = interactive.setupEditorSubmitHandler?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive.setupEditorSubmitHandler = function patchedLinxLoginSetupEditorSubmitHandler(): void {
    originalSetup()

    const originalSubmit = this.defaultEditor?.onSubmit?.bind(this.defaultEditor)
    if (typeof originalSubmit !== 'function') {
      return
    }

    this.defaultEditor.onSubmit = async (text: string): Promise<void> => {
      const command = text.trim()
      if (command === '/login') {
        this.editor?.setText?.('')
        await startLinxCloudLogin(this)
        return
      }
      await originalSubmit(text)
    }
  }
}

function patchNativeOAuthSelectors(interactive: any): void {
  interactive.showOAuthSelector = async function patchedLinxOAuthSelector(mode: 'login' | 'logout' = 'login'): Promise<void> {
    if (mode === 'logout') {
      const authStorage = this.session?.modelRegistry?.authStorage
      authStorage?.logout?.(LINX_PROVIDER_ID)
      authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, '')
      await refreshLinxAuthState(this)
      this.showStatus?.('Logged out of LinX Cloud.')
      return
    }

    await startLinxCloudLogin(this, { reason: 'manual' })
  }

  interactive.showLoginDialog = async function patchedLinxLoginDialog(providerId?: string): Promise<void> {
    if (!providerId || providerId === LINX_PROVIDER_ID) {
      await startLinxCloudLogin(this, { reason: 'manual' })
      return
    }

    this.showStatus?.('LinX only supports LinX Cloud authentication in this TUI.')
    await startLinxCloudLogin(this, { reason: 'manual' })
  }
}

function patchAuthExpiredSessionEvents(interactive: any): void {
  const originalHandleEvent = interactive.handleEvent?.bind(interactive)
  if (typeof originalHandleEvent !== 'function') {
    return
  }

  interactive.handleEvent = async function patchedHandleEvent(event: unknown): Promise<unknown> {
    if (eventHasLinxAuthExpiredError(event)) {
      prepareLinxAuthExpiredRetry(this)
      suppressLinxAuthExpiredAssistantError(this)
      scheduleLinxCloudLogin(this, 'expired')
      return undefined
    }

    const result = await originalHandleEvent(event)
    return result
  }
}

function patchAuthExpiredLoginPrompt(interactive: any): void {
  const originalShowError = interactive.showError?.bind(interactive)
  if (typeof originalShowError !== 'function') {
    return
  }

  interactive.showError = function patchedShowError(errorMessage: unknown): unknown {
    const text = typeof errorMessage === 'string' ? errorMessage : String(errorMessage)
    if (!isLinxAuthExpiredError(text)) {
      return originalShowError(errorMessage)
    }

    scheduleLinxCloudLogin(this, 'expired')
    return undefined
  }
}

function isLinxAuthExpiredError(text: string): boolean {
  const normalized = stripAnsi(text).toLowerCase()
  return normalized.includes('linx cloud login expired')
    || normalized.includes('invalid solid token')
    || (normalized.includes('chat request failed (401)') && normalized.includes('unauthorized'))
}

function eventHasLinxAuthExpiredError(event: unknown): boolean {
  if (!isRecord(event)) {
    return false
  }
  const message = isRecord(event.message) ? event.message : undefined
  const errorMessage = typeof message?.errorMessage === 'string' ? message.errorMessage : ''
  const error = isRecord(event.error) ? event.error : undefined
  const nestedErrorMessage = typeof error?.errorMessage === 'string' ? error.errorMessage : ''
  return isLinxAuthExpiredError(`${errorMessage}\n${nestedErrorMessage}`)
}

async function startLinxCloudLogin(interactive: any, options: { reason?: LinxAuthReason } = {}): Promise<void> {
  if (interactive[LINX_AUTH_LOGIN_IN_PROGRESS]) {
    return
  }
  interactive[LINX_AUTH_LOGIN_IN_PROGRESS] = true

  try {
    const authStorage = interactive.session?.modelRegistry?.authStorage
    if (!authStorage) {
      prefillLoginCommand(interactive)
      return
    }

    const reason = options.reason ?? 'manual'
    const selected = await selectLinxAuthMethod(interactive, reason)
    if (!selected) {
      interactive.showStatus?.('LinX Cloud authorization cancelled.')
      return
    }

    if (selected === AUTH_OPTION_BROWSER) {
      if (typeof authStorage.login !== 'function') {
        prefillLoginCommand(interactive)
        return
      }
      await runLinxCloudBrowserLogin(interactive, authStorage, reason)
      await refreshLinxAuthState(interactive)
      await finishLinxAuthSuccess(interactive, reason, 'Browser authorization complete.')
      return
    }

    if (selected === AUTH_OPTION_API_KEY) {
      await promptForLinxApiKey(interactive, reason)
      return
    }

    if (selected === AUTH_OPTION_EXIT) {
      if (reason === 'startup') {
        interactive.stop?.()
      } else {
        interactive.showStatus?.('LinX Cloud authorization cancelled.')
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportLinxLoginError(interactive, message)
  } finally {
    interactive[LINX_AUTH_LOGIN_IN_PROGRESS] = false
  }
}

function scheduleLinxCloudLogin(interactive: any, reason: LinxAuthReason): void {
  if (interactive[LINX_AUTH_LOGIN_IN_PROGRESS] || interactive[LINX_AUTH_LOGIN_SCHEDULED]) {
    return
  }

  interactive[LINX_AUTH_LOGIN_SCHEDULED] = true
  setTimeout(() => {
    interactive[LINX_AUTH_LOGIN_SCHEDULED] = false
    void startLinxCloudLogin(interactive, { reason })
  }, 0)
}

function reportLinxLoginError(interactive: any, message: string): void {
  const rendered = normalizeLinxLoginError(message)
  if (interactive[LINX_AUTH_REPORTING_ERROR]) {
    interactive.showStatus?.(rendered)
    return
  }

  interactive[LINX_AUTH_REPORTING_ERROR] = true
  try {
    if (typeof interactive.showError === 'function') {
      interactive.showError(rendered)
    } else {
      interactive.showStatus?.(rendered)
    }
  } finally {
    interactive[LINX_AUTH_REPORTING_ERROR] = false
  }
}

function normalizeLinxLoginError(message: string): string {
  const oidcCallbackError = /^OIDC callback returned\b/i.test(message)
  if (oidcCallbackError) {
    return `LinX Cloud login failed: ${message}`
  }
  if (/server_error/i.test(message)) {
    return `LinX Cloud login failed: the identity server rejected this browser login. ${message}`
  }
  return `LinX Cloud login failed: ${message}`
}

async function selectLinxAuthMethod(interactive: any, reason: LinxAuthReason): Promise<string | undefined> {
  const title = buildLinxAuthPromptTitle(reason, resolveRuntimeProviderLabel(interactive))
  const options = [AUTH_OPTION_BROWSER, AUTH_OPTION_API_KEY, AUTH_OPTION_EXIT]
  if (typeof interactive.showExtensionSelector === 'function') {
    return await interactive.showExtensionSelector(title, options)
  }

  showLinxAuthFallback(interactive, title, options)
  return undefined
}

function buildLinxAuthPromptTitle(reason: LinxAuthReason, providerLabel: string): string {
  if (reason === 'startup') {
    return [
      'LinX Cloud login required',
      `Connect to ${providerLabel} before using LinX TUI.`,
      'Choose a sign-in method.',
    ].join('\n')
  }

  if (reason === 'expired') {
    return [
      'LinX Cloud login expired',
      'Your current Solid token was rejected by LinX Cloud.',
      'Re-authorize or provide an API key, then retry your message.',
    ].join('\n')
  }

  return [
    'LinX Cloud authorization',
    `Choose how LinX should authenticate with ${providerLabel}.`,
  ].join('\n')
}

function showLinxAuthFallback(interactive: any, title: string, options: string[]): void {
  interactive.chatContainer?.addChild?.(new Text([
    `\x1b[1m${title}\x1b[22m`,
    '',
    ...options.map((option) => `- ${option}`),
    '',
    'This terminal build cannot render the LinX auth selector. Run `linx login` in another shell.',
  ].join('\n'), 1, 0))
  interactive.ui?.requestRender?.()
}

async function promptForLinxApiKey(interactive: any, reason: LinxAuthReason): Promise<void> {
  if (typeof interactive.showExtensionInput !== 'function') {
    interactive.showError?.('This terminal build cannot collect an API key inside the TUI.')
    return
  }

  const apiKey = await interactive.showExtensionInput(
    [
      reason === 'expired' ? 'Enter LinX Cloud API key' : 'Use LinX Cloud API key',
      'Paste a key for this TUI session. Press Escape to cancel.',
    ].join('\n'),
    'linx API key',
  )
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) {
    interactive.showStatus?.('LinX Cloud API key entry cancelled.')
    return
  }

  const authStorage = interactive.session?.modelRegistry?.authStorage
  authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, trimmed)
  authStorage?.set?.(LINX_PROVIDER_ID, { type: 'api_key', key: trimmed })
  await refreshLinxAuthState(interactive)
  await finishLinxAuthSuccess(interactive, reason, 'API key saved for this TUI session.')
}

async function finishLinxAuthSuccess(interactive: any, reason: LinxAuthReason, detail: string): Promise<void> {
  const prefix = authStatusPrefix(reason)
  const retryStarted = await retryPendingLinxAuthTurn(interactive, reason)
  if (retryStarted) {
    interactive.showStatus?.(`${prefix} ${detail} Retrying your message...`)
    return
  }

  const suffix = reason === 'expired' ? ' Retry your message.' : ''
  interactive.showStatus?.(`${prefix} ${detail}${suffix}`)
}

function prepareLinxAuthExpiredRetry(interactive: any): void {
  if (interactive[LINX_AUTH_PENDING_RETRY]) {
    return
  }

  const session = interactive.session
  const sessionManager = session?.sessionManager
  const leafId = typeof sessionManager?.getLeafId === 'function'
    ? sessionManager.getLeafId()
    : undefined
  const leafEntry = leafId && typeof sessionManager?.getEntry === 'function'
    ? sessionManager.getEntry(leafId)
    : undefined
  const leafMessage = leafEntry?.type === 'message' ? leafEntry.message : undefined
  const userEntry = findLastUserMessageEntry(sessionManager, leafId)
  const promptText = extractUserMessageText(userEntry?.message)
    ?? extractUserMessageText(leafMessage)
    ?? findLastUserMessageText(session?.state?.messages)

  const pending = {
    continueFromId: userEntry?.id ?? (leafMessage?.role === 'user' ? leafId : undefined),
    promptText,
    promptParentId: userEntry?.parentId ?? (leafMessage?.role === 'user' ? leafEntry.parentId : undefined),
  } satisfies LinxAuthPendingRetry
  interactive[LINX_AUTH_PENDING_RETRY] = pending

  // AgentSession persists the assistant error after TUI subscribers run. Restore
  // the active branch on the next tick so "continue" never resumes from the
  // failed auth assistant message if the user cancels or login fails.
  setTimeout(() => {
    if (interactive[LINX_AUTH_PENDING_RETRY] === pending) {
      restoreLinxRetryBranch(interactive.session, pending.continueFromId)
    }
  }, 0)
}

function suppressLinxAuthExpiredAssistantError(interactive: any): void {
  const streamingComponent = interactive.streamingComponent
  if (streamingComponent) {
    interactive.chatContainer?.removeChild?.(streamingComponent)
  }

  interactive.streamingComponent = undefined
  interactive.streamingMessage = undefined
  interactive.footer?.invalidate?.()
  interactive.ui?.requestRender?.()
}

async function retryPendingLinxAuthTurn(interactive: any, reason: LinxAuthReason): Promise<boolean> {
  if (reason !== 'expired') {
    return false
  }

  const pending = interactive[LINX_AUTH_PENDING_RETRY] as LinxAuthPendingRetry | undefined
  if (!pending) {
    return false
  }
  interactive[LINX_AUTH_PENDING_RETRY] = undefined

  const session = interactive.session
  const sessionManager = session?.sessionManager
  if (!session || !sessionManager) {
    return false
  }

  await session.agent?.waitForIdle?.()

  try {
    restoreLinxRetryBranch(session, pending.continueFromId)
    if (typeof session.agent?.continue === 'function') {
      startLinxContinuation(interactive, session, pending)
      return true
    }
  } catch (error) {
    if (!pending.promptText) {
      throw error
    }
  }

  if (!pending.promptText || typeof session.prompt !== 'function') {
    return false
  }

  restoreLinxRetryBranch(session, pending.promptParentId)
  const promptResult = session.prompt(pending.promptText)
  if (isPromiseLike(promptResult)) {
    promptResult.catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      interactive.showError?.(`LinX Cloud retry failed: ${message}`)
    })
  }
  return true
}

function startLinxContinuation(interactive: any, session: any, pending: LinxAuthPendingRetry): void {
  try {
    const result = session.agent.continue()
    if (isPromiseLike(result)) {
      result.catch((error) => {
        void retryLinxPromptFallback(interactive, session, pending, error)
      })
    }
  } catch (error) {
    void retryLinxPromptFallback(interactive, session, pending, error)
  }
}

async function retryLinxPromptFallback(
  interactive: any,
  session: any,
  pending: LinxAuthPendingRetry,
  cause: unknown,
): Promise<void> {
  if (!pending.promptText || typeof session?.prompt !== 'function') {
    const message = cause instanceof Error ? cause.message : String(cause)
    interactive.showError?.(`LinX Cloud retry failed: ${message}`)
    return
  }

  try {
    restoreLinxRetryBranch(session, pending.promptParentId)
    await session.prompt(pending.promptText)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showError?.(`LinX Cloud retry failed: ${message}`)
  }
}

function restoreLinxRetryBranch(session: any, leafId: string | null | undefined): void {
  const sessionManager = session?.sessionManager
  if (!sessionManager) {
    return
  }

  if (typeof leafId === 'string' && leafId) {
    sessionManager.branch?.(leafId)
  } else if (leafId === null) {
    sessionManager.resetLeaf?.()
  }

  const context = sessionManager.buildSessionContext?.()
  if (context?.messages && session.agent?.state) {
    session.agent.state.messages = context.messages
  }
}

function findLastUserMessageText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) {
    return undefined
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractUserMessageText(messages[index])
    if (text) {
      return text
    }
  }
  return undefined
}

function findLastUserMessageEntry(
  sessionManager: any,
  leafId: unknown,
): { id: string; parentId?: string | null; message: unknown } | undefined {
  const branch = typeof sessionManager?.getBranch === 'function' && typeof leafId === 'string'
    ? sessionManager.getBranch(leafId)
    : undefined
  const entries = Array.isArray(branch) && branch.length > 0
    ? branch
    : typeof sessionManager?.getEntries === 'function'
      ? sessionManager.getEntries()
      : []

  if (!Array.isArray(entries)) {
    return undefined
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      isRecord(entry)
      && entry.type === 'message'
      && typeof entry.id === 'string'
      && isRecord(entry.message)
      && entry.message.role === 'user'
    ) {
      return {
        id: entry.id,
        parentId: normalizeParentId(entry.parentId),
        message: entry.message,
      }
    }
  }

  return undefined
}

function normalizeParentId(parentId: unknown): string | null | undefined {
  if (typeof parentId === 'string') {
    return parentId
  }
  if (parentId === null) {
    return null
  }
  return undefined
}

function extractUserMessageText(message: unknown): string | undefined {
  if (!isRecord(message) || message.role !== 'user') {
    return undefined
  }

  const content = message.content
  if (typeof content === 'string') {
    return content.trim() || undefined
  }
  if (!Array.isArray(content)) {
    return undefined
  }

  const text = content
    .filter((entry): entry is { type: string; text: string } => (
      isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string'
    ))
    .map((entry) => entry.text)
    .join('')
    .trim()
  return text || undefined
}

async function refreshLinxAuthState(interactive: any): Promise<void> {
  interactive.session?.modelRegistry?.refresh?.()
  await interactive.updateAvailableProviderCount?.()
  interactive.ui?.requestRender?.()
}

function authStatusPrefix(reason: LinxAuthReason): string {
  if (reason === 'expired') {
    return 'LinX Cloud login refreshed.'
  }
  if (reason === 'startup') {
    return 'LinX Cloud connected.'
  }
  return 'LinX Cloud authorization updated.'
}

async function runLinxCloudLogin(
  interactive: any,
  authStorage: { login(providerId: string, callbacks: unknown): Promise<unknown> },
  reason: LinxAuthReason,
): Promise<void> {
  await authStorage.login(LINX_PROVIDER_ID, {
    forceFresh: true,
    onAuth(info: { url: string; instructions?: string }) {
      showLinxLoginUrl(interactive, info)
      openLoginUrl(info.url, interactive)
      if (info.instructions) {
        interactive.showStatus?.(info.instructions)
      }
    },
    onProgress(message: string) {
      interactive.showStatus?.(message)
      interactive.ui?.requestRender?.()
    },
    onManualCodeInput(signal?: AbortSignal) {
      return promptForLinxManualRedirectUrl(interactive, signal)
    },
  } satisfies {
    forceFresh: boolean
    onAuth(info: { url: string; instructions?: string }): void
    onProgress(message: string): void
    onManualCodeInput?: (signal?: AbortSignal) => Promise<string>
  })
  syncRuntimeCredential(interactive)
}

async function runLinxCloudBrowserLogin(
  interactive: any,
  authStorage: { login(providerId: string, callbacks: unknown): Promise<unknown> },
  reason: LinxAuthReason,
): Promise<void> {
  if (canRenderLinxLoginDialog(interactive)) {
    try {
      await runLinxCloudLoginDialog(interactive, authStorage, reason)
      return
    } catch (error) {
      if (!isThemeInitializationError(error)) {
        throw error
      }
      interactive.showStatus?.('LinX Cloud login prompt unavailable before TUI theme initialization; falling back to browser login.')
    }
  }

  await runLinxCloudLogin(interactive, authStorage, reason)
}

function canRenderLinxLoginDialog(interactive: any): boolean {
  return Boolean(
    interactive.ui
      && typeof interactive.editorContainer?.clear === 'function'
      && typeof interactive.editorContainer?.addChild === 'function'
      && typeof interactive.ui?.setFocus === 'function'
      && typeof interactive.ui?.requestRender === 'function'
      && interactive.editor,
  )
}

async function runLinxCloudLoginDialog(
  interactive: any,
  authStorage: { login(providerId: string, callbacks: unknown): Promise<unknown> },
  reason: LinxAuthReason,
): Promise<void> {
  ensurePiThemeInitialized(interactive)
  const dialog = new LoginDialogComponent(interactive.ui, LINX_PROVIDER_ID, () => undefined)
  const restoreEditor = (): void => {
    interactive.editorContainer.clear()
    interactive.editorContainer.addChild(interactive.editor)
    interactive.ui?.setFocus?.(interactive.editor)
    interactive.ui?.requestRender?.()
  }

  interactive.editorContainer.clear()
  interactive.editorContainer.addChild(dialog)
  interactive.ui?.setFocus?.(dialog)
  interactive.ui?.requestRender?.()

  let manualRedirectResolve: ((value: string) => void) | undefined
  let manualRedirectReject: ((error: unknown) => void) | undefined
  const manualRedirectPromise = new Promise<string>((resolve, reject) => {
    manualRedirectResolve = resolve
    manualRedirectReject = reject
  })

  try {
    await authStorage.login(LINX_PROVIDER_ID, {
      forceFresh: true,
      onAuth(info: { url: string; instructions?: string }) {
        dialog.showAuth(info.url, info.instructions)
        dialog.showManualInput('Paste redirect URL below, or complete login in browser:')
          .then((value) => {
            if (value && manualRedirectResolve) {
              manualRedirectResolve(value)
              manualRedirectResolve = undefined
              manualRedirectReject = undefined
            }
          })
          .catch((error) => {
            if (manualRedirectReject) {
              manualRedirectReject(error)
              manualRedirectResolve = undefined
              manualRedirectReject = undefined
            }
          })
      },
      onProgress(message: string) {
        dialog.showProgress(message)
      },
      onManualCodeInput(signal?: AbortSignal) {
        return waitForLinxDialogManualRedirect(manualRedirectPromise, signal)
      },
      signal: dialog.signal,
    } satisfies {
      forceFresh: boolean
      onAuth(info: { url: string; instructions?: string }): void
      onProgress(message: string): void
      onManualCodeInput?: (signal?: AbortSignal) => Promise<string>
      signal?: AbortSignal
    })
    syncRuntimeCredential(interactive)
  } finally {
    restoreEditor()
  }
}

function waitForLinxDialogManualRedirect(
  manualRedirectPromise: Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  if (!signal) {
    return manualRedirectPromise
  }
  if (signal.aborted) {
    return Promise.resolve('')
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve('')
    signal.addEventListener('abort', onAbort, { once: true })
    manualRedirectPromise
      .then((value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      })
      .catch((error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      })
  })
}

async function promptForLinxManualRedirectUrl(
  interactive: any,
  signal?: AbortSignal,
): Promise<string> {
  if (typeof interactive.showExtensionInput !== 'function') {
    throw new Error('Manual redirect paste is not available in this terminal. Run `linx login` in another shell if the browser callback is blocked.')
  }

  const redirect = await interactive.showExtensionInput(
    [
      'Paste final redirect URL',
      'If the browser cannot return to this terminal, paste the full callback URL below.',
    ].join('\n'),
    'http://127.0.0.1:PORT/auth/callback?code=...&state=...&iss=...',
    signal ? { signal } : undefined,
  )
  const trimmed = typeof redirect === 'string' ? redirect.trim() : ''
  if (!trimmed) {
    throw new Error('Login cancelled')
  }
  return trimmed
}

function syncRuntimeCredential(interactive: any): void {
  const authStorage = interactive.session?.modelRegistry?.authStorage
  const credential = authStorage?.get?.(LINX_PROVIDER_ID) as (Partial<OAuthCredentials> & { type?: string; key?: string }) | undefined
  if (credential?.type === 'oauth' && typeof credential.access === 'string' && credential.access) {
    authStorage.setRuntimeApiKey?.(LINX_PROVIDER_ID, credential.access)
    return
  }
  if (credential?.type === 'api_key' && typeof credential.key === 'string' && credential.key) {
    authStorage.setRuntimeApiKey?.(LINX_PROVIDER_ID, credential.key)
  }
}

function showLinxLoginUrl(interactive: any, info: { url: string; instructions?: string }): void {
  const lines = [
    '\x1b[1mLinX Cloud authorization\x1b[22m',
    'Complete consent in the browser, then return here.',
    '',
    `\x1b[36m${info.url}\x1b[39m`,
  ]
  if (info.instructions) {
    lines.push('', `\x1b[2m${info.instructions}\x1b[22m`)
  }
  interactive.chatContainer?.addChild?.(new Text(lines.join('\n'), 1, 0))
  interactive.ui?.requestRender?.()
}

function openLoginUrl(url: string, interactive: any): void {
  openExternalUrl(url, interactive)
}

function openExternalUrl(url: string, interactive: any): void {
  if (typeof interactive.openExternal === 'function') {
    interactive.openExternal(url)
    return
  }

  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
  })
  child.unref()
}

function prefillLoginCommand(interactive: any): void {
  interactive.editor?.setText?.('/login')
  interactive.ui?.setFocus?.(interactive.editor)
  interactive.ui?.requestRender?.()
}

function patchHeader(interactive: any): void {
  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }
  interactive.init = async function patchedInit(): Promise<void> {
    await originalInit()

    if (this[LINX_AUTH_LOGIN_ON_INIT]) {
      const reason = typeof this[LINX_AUTH_LOGIN_ON_INIT] === 'string'
        ? this[LINX_AUTH_LOGIN_ON_INIT] as LinxAuthReason
        : 'startup'
      this[LINX_AUTH_LOGIN_ON_INIT] = false
      queueMicrotask(() => startLinxCloudLogin(this, { reason }))
    }

    const quietStartup = this.options?.verbose ? false : this.settingsManager?.getQuietStartup?.()
    if (quietStartup) {
      return
    }

    let profileDisplayName: string | null = null
    const replacement = new LinxWelcomeCard(() => buildLinxWelcomeCardState(this, profileDisplayName))
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
      safeKeyHint('tui.input.submit', 'send', 'enter send'),
      safeKeyHint('app.model.select', 'model', 'ctrl+l model'),
      rawKeyHint('/login', 'auth'),
      rawKeyHint('/hotkeys', 'keymap'),
    ].join(' \x1b[2m·\x1b[22m '),
  }
}

function safeKeyHint(command: Parameters<typeof keyHint>[0], label: string, fallback: string): string {
  try {
    return keyHint(command, label)
  } catch (error) {
    if (isThemeInitializationError(error)) {
      return fallback
    }
    throw error
  }
}

function isThemeInitializationError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Theme not initialized')
}

function ensurePiThemeInitialized(interactive: any): void {
  try {
    keyHint('tui.select.cancel', 'cancel')
  } catch (error) {
    if (!isThemeInitializationError(error)) {
      throw error
    }
    initTheme(interactive?.settingsManager?.getTheme?.())
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

function readLinxCliVersion(): string {
  try {
    const raw = readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.1.0'
  } catch {
    return '0.1.0'
  }
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateVersion = parseSemverLike(candidate)
  const currentVersion = parseSemverLike(current)
  if (!candidateVersion || !currentVersion) {
    return candidate !== current
  }

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (candidateVersion[key] > currentVersion[key]) {
      return true
    }
    if (candidateVersion[key] < currentVersion[key]) {
      return false
    }
  }

  return !candidateVersion.prerelease && currentVersion.prerelease
}

function parseSemverLike(version: string): {
  major: number
  minor: number
  patch: number
  prerelease: boolean
} | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.+)?$/.exec(version.trim())
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Boolean(match[4]),
  }
}

function resolveRuntimeProviderLabel(interactive: any): string {
  const bridge = interactive?.runtimeHost?.linxAuthBridge ?? interactive?.linxAuthBridge
  if (bridge?.providerLabel) {
    return bridge.providerLabel
  }
  return 'undefineds'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return isRecord(value) && typeof value.then === 'function'
}
