import { resolveAccountBaseUrl } from './account-api.js'
import type { AutoModeCommandArgs } from './auto-mode-command.js'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { resolveStartupLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { resolveLinxStartupControlState } from './linx-pi-startup-control.js'
import type { CreateLinxCliRuntimeAdapterOptions, RunLinxCliRuntimeOptions } from './linx-pi-runtime-execution.js'
import { resolveLinxStartupLoginPromptDecision } from './linx-startup-login-policy.js'
import { assertLinxPiSessionSelectorCompatibility, createLinxPiSessionManager } from './linx-session-manager.js'
import { getDefaultPodDataSession } from './pod-data-session.js'

export interface LinxCliStartupPlanArgs extends AutoModeCommandArgs {
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

export interface LinxCliStartupPlan {
  adapterOptions: CreateLinxCliRuntimeAdapterOptions
  runtimeOptions: Omit<RunLinxCliRuntimeOptions, 'adapter'>
}

export async function createLinxCliStartupPlan(argv: LinxCliStartupPlanArgs): Promise<LinxCliStartupPlan> {
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
  const archive = getLinxCliStartupArchiveIdentity(sessionManager)
  const controlState = await resolveLinxStartupControlState({
    requestedAuto: typeof argv.auto === 'boolean' ? argv.auto : undefined,
    hydrateFromPod: !argv.print && !startupLoginPrompt.shouldPrompt,
    restoreAutoFromHydration,
    archive,
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
      archive: {
        sessionId: archive.sessionId,
      },
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

export function assertLinxCliStartupSessionSelectorCompatibility(argv: {
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

function getLinxCliStartupArchiveIdentity(sessionManager: {
  getSessionId(): string
  getEntries(): Array<{ timestamp?: unknown }>
}): { sessionId: string; createdAt: Date } {
  const sessionId = sessionManager.getSessionId()
  const entryDate = sessionManager.getEntries()
    .map((entry) => toDate(entry.timestamp))
    .find((date): date is Date => date instanceof Date)
  return {
    sessionId,
    createdAt: entryDate ?? parseTimestampFromUuidLikeId(sessionId) ?? new Date(),
  }
}

function parseTimestampFromUuidLikeId(id: string): Date | null {
  const prefix = id.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}
