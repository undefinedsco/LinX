import { resolveAccountBaseUrl } from './account-api.js'
import type { AutoModeCommandArgs } from './auto-mode-command.js'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { resolveStartupLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { resolveLinxPiStartupControlState } from './linx-pi-startup-control.js'
import type { CreateLinxRuntimeAdapterForPiCommandOptions, RunLinxPiRuntimeOptions } from './linx-pi-runtime-execution.js'
import { resolveLinxStartupLoginPromptDecision } from './linx-startup-login-policy.js'
import { assertLinxPiSessionSelectorCompatibility, createLinxPiSessionManager } from './linx-session-manager.js'
import { getDefaultPodDataSession } from './pod-data-session.js'

export interface LinxPiStartupPlanArgs extends AutoModeCommandArgs {
  cwd?: string
  model?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  session?: string
  'session-dir'?: string
  'session-id'?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
  prompt?: string[]
}

export interface LinxPiStartupPlan {
  adapterOptions: CreateLinxRuntimeAdapterForPiCommandOptions
  runtimeOptions: Omit<RunLinxPiRuntimeOptions, 'adapter'>
}

export async function createLinxPiStartupPlan(argv: LinxPiStartupPlanArgs): Promise<LinxPiStartupPlan> {
  const cwd = argv.cwd || process.cwd()
  const issuerUrl = resolveAccountBaseUrl()
  const startupLoginPrompt = await resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    print: argv.print,
    issuerUrl,
    resolveSession: resolveStartupLinxPodDataSession,
  })

  const sessionManager = await createLinxPiSessionManager({
    cwd,
    agentDir: LINX_AGENT_DIR,
    session: argv.session,
    sessionDir: argv['session-dir'],
    sessionId: argv['session-id'],
    last: Boolean(argv.continue || argv.last),
  })
  const restoreAutoFromHydration = Boolean(argv.session || argv['session-id'] || argv.continue || argv.last)
  const controlState = await resolveLinxPiStartupControlState({
    requestedAuto: typeof argv.auto === 'boolean' ? argv.auto : undefined,
    hydrateFromPod: !argv.print && !startupLoginPrompt.shouldPrompt,
    restoreAutoFromHydration,
    sessionManager,
  })
  const autoEnabled = controlState.autoEnabled
  const symphonyEnabled = controlState.symphonyEnabled

  return {
    adapterOptions: {
      cwd,
      model: argv.model,
      backend: 'cloud',
      autoEnabled,
      symphonyEnabled,
      getPodDataSession: getDefaultPodDataSession,
      port: argv.port,
      providerConfig: {
        baseUrl: String(argv['runtime-url'] ?? 'https://api.undefineds.co/v1'),
        issuerUrl,
      },
    },
    runtimeOptions: {
      agentDir: LINX_AGENT_DIR,
      autoEnabled,
      print: argv.print,
      prompt: argv.prompt,
      restoreAutoFromHydration,
      sessionManager,
      startupLoginPrompt,
      symphonyEnabled,
    },
  }
}

export function assertLinxPiStartupSessionSelectorCompatibility(argv: {
  session?: string
  'session-id'?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
}): void {
  assertLinxPiSessionSelectorCompatibility({
    session: argv.session,
    sessionId: argv['session-id'],
    last: Boolean(argv.continue || argv.resume || argv.last),
  })
}
