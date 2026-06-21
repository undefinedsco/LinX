import { LoginDialogComponent } from '@earendil-works/pi-coding-agent'
import { Text } from '@earendil-works/pi-tui'
import { clearAccountSession } from './account-session.js'
import { clearCredentials } from './credentials-store.js'
import { clearOidcSessionStorage } from './oidc-session-storage.js'
import { persistSolidClientCredentialsLogin } from './solid-client-credentials-login.js'
import { LINX_RUNTIME_MANAGED_AUTH_KEY } from './linx-runtime-auth.js'
import { formatLinxCliErrorMessage } from './linx-cloud-errors.js'
import { normalizeSelectorChoice } from './linx-selector-choice.js'
import { openExternalUrl } from './linx-external-url.js'
import { resolveRuntimeProviderLabel } from './linx-runtime-provider-label.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'

const LINX_AUTH_LOGIN_IN_PROGRESS = Symbol.for('linx.tui.authLoginInProgress')
const LINX_AUTH_LOGIN_ON_INIT = Symbol.for('linx.tui.authLoginOnInit')
const LINX_AUTH_PENDING_RETRY = Symbol.for('linx.tui.authPendingRetry')
const LINX_AUTH_LOGIN_SCHEDULED = Symbol.for('linx.tui.authLoginScheduled')
const LINX_AUTH_REPORTING_ERROR = Symbol.for('linx.tui.authReportingError')
const LINX_PROVIDER_ID = 'undefineds'
const AUTH_OPTION_BROWSER = 'Authorize in browser'
const AUTH_OPTION_CLIENT_CREDENTIALS = 'Enter Solid client credentials'
const AUTH_OPTION_EXIT = 'Exit'

type LinxAuthReason = 'startup' | 'expired' | 'manual'

type LinxAuthPendingRetry = {
  continueFromId?: string | null
  promptText?: string
  promptParentId?: string | null
}

export type LinxLoginFlowOptions = {
  onLoginSettled?: (interactive: any) => void
  persistSolidClientCredentialsLogin?: typeof persistSolidClientCredentialsLogin
  resolveProviderLabel?: (interactive: any) => string
}

export function installLinxLoginFlow(interactive: any, options: LinxLoginFlowOptions = {}): void {
  patchNativeOAuthSelectors(interactive, options)
  patchLoginCommand(interactive, options)
  patchAuthExpiredSessionEvents(interactive, options)
  patchAuthExpiredLoginPrompt(interactive, options)
  patchStartupLoginPrompt(interactive, options)
}

export function shouldDeferLinxCloudLogin(interactive: any): boolean {
  return Boolean(
    interactive[LINX_AUTH_LOGIN_IN_PROGRESS]
      || interactive[LINX_AUTH_LOGIN_ON_INIT]
      || interactive[LINX_AUTH_PENDING_RETRY]
      || interactive[LINX_AUTH_LOGIN_SCHEDULED],
  )
}

export function requestLinxCloudLogin(interactive: any, reason: LinxAuthReason = 'manual', options: LinxLoginFlowOptions = {}): void {
  if (!interactive.isInitialized) {
    interactive[LINX_AUTH_LOGIN_ON_INIT] = reason
    return
  }
  void startLinxCloudLogin(interactive, { reason }, options)
}

function patchLoginCommand(interactive: any, options: LinxLoginFlowOptions): void {
  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-login',
    priority: 10,
    async handler({ interactive: target, input }) {
      if (input !== '/login') {
        return false
      }
      target.editor?.setText?.('')
      await startLinxCloudLogin(target, {}, options)
      return true
    },
  })
}

function patchNativeOAuthSelectors(interactive: any, options: LinxLoginFlowOptions): void {
  interactive.showOAuthSelector = async function patchedLinxOAuthSelector(mode: 'login' | 'logout' = 'login'): Promise<void> {
    if (mode === 'logout') {
      const authStorage = this.session?.modelRegistry?.authStorage
      authStorage?.logout?.(LINX_PROVIDER_ID)
      authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, '')
      clearAccountSession()
      clearCredentials()
      clearOidcSessionStorage()
      await refreshLinxAuthState(this)
      this.showStatus?.('Logged out of LinX Cloud.')
      return
    }

    await startLinxCloudLogin(this, { reason: 'manual' }, options)
  }

  interactive.showLoginDialog = async function patchedLinxLoginDialog(providerId?: string): Promise<void> {
    if (!providerId || providerId === LINX_PROVIDER_ID) {
      await startLinxCloudLogin(this, { reason: 'manual' }, options)
      return
    }

    this.showStatus?.('LinX only supports LinX Cloud authentication in this TUI.')
    await startLinxCloudLogin(this, { reason: 'manual' }, options)
  }
}

function patchAuthExpiredSessionEvents(interactive: any, options: LinxLoginFlowOptions): void {
  const originalHandleEvent = interactive.handleEvent?.bind(interactive)
  if (typeof originalHandleEvent !== 'function') {
    return
  }

  interactive.handleEvent = async function patchedHandleEvent(event: unknown): Promise<unknown> {
    const normalizedEvent = normalizeLinxCliErrorEvent(event)
    if (eventHasLinxAuthExpiredError(normalizedEvent)) {
      showLinxAuthExpiredRecoveryNotice(this)
      prepareLinxAuthExpiredRetry(this)
      suppressLinxAuthExpiredAssistantError(this)
      scheduleLinxCloudLogin(this, 'expired', options)
      return undefined
    }

    const result = await originalHandleEvent(normalizedEvent)
    return result
  }
}

function patchAuthExpiredLoginPrompt(interactive: any, options: LinxLoginFlowOptions): void {
  const originalShowError = interactive.showError?.bind(interactive)
  if (typeof originalShowError !== 'function') {
    return
  }

  interactive.showError = function patchedShowError(errorMessage: unknown): unknown {
    const text = typeof errorMessage === 'string' ? errorMessage : String(errorMessage)
    if (this[LINX_AUTH_REPORTING_ERROR] || !isLinxAuthExpiredError(text)) {
      return originalShowError(formatLinxCliErrorMessage(errorMessage))
    }

    showLinxAuthExpiredRecoveryNotice(this)
    prepareLinxAuthExpiredRetry(this)
    scheduleLinxCloudLogin(this, 'expired', options)
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
  const topLevelErrorMessage = typeof event.errorMessage === 'string' ? event.errorMessage : ''
  const errorMessage = typeof message?.errorMessage === 'string' ? message.errorMessage : ''
  const error = isRecord(event.error) ? event.error : undefined
  const nestedErrorMessage = typeof error?.errorMessage === 'string' ? error.errorMessage : ''
  return isLinxAuthExpiredError(`${topLevelErrorMessage}\n${errorMessage}\n${nestedErrorMessage}`)
}

function normalizeLinxCliErrorEvent(event: unknown): unknown {
  if (typeof event === 'string') {
    const normalized = formatLinxCliErrorMessage(event)
    return normalized === event ? event : normalized
  }
  if (Array.isArray(event)) {
    let changed = false
    const next = event.map((item) => {
      const normalized = normalizeLinxCliErrorEvent(item)
      if (normalized !== item) {
        changed = true
      }
      return normalized
    })
    return changed ? next : event
  }
  if (!isRecord(event)) {
    return event
  }

  let changed = false
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    const normalized = normalizeLinxCliErrorEvent(value)
    next[key] = normalized
    if (normalized !== value) {
      changed = true
    }
  }
  return changed ? { ...event, ...next } : event
}

function showLinxAuthExpiredRecoveryNotice(interactive: any): void {
  interactive.showStatus?.([
    'LinX Cloud login expired.',
    'Your message reached LinX, but the Cloud token was rejected.',
    'Choose a sign-in method below, or run /login if the selector is not visible.',
  ].join('\n'))
  interactive.ui?.requestRender?.()
}

async function startLinxCloudLogin(interactive: any, loginOptions: { reason?: LinxAuthReason } = {}, options: LinxLoginFlowOptions = {}): Promise<void> {
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

    const reason = loginOptions.reason ?? 'manual'
    const selected = await selectLinxAuthMethod(interactive, reason, options)
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

    if (selected === AUTH_OPTION_CLIENT_CREDENTIALS) {
      await promptForLinxClientCredentials(interactive, reason, options)
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
    options.onLoginSettled?.(interactive)
  }
}

function scheduleLinxCloudLogin(interactive: any, reason: LinxAuthReason, options: LinxLoginFlowOptions): void {
  if (interactive[LINX_AUTH_LOGIN_IN_PROGRESS] || interactive[LINX_AUTH_LOGIN_SCHEDULED]) {
    return
  }

  interactive[LINX_AUTH_LOGIN_SCHEDULED] = true
  setTimeout(() => {
    interactive[LINX_AUTH_LOGIN_SCHEDULED] = false
    void startLinxCloudLogin(interactive, { reason }, options)
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

async function selectLinxAuthMethod(interactive: any, reason: LinxAuthReason, flowOptions: LinxLoginFlowOptions): Promise<string | undefined> {
  const title = buildLinxAuthPromptTitle(reason, resolveProviderLabel(interactive, flowOptions))
  const options = [AUTH_OPTION_BROWSER, AUTH_OPTION_CLIENT_CREDENTIALS, AUTH_OPTION_EXIT]
  if (typeof interactive.showExtensionSelector === 'function') {
    return normalizeSelectorChoice(await interactive.showExtensionSelector(title, options), options)
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
      'Re-authorize or enter Solid client credentials, then retry your message.',
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

async function promptForLinxClientCredentials(interactive: any, reason: LinxAuthReason, options: LinxLoginFlowOptions): Promise<void> {
  if (typeof interactive.showExtensionInput !== 'function') {
    interactive.showError?.('This terminal build cannot collect Solid client credentials inside the TUI.')
    return
  }

  const credentials = await interactive.showExtensionInput(
    [
      reason === 'expired' ? 'Enter Solid client credentials' : 'Use Solid client credentials',
      'This is only for Solid/LinX identity. AI provider keys belong in `linx ai connect`.',
      'Format: client_id:client_secret',
      'Press Escape to cancel.',
    ].join('\n'),
    'client_id:client_secret',
  )
  const trimmed = typeof credentials === 'string' ? credentials.trim() : ''
  if (!trimmed) {
    interactive.showStatus?.('Solid client credentials entry cancelled.')
    return
  }

  const result = await resolveSolidClientCredentialsLogin(options)(trimmed)
  const authStorage = interactive.session?.modelRegistry?.authStorage
  authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, LINX_RUNTIME_MANAGED_AUTH_KEY)
  authStorage?.set?.(LINX_PROVIDER_ID, {
    type: 'api_key',
    key: LINX_RUNTIME_MANAGED_AUTH_KEY,
    webId: result.webId,
    podUrl: result.podUrl,
  })
  await refreshLinxAuthState(interactive)
  await finishLinxAuthSuccess(interactive, reason, 'Solid client credentials saved to ~/.solid/auth.')
}

function resolveSolidClientCredentialsLogin(options: LinxLoginFlowOptions): typeof persistSolidClientCredentialsLogin {
  return options.persistSolidClientCredentialsLogin ?? persistSolidClientCredentialsLogin
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
  clearLinxAuthPromptOnStart(interactive)
  syncRuntimeCredential(interactive)
  interactive.session?.modelRegistry?.refresh?.()
  await interactive.updateAvailableProviderCount?.()
  interactive.ui?.requestRender?.()
}

export const __testRefreshLinxAuthState = refreshLinxAuthState

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
}

async function runLinxCloudBrowserLogin(
  interactive: any,
  authStorage: { login(providerId: string, callbacks: unknown): Promise<unknown> },
  reason: LinxAuthReason,
): Promise<void> {
  if (canRenderLinxLoginDialog(interactive)) {
    await runLinxCloudLoginDialog(interactive, authStorage, reason)
    return
  }

  await runLinxCloudLogin(interactive, authStorage, reason)
}

function canRenderLinxLoginDialog(interactive: any): boolean {
  return Boolean(
    interactive.ui
      && typeof interactive.editorContainer?.clear === 'function'
      && typeof interactive.editorContainer?.addChild === 'function'
      && interactive.editor,
  )
}

async function runLinxCloudLoginDialog(
  interactive: any,
  authStorage: { login(providerId: string, callbacks: unknown): Promise<unknown> },
  reason: LinxAuthReason,
): Promise<void> {
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
  authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, LINX_RUNTIME_MANAGED_AUTH_KEY)
}

function clearLinxAuthPromptOnStart(interactive: any): void {
  const candidates = [
    interactive,
    interactive?.runtimeHost,
    interactive?.runtime,
    interactive?.session,
  ]
  for (const candidate of candidates) {
    const bridge = candidate?.linxAuthBridge
    if (bridge && typeof bridge === 'object') {
      bridge.shouldPromptLoginOnStart = false
    }
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

function prefillLoginCommand(interactive: any): void {
  interactive.editor?.setText?.('/login')
  interactive.ui?.setFocus?.(interactive.editor)
  interactive.ui?.requestRender?.()
}

function patchStartupLoginPrompt(interactive: any, options: LinxLoginFlowOptions): void {
  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }

  interactive.init = async function patchedLinxLoginInit(...args: unknown[]): Promise<void> {
    await originalInit(...args)
    if (this[LINX_AUTH_LOGIN_ON_INIT]) {
      const reason = typeof this[LINX_AUTH_LOGIN_ON_INIT] === 'string'
        ? this[LINX_AUTH_LOGIN_ON_INIT] as LinxAuthReason
        : 'startup'
      this[LINX_AUTH_LOGIN_ON_INIT] = false
      queueMicrotask(() => startLinxCloudLogin(this, { reason }, options))
    }
  }
}

function resolveProviderLabel(interactive: any, options: LinxLoginFlowOptions): string {
  return options.resolveProviderLabel?.(interactive) ?? resolveRuntimeProviderLabel(interactive)
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
