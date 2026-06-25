import { clearAccountSession } from './account-session.js'
import { clearCredentials } from './credentials-store.js'
import { clearOidcSessionStorage } from './oidc-session-storage.js'
import { persistSolidClientCredentialsLogin } from './solid-client-credentials-login.js'
import { LINX_RUNTIME_MANAGED_AUTH_KEY } from './linx-runtime-auth.js'
import { formatLinxCliErrorMessage } from './linx-cloud-errors.js'
import { normalizeSelectorChoice } from './linx-selector-choice.js'
import { openExternalUrl } from './linx-external-url.js'
import {
  clearLinxInteractiveRuntimeAuthPromptOnStart,
  resolveLinxInteractiveRuntimeProviderLabel,
} from './linx-interactive-runtime-host.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import {
  registerLinxInteractiveLoginDialogHandler,
  registerLinxInteractiveOAuthSelectorHandler,
} from './linx-interactive-login-ui-router.js'
import {
  registerLinxInteractiveErrorHandler,
  registerLinxInteractiveEventHandler,
} from './linx-interactive-event-router.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { refreshLinxInteractiveProviderCount } from './linx-interactive-provider-count-host.js'
import {
  getLinxInteractiveAuthStorage,
  getLinxInteractiveLoginAuthStorage,
  refreshLinxInteractiveModelRegistry,
  type LinxInteractiveLoginAuthStorage,
} from './linx-interactive-model-registry-host.js'
import {
  canCollectLinxInteractiveExtensionInput,
  collectLinxInteractiveExtensionInput,
} from './linx-interactive-extension-input-host.js'
import {
  canChooseLinxInteractiveExtensionSelectorOption,
  chooseLinxInteractiveExtensionSelectorOption,
} from './linx-interactive-extension-selector-host.js'
import { clearLinxInteractiveStreamingMessage } from './linx-interactive-streaming-message-host.js'
import { appendLinxInteractiveChatText } from './linx-interactive-chat-text-host.js'
import { setLinxInteractiveEditorText } from './linx-interactive-editor-text-host.js'
import { getLinxInteractiveAuthState } from './linx-interactive-auth-state-host.js'
import {
  canMountLinxEditorComponent,
  createLinxLoginDialogComponent,
  mountLinxEditorComponent,
} from './linx-editor-component-router.js'
import {
  captureLinxSessionRetryTurn,
  restoreLinxSessionHistoryBranch,
  type LinxSessionRetryTurn,
} from './linx-session-history.js'
import { retryLinxInteractiveSessionTurn } from './linx-session-work-control.js'

const LINX_PROVIDER_ID = 'undefineds'
const linxLoginFlowOptions = new WeakMap<object, LinxLoginFlowOptions>()
const AUTH_OPTION_BROWSER = 'Authorize in browser'
const AUTH_OPTION_CLIENT_CREDENTIALS = 'Enter Solid client credentials'
const AUTH_OPTION_EXIT = 'Exit'

type LinxAuthReason = 'startup' | 'expired' | 'manual'

type LinxAuthPendingRetry = LinxSessionRetryTurn

export type LinxLoginFlowOptions = {
  onLoginSettled?: (interactive: any) => void
  persistSolidClientCredentialsLogin?: typeof persistSolidClientCredentialsLogin
  resolveProviderLabel?: (interactive: any) => string
}

export function installLinxLoginFlow(interactive: any, options: LinxLoginFlowOptions = {}): void {
  rememberLinxLoginFlowOptions(interactive, options)
  patchNativeOAuthSelectors(interactive, options)
  patchLoginCommand(interactive, options)
  patchAuthExpiredSessionEvents(interactive, options)
  patchAuthExpiredLoginPrompt(interactive, options)
}

export function shouldDeferLinxCloudLogin(interactive: any): boolean {
  const authState = getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive)
  return Boolean(
    authState.loginInProgress
      || authState.loginOnInit
      || authState.pendingRetry
      || authState.loginScheduled,
  )
}

export function requestLinxCloudLogin(interactive: any, reason: LinxAuthReason = 'manual', options: LinxLoginFlowOptions = {}): void {
  rememberLinxLoginFlowOptions(interactive, options)
  if (!interactive.isInitialized) {
    getLinxInteractiveAuthState<LinxAuthReason>(interactive).loginOnInit = reason
    return
  }
  void startLinxCloudLogin(interactive, { reason }, options)
}

export function startPendingLinxCloudLoginAfterInit(interactive: any): void {
  const authState = getLinxInteractiveAuthState<LinxAuthReason>(interactive)
  if (!authState.loginOnInit) {
    return
  }

  const reason = typeof authState.loginOnInit === 'string'
    ? authState.loginOnInit
    : 'startup'
  authState.loginOnInit = false
  const options = getLinxLoginFlowOptions(interactive)
  queueMicrotask(() => startLinxCloudLogin(interactive, { reason }, options))
}

function rememberLinxLoginFlowOptions(interactive: any, options: LinxLoginFlowOptions): void {
  if (interactive && typeof interactive === 'object') {
    linxLoginFlowOptions.set(interactive, options)
  }
}

function getLinxLoginFlowOptions(interactive: any): LinxLoginFlowOptions {
  if (!interactive || typeof interactive !== 'object') {
    return {}
  }
  return linxLoginFlowOptions.get(interactive) ?? {}
}

function patchLoginCommand(interactive: any, options: LinxLoginFlowOptions): void {
  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-login',
    priority: 10,
    async handler({ interactive: target, input }) {
      if (input !== '/login') {
        return false
      }
      setLinxInteractiveEditorText(target, '')
      await startLinxCloudLogin(target, {}, options)
      return true
    },
  })
}

function patchNativeOAuthSelectors(interactive: any, options: LinxLoginFlowOptions): void {
  registerLinxInteractiveOAuthSelectorHandler(interactive, {
    name: 'linx-login-flow:oauth-selector',
    priority: 0,
    async handler({ interactive: target, mode }) {
      if (mode === 'logout') {
        const authStorage = getLinxInteractiveAuthStorage(target)
        authStorage?.logout?.(LINX_PROVIDER_ID)
        authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, '')
        clearAccountSession()
        clearCredentials()
        clearOidcSessionStorage()
        await refreshLinxAuthState(target)
        showLinxInteractiveStatus(target, 'Logged out of LinX Cloud.')
        return { handled: true }
      }

      await startLinxCloudLogin(target, { reason: 'manual' }, options)
      return { handled: true }
    },
  })

  registerLinxInteractiveLoginDialogHandler(interactive, {
    name: 'linx-login-flow:login-dialog',
    priority: 0,
    async handler({ interactive: target, providerId }) {
      if (!providerId || providerId === LINX_PROVIDER_ID) {
        await startLinxCloudLogin(target, { reason: 'manual' }, options)
        return { handled: true }
      }

      showLinxInteractiveStatus(target, 'LinX only supports LinX Cloud authentication in this TUI.')
      await startLinxCloudLogin(target, { reason: 'manual' }, options)
      return { handled: true }
    },
  })
}

function patchAuthExpiredSessionEvents(interactive: any, options: LinxLoginFlowOptions): void {
  registerLinxInteractiveEventHandler(interactive, {
    name: 'linx-login-flow:auth-expired-event',
    priority: 0,
    handler({ interactive: target, event }) {
      const normalizedEvent = normalizeLinxCliErrorEvent(event)
      if (eventHasLinxAuthExpiredError(normalizedEvent)) {
        showLinxAuthExpiredRecoveryNotice(target)
        prepareLinxAuthExpiredRetry(target)
        suppressLinxAuthExpiredAssistantError(target)
        scheduleLinxCloudLogin(target, 'expired', options)
        return { handled: true }
      }

      return { handled: false, event: normalizedEvent }
    },
  })
}

function patchAuthExpiredLoginPrompt(interactive: any, options: LinxLoginFlowOptions): void {
  registerLinxInteractiveErrorHandler(interactive, {
    name: 'linx-login-flow:auth-expired-error',
    priority: 0,
    handler({ interactive: target, errorMessage }) {
      const text = typeof errorMessage === 'string' ? errorMessage : String(errorMessage)
      if (getLinxInteractiveAuthState(target).reportingError || !isLinxAuthExpiredError(text)) {
        return { handled: false, errorMessage: formatLinxCliErrorMessage(errorMessage) }
      }

      showLinxAuthExpiredRecoveryNotice(target)
      prepareLinxAuthExpiredRetry(target)
      scheduleLinxCloudLogin(target, 'expired', options)
      return { handled: true }
    },
  })
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
  showLinxInteractiveStatus(interactive, [
    'LinX Cloud login expired.',
    'Your message reached LinX, but the Cloud token was rejected.',
    'Choose a sign-in method below, or run /login if the selector is not visible.',
  ].join('\n'))
}

async function startLinxCloudLogin(interactive: any, loginOptions: { reason?: LinxAuthReason } = {}, options: LinxLoginFlowOptions = {}): Promise<void> {
  const authState = getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive)
  if (authState.loginInProgress) {
    return
  }
  authState.loginInProgress = true

  try {
    const authStorage = getLinxInteractiveAuthStorage(interactive)
    if (!authStorage) {
      prefillLoginCommand(interactive)
      return
    }

    const reason = loginOptions.reason ?? 'manual'
    const selected = await selectLinxAuthMethod(interactive, reason, options)
    if (!selected) {
      showLinxInteractiveStatus(interactive, 'LinX Cloud authorization cancelled.')
      return
    }

    if (selected === AUTH_OPTION_BROWSER) {
      const loginAuthStorage = getLinxInteractiveLoginAuthStorage(interactive)
      if (!loginAuthStorage) {
        prefillLoginCommand(interactive)
        return
      }
      await runLinxCloudBrowserLogin(interactive, loginAuthStorage, reason)
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
        showLinxInteractiveStatus(interactive, 'LinX Cloud authorization cancelled.')
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportLinxLoginError(interactive, message)
  } finally {
    authState.loginInProgress = false
    options.onLoginSettled?.(interactive)
  }
}

function scheduleLinxCloudLogin(interactive: any, reason: LinxAuthReason, options: LinxLoginFlowOptions): void {
  const authState = getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive)
  if (authState.loginInProgress || authState.loginScheduled) {
    return
  }

  authState.loginScheduled = true
  setTimeout(() => {
    getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive).loginScheduled = false
    void startLinxCloudLogin(interactive, { reason }, options)
  }, 0)
}

function reportLinxLoginError(interactive: any, message: string): void {
  const authState = getLinxInteractiveAuthState(interactive)
  const rendered = normalizeLinxLoginError(message)
  if (authState.reportingError) {
    showLinxInteractiveStatus(interactive, rendered)
    return
  }

  authState.reportingError = true
  try {
    showLinxInteractiveError(interactive, rendered)
  } finally {
    authState.reportingError = false
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
  if (canChooseLinxInteractiveExtensionSelectorOption(interactive)) {
    const choice = await chooseLinxInteractiveExtensionSelectorOption(interactive, title, options)
    return normalizeSelectorChoice(choice, options)
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
  appendLinxInteractiveChatText(interactive, [
    `\x1b[1m${title}\x1b[22m`,
    '',
    ...options.map((option) => `- ${option}`),
    '',
    'This terminal build cannot render the LinX auth selector. Run `linx login` in another shell.',
  ].join('\n'))
}

async function promptForLinxClientCredentials(interactive: any, reason: LinxAuthReason, options: LinxLoginFlowOptions): Promise<void> {
  if (!canCollectLinxInteractiveExtensionInput(interactive)) {
    showLinxInteractiveError(interactive, 'This terminal build cannot collect Solid client credentials inside the TUI.')
    return
  }

  const credentials = await collectLinxInteractiveExtensionInput(
    interactive,
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
    showLinxInteractiveStatus(interactive, 'Solid client credentials entry cancelled.')
    return
  }

  const result = await resolveSolidClientCredentialsLogin(options)(trimmed)
  const authStorage = getLinxInteractiveAuthStorage(interactive)
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
    showLinxInteractiveStatus(interactive, `${prefix} ${detail} Retrying your message...`)
    return
  }

  const suffix = reason === 'expired' ? ' Retry your message.' : ''
  showLinxInteractiveStatus(interactive, `${prefix} ${detail}${suffix}`)
}

function prepareLinxAuthExpiredRetry(interactive: any): void {
  const authState = getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive)
  if (authState.pendingRetry) {
    return
  }

  const pending = captureLinxSessionRetryTurn({ interactive })
  authState.pendingRetry = pending

  // AgentSession persists the assistant error after TUI subscribers run. Restore
  // the active branch on the next tick so "continue" never resumes from the
  // failed auth assistant message if the user cancels or login fails.
  setTimeout(() => {
    if (getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive).pendingRetry === pending) {
      restoreLinxSessionHistoryBranch({ interactive }, pending.continueFromId)
    }
  }, 0)
}

function suppressLinxAuthExpiredAssistantError(interactive: any): void {
  clearLinxInteractiveStreamingMessage(interactive)
}

async function retryPendingLinxAuthTurn(interactive: any, reason: LinxAuthReason): Promise<boolean> {
  if (reason !== 'expired') {
    return false
  }

  const authState = getLinxInteractiveAuthState<LinxAuthReason, LinxAuthPendingRetry>(interactive)
  const pending = authState.pendingRetry
  if (!pending) {
    return false
  }
  authState.pendingRetry = undefined

  return retryLinxInteractiveSessionTurn(interactive, pending, {
    onRetryFailed(error) {
      const message = error instanceof Error ? error.message : String(error)
      showLinxInteractiveError(interactive, `LinX Cloud retry failed: ${message}`)
    },
  })
}

export async function refreshLinxAuthState(interactive: any): Promise<void> {
  clearLinxInteractiveRuntimeAuthPromptOnStart(interactive)
  syncRuntimeCredential(interactive)
  refreshLinxInteractiveModelRegistry(interactive)
  await refreshLinxInteractiveProviderCount(interactive)
  showLinxInteractiveStatus(interactive, null)
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
  authStorage: LinxInteractiveLoginAuthStorage,
  reason: LinxAuthReason,
): Promise<void> {
  await authStorage.login(LINX_PROVIDER_ID, {
    forceFresh: true,
    onAuth(info: { url: string; instructions?: string }) {
      showLinxLoginUrl(interactive, info)
      openLoginUrl(info.url, interactive)
      if (info.instructions) {
        showLinxInteractiveStatus(interactive, info.instructions)
      }
    },
    onProgress(message: string) {
      showLinxInteractiveStatus(interactive, message)
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
  authStorage: LinxInteractiveLoginAuthStorage,
  reason: LinxAuthReason,
): Promise<void> {
  if (canRenderLinxLoginDialog(interactive)) {
    await runLinxCloudLoginDialog(interactive, authStorage, reason)
    return
  }

  await runLinxCloudLogin(interactive, authStorage, reason)
}

function canRenderLinxLoginDialog(interactive: any): boolean {
  return canMountLinxEditorComponent(interactive)
}

async function runLinxCloudLoginDialog(
  interactive: any,
  authStorage: LinxInteractiveLoginAuthStorage,
  reason: LinxAuthReason,
): Promise<void> {
  const dialog = createLinxLoginDialogComponent(interactive, LINX_PROVIDER_ID)
  const restoreEditor = mountLinxEditorComponent(interactive, dialog)

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
  if (!canCollectLinxInteractiveExtensionInput(interactive)) {
    throw new Error('Manual redirect paste is not available in this terminal. Run `linx login` in another shell if the browser callback is blocked.')
  }

  const redirect = await collectLinxInteractiveExtensionInput(
    interactive,
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
  const authStorage = getLinxInteractiveAuthStorage(interactive)
  authStorage?.setRuntimeApiKey?.(LINX_PROVIDER_ID, LINX_RUNTIME_MANAGED_AUTH_KEY)
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
  appendLinxInteractiveChatText(interactive, lines.join('\n'))
}

function openLoginUrl(url: string, interactive: any): void {
  openExternalUrl(url, interactive)
}

function prefillLoginCommand(interactive: any): void {
  setLinxInteractiveEditorText(interactive, '/login', { focus: true, render: true })
}

function resolveProviderLabel(interactive: any, options: LinxLoginFlowOptions): string {
  return options.resolveProviderLabel?.(interactive) ?? resolveLinxInteractiveRuntimeProviderLabel(interactive)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}
