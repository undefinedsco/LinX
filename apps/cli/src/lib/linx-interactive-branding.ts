import { getSolidLinxAgentDir } from './solid-local-store.js'
import { installLinxUpdateNotification, replayDeferredLinxUpdateNotification } from './linx-update-notification.js'
import {
  installLinxLoginFlow,
  requestLinxCloudLogin as requestInstalledLinxCloudLogin,
  shouldDeferLinxCloudLogin,
  type LinxLoginFlowOptions,
} from './linx-login-flow.js'
import { resolveRuntimeProviderLabel } from './linx-runtime-provider-label.js'
import { installLinxWelcomeHeader } from './linx-welcome-header.js'

export const LINX_AGENT_DIR = getSolidLinxAgentDir()

export function applyLinxInteractiveBranding(
  interactive: any,
  options: Partial<LinxLoginFlowOptions> = {},
): void {
  installLinxWelcomeHeader(interactive)
  installLinxUpdateNotification(interactive, { shouldDefer: () => shouldDeferLinxCloudLogin(interactive) })
  installLinxLoginFlow(interactive, buildLinxLoginFlowOptions(interactive, options))
}

export function requestLinxCloudLogin(interactive: any, reason: 'startup' | 'expired' | 'manual' = 'manual'): void {
  requestInstalledLinxCloudLogin(interactive, reason, buildLinxLoginFlowOptions(interactive))
}

function buildLinxLoginFlowOptions(
  interactive: any,
  options: Partial<LinxLoginFlowOptions> = {},
): LinxLoginFlowOptions {
  return {
    ...options,
    resolveProviderLabel: resolveRuntimeProviderLabel,
    onLoginSettled: () => replayDeferredLinxUpdateNotification(interactive, {
      shouldDefer: () => shouldDeferLinxCloudLogin(interactive),
    }),
  }
}
