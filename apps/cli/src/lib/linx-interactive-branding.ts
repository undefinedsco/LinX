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

export function applyLinxInteractiveBranding(interactive: any): void {
  installLinxWelcomeHeader(interactive)
  installLinxUpdateNotification(interactive, { shouldDefer: () => shouldDeferLinxCloudLogin(interactive) })
  installLinxLoginFlow(interactive, buildLinxLoginFlowOptions(interactive))
}

export function requestLinxCloudLogin(interactive: any, reason: 'startup' | 'expired' | 'manual' = 'manual'): void {
  requestInstalledLinxCloudLogin(interactive, reason, buildLinxLoginFlowOptions(interactive))
}

function buildLinxLoginFlowOptions(interactive: any): LinxLoginFlowOptions {
  return {
    resolveProviderLabel: resolveRuntimeProviderLabel,
    onLoginSettled: () => replayDeferredLinxUpdateNotification(interactive, {
      shouldDefer: () => shouldDeferLinxCloudLogin(interactive),
    }),
  }
}
