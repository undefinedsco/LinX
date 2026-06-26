import {
  checkForNewLinxVersion,
  installLinxSelfUpdateAndRestart,
  LINX_CHANGELOG_URL,
  LINX_CLI_VERSION,
  LINX_UPDATE_PACKAGE_NAME,
} from './linx-self-update.js'
import { openExternalUrl } from './linx-external-url.js'
import {
  canChooseLinxInteractiveExtensionSelectorOption,
  chooseLinxInteractiveExtensionSelectorOption,
} from './linx-interactive-extension-selector-host.js'
import { normalizeSelectorChoice } from './linx-selector-choice.js'
import { registerLinxInteractiveRunHandler } from './linx-interactive-run-router.js'
import {
  registerLinxInteractiveUpdateNotificationHandler,
  registerLinxInteractiveVersionCheckHandler,
} from './linx-interactive-update-router.js'
import { appendLinxInteractiveChatText } from './linx-interactive-chat-text-host.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { getLinxInteractiveUpdateState } from './linx-interactive-update-state-host.js'

const UPDATE_OPTION_INSTALL = 'Install update and restart'
const UPDATE_OPTION_CHANGELOG = 'Open changelog'
const UPDATE_OPTION_LATER = 'Later'

type LinxUpdateNotificationOptions = {
  shouldDefer?: () => boolean
}

export function installLinxUpdateNotification(
  interactive: any,
  options: LinxUpdateNotificationOptions = {},
): void {
  patchVersionCheck(interactive)
  patchUpdateNotification(interactive, options)
}

export async function checkAndShowLinxUpdate(
  interactive: any,
  options: LinxUpdateNotificationOptions & { manual?: boolean } = {},
): Promise<void> {
  const latest = await checkForNewLinxVersion()
  if (!latest) {
    if (options.manual) {
      showLinxInteractiveStatus(interactive, `LinX ${LINX_CLI_VERSION} is up to date.`)
    }
    return
  }

  const notification = requestLinxUpdateNotification(interactive, latest, {
    ...options,
    force: options.manual === true,
  })
  if (options.manual === true) {
    await notification
  }
}

export function replayDeferredLinxUpdateNotification(
  interactive: any,
  options: LinxUpdateNotificationOptions = {},
): void {
  const updateState = getLinxInteractiveUpdateState(interactive)
  const version = normalizeLinxUpdateVersion(updateState.deferredUpdateVersion)
  if (!version || shouldDeferLinxUpdateNotification(options)) {
    return
  }

  updateState.deferredUpdateVersion = undefined
  startLinxUpdateSelectorInBackground(interactive, version)
}

function patchVersionCheck(interactive: any): void {
  installLinxUpstreamPiUpdateSuppression(interactive)

  registerLinxInteractiveVersionCheckHandler(interactive, {
    name: 'linx-update-notification:check-linx-version',
    priority: 0,
    async handler() {
      const version = await checkForNewLinxVersion()
      return version ? { handled: true, version } : { handled: true }
    },
  })
}

function installLinxUpstreamPiUpdateSuppression(interactive: any): void {
  registerLinxInteractiveRunHandler(interactive, {
    name: 'linx-update-notification:suppress-upstream-pi-update',
    priority: 0,
    handler({ interactive: runInteractive }) {
      getLinxInteractiveUpdateState(runInteractive).suppressUpstreamPiUpdate = true
    },
  })
}

function patchUpdateNotification(interactive: any, options: LinxUpdateNotificationOptions): void {
  registerLinxInteractiveUpdateNotificationHandler(interactive, {
    name: 'linx-update-notification:show-linx-update',
    priority: 0,
    handler({ interactive: target, newVersion }) {
      if (getLinxInteractiveUpdateState(target).suppressUpstreamPiUpdate) {
        return true
      }

      const normalizedVersion = normalizeLinxUpdateVersion(newVersion)
      if (!normalizedVersion) {
        return true
      }

      startLinxUpdateNotificationInBackground(target, normalizedVersion, options)
      return true
    },
  })
}

export function scheduleLinxVersionCheckAfterInit(
  interactive: any,
  options: LinxUpdateNotificationOptions = {},
): void {
  const updateState = getLinxInteractiveUpdateState(interactive)
  if (updateState.updateCheckScheduled) {
    return
  }

  updateState.updateCheckScheduled = true
  queueMicrotask(() => {
    void checkForNewLinxVersion()
      .then((latest) => {
        if (!latest) {
          return
        }
        startLinxUpdateNotificationInBackground(interactive, latest, options)
      })
      .catch(() => undefined)
  })
}

async function showLinxUpdateSelector(interactive: any, newVersion: string): Promise<void> {
  const updateState = getLinxInteractiveUpdateState(interactive)
  if (updateState.updateInProgress) {
    return
  }
  updateState.updateInProgress = true
  try {
    const title = [
      'LinX update available',
      `Current ${LINX_CLI_VERSION} -> latest ${newVersion}`,
      'Choose how to handle this update.',
    ].join('\n')
    const options = [UPDATE_OPTION_LATER, UPDATE_OPTION_INSTALL, UPDATE_OPTION_CHANGELOG]
    const rawSelected = canChooseLinxInteractiveExtensionSelectorOption(interactive)
      ? await chooseLinxInteractiveExtensionSelectorOption(interactive, title, options)
      : undefined
    const selected = normalizeSelectorChoice(rawSelected, options)

    if (selected === UPDATE_OPTION_INSTALL) {
      await installLinxSelfUpdateAndRestart(interactive, newVersion)
      return
    }

    if (selected === UPDATE_OPTION_CHANGELOG) {
      openExternalUrl(LINX_CHANGELOG_URL, interactive)
      showLinxInteractiveStatus(interactive, `Opened LinX changelog for ${newVersion}.`, { render: false })
      return
    }

    if (!selected) {
      showLinxUpdateFallback(interactive, newVersion)
      return
    }

    showLinxInteractiveStatus(interactive, `Skipped LinX ${newVersion} for now.`, { render: false })
  } finally {
    updateState.updateInProgress = false
  }
}

function requestLinxUpdateNotification(
  interactive: any,
  newVersion: string,
  options: LinxUpdateNotificationOptions & { force?: boolean } = {},
): Promise<void> | void {
  const updateState = getLinxInteractiveUpdateState(interactive)
  if (!options.force && shouldDeferLinxUpdateNotification(options)) {
    updateState.deferredUpdateVersion = newVersion
    return
  }

  updateState.deferredUpdateVersion = undefined
  return showLinxUpdateSelector(interactive, newVersion)
}

function startLinxUpdateNotificationInBackground(
  interactive: any,
  newVersion: string,
  options: LinxUpdateNotificationOptions & { force?: boolean } = {},
): void {
  try {
    const result = requestLinxUpdateNotification(interactive, newVersion, options)
    catchLinxBackgroundUpdateError(interactive, result)
  } catch (error) {
    reportLinxBackgroundUpdateError(interactive, error)
  }
}

function startLinxUpdateSelectorInBackground(interactive: any, newVersion: string): void {
  try {
    catchLinxBackgroundUpdateError(interactive, showLinxUpdateSelector(interactive, newVersion))
  } catch (error) {
    reportLinxBackgroundUpdateError(interactive, error)
  }
}

function catchLinxBackgroundUpdateError(interactive: any, result: Promise<void> | void): void {
  if (!result || typeof result.catch !== 'function') {
    return
  }
  void result.catch((error: unknown) => {
    reportLinxBackgroundUpdateError(interactive, error)
  })
}

function reportLinxBackgroundUpdateError(interactive: any, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  showLinxInteractiveError(interactive, `LinX update failed: ${message}`)
}

function shouldDeferLinxUpdateNotification(options: LinxUpdateNotificationOptions): boolean {
  return options.shouldDefer?.() === true
}

function normalizeLinxUpdateVersion(value: unknown): string | undefined {
  const direct = normalizeNonEmptyString(value)
  if (direct) {
    return direct
  }

  if (!isRecord(value)) {
    return undefined
  }

  for (const key of ['version', 'latest', 'latestVersion', 'packageVersion', 'newVersion']) {
    const nested = normalizeNonEmptyString(value[key])
    if (nested) {
      return nested
    }
  }

  return undefined
}

function showLinxUpdateFallback(interactive: any, newVersion: string): void {
  const lines = [
    '\x1b[1m\x1b[33mLinX update available\x1b[39m\x1b[22m',
    `\x1b[2mCurrent ${LINX_CLI_VERSION} -> latest ${newVersion}\x1b[22m`,
    `\x1b[2mRun \x1b[22m\x1b[36mnpm install -g ${LINX_UPDATE_PACKAGE_NAME}@latest\x1b[39m\x1b[2m if this terminal cannot show the update selector.\x1b[22m`,
    `\x1b[2mChangelog: \x1b[22m\x1b[36m${LINX_CHANGELOG_URL}\x1b[39m`,
  ]
  appendLinxInteractiveChatText(interactive, lines.join('\n'))
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
