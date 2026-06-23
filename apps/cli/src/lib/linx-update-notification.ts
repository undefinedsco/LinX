import {
  checkForNewLinxVersion,
  installLinxSelfUpdateAndRestart,
  LINX_CHANGELOG_URL,
  LINX_CLI_VERSION,
  LINX_UPDATE_PACKAGE_NAME,
} from './linx-self-update.js'
import { openExternalUrl } from './linx-external-url.js'
import { normalizeSelectorChoice } from './linx-selector-choice.js'
import { registerLinxInteractiveRunHandler } from './linx-interactive-run-router.js'
import {
  registerLinxInteractiveUpdateNotificationHandler,
  registerLinxInteractiveVersionCheckHandler,
} from './linx-interactive-update-router.js'
import { appendLinxInteractiveChatText } from './linx-interactive-chat-text-host.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'

const LINX_UPDATE_IN_PROGRESS = Symbol.for('linx.tui.updateInProgress')
const LINX_UPDATE_CHECK_SCHEDULED = Symbol.for('linx.tui.updateCheckScheduled')
const LINX_DEFERRED_UPDATE_VERSION = Symbol.for('linx.tui.deferredUpdateVersion')
const LINX_SUPPRESS_UPSTREAM_PI_UPDATE = Symbol.for('linx.tui.suppressUpstreamPiUpdate')
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

  requestLinxUpdateNotification(interactive, latest, {
    ...options,
    force: options.manual === true,
  })
}

export function replayDeferredLinxUpdateNotification(
  interactive: any,
  options: LinxUpdateNotificationOptions = {},
): void {
  const version = normalizeLinxUpdateVersion(interactive[LINX_DEFERRED_UPDATE_VERSION])
  if (!version || shouldDeferLinxUpdateNotification(options)) {
    return
  }

  interactive[LINX_DEFERRED_UPDATE_VERSION] = undefined
  void showLinxUpdateSelector(interactive, version)
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
      runInteractive[LINX_SUPPRESS_UPSTREAM_PI_UPDATE] = true
    },
  })
}

function patchUpdateNotification(interactive: any, options: LinxUpdateNotificationOptions): void {
  registerLinxInteractiveUpdateNotificationHandler(interactive, {
    name: 'linx-update-notification:show-linx-update',
    priority: 0,
    handler({ interactive: target, newVersion }) {
      if (target[LINX_SUPPRESS_UPSTREAM_PI_UPDATE]) {
        return true
      }

      const normalizedVersion = normalizeLinxUpdateVersion(newVersion)
      if (!normalizedVersion) {
        return true
      }

      requestLinxUpdateNotification(target, normalizedVersion, options)
      return true
    },
  })
}

export function scheduleLinxVersionCheckAfterInit(
  interactive: any,
  options: LinxUpdateNotificationOptions = {},
): void {
  if (interactive[LINX_UPDATE_CHECK_SCHEDULED]) {
    return
  }

  interactive[LINX_UPDATE_CHECK_SCHEDULED] = true
  queueMicrotask(() => {
    void checkForNewLinxVersion()
      .then((latest) => {
        if (!latest) {
          return
        }
        requestLinxUpdateNotification(interactive, latest, options)
      })
      .catch(() => undefined)
  })
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
    const options = [UPDATE_OPTION_LATER, UPDATE_OPTION_INSTALL, UPDATE_OPTION_CHANGELOG]
    const rawSelected = typeof interactive.showExtensionSelector === 'function'
      ? await interactive.showExtensionSelector(title, options)
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
    interactive[LINX_UPDATE_IN_PROGRESS] = false
  }
}

function requestLinxUpdateNotification(
  interactive: any,
  newVersion: string,
  options: LinxUpdateNotificationOptions & { force?: boolean } = {},
): void {
  if (!options.force && shouldDeferLinxUpdateNotification(options)) {
    interactive[LINX_DEFERRED_UPDATE_VERSION] = newVersion
    return
  }

  interactive[LINX_DEFERRED_UPDATE_VERSION] = undefined
  void showLinxUpdateSelector(interactive, newVersion)
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
