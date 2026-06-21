import { join } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import { SessionSelectorComponent, initTheme, runPrintMode, SettingsManager, type AgentSessionRuntime } from '@earendil-works/pi-coding-agent'
import { ProcessTerminal, TUI } from '@earendil-works/pi-tui'
import { resolveAccountBaseUrl } from './account-api.js'
import { buildAutoModeOptions, isAutoModeRequest, runAutoModeCommand, type AutoModeCommandArgs } from './auto-mode-command.js'
import { resolveLinxInteractiveLoginReason, resolveLinxStartupLoginPromptDecision } from './linx-startup-login-policy.js'
import { bootstrapLinxInteractiveMode, type LinxLoginReason } from './linx-interactive-bootstrap.js'
import { isOidcLoginExpiredError } from './oidc-auth.js'
import { clearDefaultPodDataSession, getDefaultPodDataSession } from './pod-data-session.js'
import { createLinxPodDataSession, resolveStartupLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { createLinxPiSessionManager, listLinxPiSessions } from './linx-session-manager.js'
import { LinxPiPodMirror } from './linx-pod-mirror.js'
import { listPendingPiPodMirrorSync, retryPendingPiPodMirrorSync } from './linx-pod-mirror-sync-recovery.js'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { createFileSyncCheckpointStore } from './sync-checkpoint-store.js'
import { deriveLinxPiStartupControlState, hydrateLinxPiControlState } from './linx-startup-control-state.js'
import { drizzle, solidResources, type SolidDatabase } from './models.js'
import type { RemoteAuthFetch, RemoteChatMessage, RemoteChatTool } from './chat-api.js'
import type { LinxCompletionBackendResult } from './linx-completion-backend.js'

const RESERVED_NON_TOP_LEVEL_COMMANDS = new Set([
  'automode',
  'footer',
  'resume',
  'status-line',
  'statusline',
  'watch',
])

export interface LinxPiCliRuntimeAdapter {
  readonly cwd: string
  start(): Promise<void>
  close(): Promise<void>
  createRuntime(context: {
    cwd: string
    agentDir: string
    sessionManager: unknown
  }): Promise<AgentSessionRuntime>
}

export type CreateLinxRuntimeAdapterForPiCommand = (
  dependencies: {
    createRemoteCompletion(options: {
      runtimeUrl: string
      authFetch: RemoteAuthFetch
      model?: string
      messages: RemoteChatMessage[]
      tools?: RemoteChatTool[]
      systemPrompt?: string
      signal?: AbortSignal
    }): Promise<string | LinxCompletionBackendResult>
    listRemoteModels(authFetch: RemoteAuthFetch, runtimeUrl: string, options?: { fallback?: boolean; timeoutMs?: number }): Promise<Array<{
      id: string
      contextWindow?: number
    }>>
  },
  options: {
    cwd: string
    model?: string
    backend: 'cloud'
    autoEnabled: boolean
    symphonyEnabled: boolean
    getPodDataSession: typeof getDefaultPodDataSession
    port?: number
    providerConfig: {
      baseUrl: string
      issuerUrl: string
    }
  },
) => LinxPiCliRuntimeAdapter

export interface LinxPiCliCommandDependencies {
  createRuntimeAdapter: CreateLinxRuntimeAdapterForPiCommand
}

export interface LinxPiCliCommands {
  defaultPiCommand: CommandModule<object, LinxDefaultCommandArgs>
  hiddenPiAliasCommand: CommandModule<object, LinxDefaultCommandArgs>
  hiddenPiFrontendAliasCommand: CommandModule<object, LinxDefaultCommandArgs>
  execCommand: CommandModule<object, LinxDefaultCommandArgs>
}

export async function runPiCommand(argv: {
  cwd?: string
  model?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  session?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
  'pi-sync-status'?: boolean
  'pi-sync-retry'?: string
  prompt?: string[]
} & AutoModeCommandArgs, dependencies: LinxPiCliCommandDependencies): Promise<void> {
  const firstPromptToken = Array.isArray(argv.prompt) ? argv.prompt[0] : undefined
  // Reject command-shaped aliases that should not fall through to the default TUI prompt.
  if (firstPromptToken && RESERVED_NON_TOP_LEVEL_COMMANDS.has(firstPromptToken)) {
    throw new Error(`Unknown command: ${firstPromptToken}`)
  }
  if (argv.resume) {
    const selectedSession = await selectLinxSession(cwdFromArg(argv.cwd))
    if (!selectedSession) {
      process.stdout.write('No session selected\n')
      return
    }
    await runPiCommand({
      ...argv,
      resume: false,
      session: selectedSession,
    }, dependencies)
    return
  }

  if (isAutoModeRequest(argv)) {
    await runAutoModeCommand(argv)
    return
  }

  if (argv['pi-sync-status']) {
    await runPiSyncStatusCommand()
    return
  }

  if (argv['pi-sync-retry']) {
    await runPiSyncRetryCommand({
      cwd: argv.cwd || process.cwd(),
      sessionId: argv['pi-sync-retry'],
    })
    return
  }

  if (argv.backend) {
    await runAutoModeCommand({
      ...argv,
      plain: Boolean(argv.plain || argv.print),
    })
    return
  }

  const cwd = argv.cwd || process.cwd()
  const startupLoginPrompt = await resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    print: argv.print,
    issuerUrl: resolveAccountBaseUrl(),
    resolveSession: resolveStartupLinxPodDataSession,
  })

  const sessionManager = await createLinxPiSessionManager({
    cwd,
    agentDir: LINX_AGENT_DIR,
    session: argv.session,
    last: Boolean(argv.continue || argv.last),
  })
  const restoreAutoFromHydration = Boolean(argv.session || argv.continue || argv.last)
  const controlState = await resolvePiStartupControlState({
    requestedAuto: typeof argv.auto === 'boolean' ? argv.auto : undefined,
    hydrateFromPod: !argv.print && !startupLoginPrompt.shouldPrompt,
    restoreAutoFromHydration,
    sessionManager,
  })
  const autoEnabled = controlState.autoEnabled
  const symphonyEnabled = controlState.symphonyEnabled

  const adapter = dependencies.createRuntimeAdapter({
    async createRemoteCompletion(options) {
      const chatApi = await import('./chat-api.js')
      return chatApi.createRemoteCompletionResult(options)
    },
    async listRemoteModels(authFetch, runtimeUrl, options) {
      const chatApi = await import('./chat-api.js')
      return chatApi.listRemoteModels(authFetch, runtimeUrl, options ?? { fallback: false, timeoutMs: 5000 })
    },
  }, {
    cwd,
    model: argv.model,
    backend: 'cloud',
    autoEnabled,
    symphonyEnabled,
    getPodDataSession: getDefaultPodDataSession,
    port: argv.port,
    providerConfig: {
      baseUrl: String(argv['runtime-url'] ?? 'https://api.undefineds.co/v1'),
      issuerUrl: resolveAccountBaseUrl(),
    },
  })

  await adapter.start()

  const runtime = await adapter.createRuntime({
    cwd: adapter.cwd,
    agentDir: LINX_AGENT_DIR,
    sessionManager,
  })
  const prompt = ((argv.prompt as string[] | undefined) ?? []).join(' ').trim()
  try {
    if (argv.print) {
      const exitCode = await runPrintMode(runtime, {
        mode: 'text',
        initialMessage: prompt || undefined,
      })
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
      return
    }

    const podMirror = new LinxPiPodMirror({
      cwd: adapter.cwd,
      sessionManager,
      autoEnabled,
      symphonyEnabled,
      checkpointStore: createFileSyncCheckpointStore({
        dir: join(LINX_AGENT_DIR, 'sync', 'pi-pod-mirror', sessionManager.getSessionId()),
      }),
      onError(error) {
        if (process.env.LINX_DEBUG === '1') {
          const message = error instanceof Error ? error.stack || error.message : String(error)
          process.stderr.write(`[linx pod mirror] ${message}\n`)
        }
      },
    })
    const runtimeBridge = runtime as unknown as { session: { subscribe(listener: (event: unknown) => void): () => void } } & Record<string, unknown>
    ;(runtimeBridge as { __linxPodMirror?: LinxPiPodMirror }).__linxPodMirror = podMirror
    const unsubscribePodMirror = runtimeBridge.session.subscribe((event: unknown) => {
      podMirror.handleEvent(event)
    })
    const interactive = bootstrapLinxInteractiveMode(runtimeBridge, {
      initialMessage: prompt || undefined,
      restoredAuto: autoEnabled && restoreAutoFromHydration,
      onAutoControlChange(enabled) {
        void podMirror.syncAutoControlState(enabled)
      },
      onSymphonyControlChange(enabled) {
        void podMirror.syncSymphonyControlState(enabled)
      },
    })
    const bridge = runtimeBridge as { linxAuthBridge?: { shouldPromptLoginOnStart?: boolean } }
    const loginPromptReason: LinxLoginReason | null = resolveLinxInteractiveLoginReason({
      startupDecision: startupLoginPrompt,
      runtimePromptOnStart: bridge.linxAuthBridge?.shouldPromptLoginOnStart,
    })
    if (loginPromptReason) {
      interactive.requestLogin?.(loginPromptReason)
    }

    try {
      await interactive.run()
    } finally {
      unsubscribePodMirror()
      await podMirror.close().catch(() => undefined)
      interactive.stop()
    }
  } finally {
    await adapter.close()
    clearDefaultPodDataSession()
  }
}

async function resolvePiStartupControlState(options: {
  requestedAuto?: boolean
  hydrateFromPod: boolean
  restoreAutoFromHydration?: boolean
  sessionManager: { getSessionId(): string; getEntries(): Array<{ timestamp?: unknown }> }
}): Promise<{ autoEnabled: boolean; symphonyEnabled: boolean }> {
  if (!options.hydrateFromPod) {
    return {
      autoEnabled: options.requestedAuto === true,
      symphonyEnabled: false,
    }
  }

  const session = await createLinxPodDataSession().catch(() => null)
  if (!session) {
    return {
      autoEnabled: options.requestedAuto === true,
      symphonyEnabled: false,
    }
  }

  try {
    const db = drizzle(session.solidSession, {
      logger: false,
      disableInteropDiscovery: true,
      podUrl: session.podUrl,
      resourcePreparation: 'off' as never,
      schema: solidResources,
    }) as unknown as SolidDatabase
    const hydration = await hydrateLinxPiControlState({
      db,
      sessionId: options.sessionManager.getSessionId(),
      createdAt: getPiSessionCreatedAt(options.sessionManager),
      onError(error) {
        if (process.env.LINX_DEBUG === '1') {
          const message = error instanceof Error ? error.stack || error.message : String(error)
          process.stderr.write(`[linx control state] ${message}\n`)
        }
      },
    })
    return {
      ...deriveLinxPiStartupControlState({
        requestedAuto: options.requestedAuto,
        hydration,
        restoreAutoFromHydration: options.restoreAutoFromHydration,
      }),
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

function getPiSessionCreatedAt(sessionManager: { getSessionId(): string; getEntries(): Array<{ timestamp?: unknown }> }): Date {
  const entryDate = sessionManager.getEntries()
    .map((entry) => toDate(entry.timestamp))
    .find((date): date is Date => date instanceof Date)
  return entryDate ?? parseTimestampFromUuidLikeId(sessionManager.getSessionId()) ?? new Date()
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

function cwdFromArg(cwd: unknown): string {
  return typeof cwd === 'string' && cwd.trim() ? cwd : process.cwd()
}

async function selectLinxSession(cwd: string): Promise<string | null> {
  const settingsManager = SettingsManager.create(cwd, LINX_AGENT_DIR)
  initTheme(settingsManager.getTheme())

  return new Promise((resolve) => {
    const ui = new TUI(new ProcessTerminal())
    let resolved = false
    const finish = (sessionPath: string | null): void => {
      if (resolved) {
        return
      }
      resolved = true
      ui.stop()
      resolve(sessionPath)
    }
    const loadSessions = () => listLinxPiSessions(cwd, LINX_AGENT_DIR, { podSessionSource: null })
    const selector = new SessionSelectorComponent(
      loadSessions,
      loadSessions,
      (sessionPath) => finish(sessionPath),
      () => finish(null),
      () => {
        ui.stop()
        process.exit(0)
      },
      () => ui.requestRender(),
      { showRenameHint: false },
    )
    ui.addChild(selector)
    ui.setFocus(selector.getSessionList())
    ui.start()
  })
}

async function runPiSyncStatusCommand(): Promise<void> {
  const sessions = await listPendingPiPodMirrorSync(LINX_AGENT_DIR)
  if (sessions.length === 0) {
    process.stdout.write('No pending LinX Pod sync sessions.\n')
    return
  }

  process.stdout.write(`${sessions.map((session) => {
    const failed = session.checkpoints.filter((checkpoint) => checkpoint.status === 'failed').length
    const partial = session.checkpoints.filter((checkpoint) => checkpoint.status === 'partial').length
    const latest = session.checkpoints.at(-1)?.completedAt ?? 'unknown'
    return `${session.sessionId} · failed=${failed} partial=${partial} latest=${latest}`
  }).join('\n')}\n`)
}

async function runPiSyncRetryCommand(options: {
  cwd: string
  sessionId: string
}): Promise<void> {
  const result = await retryPendingPiPodMirrorSync({
    cwd: options.cwd,
    agentDir: LINX_AGENT_DIR,
    sessionId: options.sessionId,
  })
  if (!result.attempted) {
    process.stdout.write(`LinX Pod sync skipped: ${options.sessionId}\n`)
    return
  }

  const status = result.results.map((item) => item.status).join(', ') || 'none'
  process.stdout.write(
    status === 'none'
      ? `LinX Pod sync has no replayable local projections: ${options.sessionId}\n`
      : `Retried LinX Pod sync: ${options.sessionId} (${status})\n`,
  )
}

export interface PiCommandArgs {
  cwd?: string
  model?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  session?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
  'pi-sync-status'?: boolean
  'pi-sync-retry'?: string
  prompt?: string[]
}

export type LinxDefaultCommandArgs = PiCommandArgs & AutoModeCommandArgs

export function buildPiCommand(command: Argv<object>): Argv<LinxDefaultCommandArgs> {
  const configured = buildAutoModeOptions(command)
    .option('cwd', {
      type: 'string',
      describe: 'Workspace path for the LinX session',
    })
    .option('model', {
      type: 'string',
      describe: 'Model id to expose through the LinX runtime adapter; defaults to the last LinX selection',
    })
    .option('runtime-url', {
      type: 'string',
      default: 'https://api.undefineds.co/v1',
      describe: 'Cloud runtime API base URL',
    })
    .option('print', {
      type: 'boolean',
      default: false,
      describe: 'Run a single prompt without entering interactive mode',
    })
    .option('session', {
      type: 'string',
      describe: 'Resume a specific LinX session id or JSONL file',
    })
    .option('continue', {
      alias: 'c',
      type: 'boolean',
      default: false,
      describe: 'Continue previous LinX session',
    })
    .option('resume', {
      alias: 'r',
      type: 'boolean',
      default: false,
      describe: 'Select a LinX session to resume',
    })
    .option('last', {
      type: 'boolean',
      default: false,
      hidden: true,
    })
    .option('pi-sync-status', {
      type: 'boolean',
      hidden: true,
    })
    .option('pi-sync-retry', {
      type: 'string',
      hidden: true,
    })
    .positional('prompt', {
      array: true,
      type: 'string',
      describe: 'Single-shot prompt when --print is enabled',
    })
  return configured as Argv<LinxDefaultCommandArgs>
}

export function createLinxPiCliCommands(dependencies: LinxPiCliCommandDependencies): LinxPiCliCommands {
  const run = (argv: LinxDefaultCommandArgs): Promise<void> => runPiCommand(argv, dependencies)

  return {
    defaultPiCommand: {
      command: '$0 [prompt..]',
      describe: 'Run LinX with the selected runtime backend',
      builder: buildPiCommand,
      handler: run,
    },
    hiddenPiAliasCommand: {
      command: 'pi [prompt..]',
      describe: false,
      builder: buildPiCommand,
      handler: run,
    },
    hiddenPiFrontendAliasCommand: {
      command: 'pi-frontend [prompt..]',
      describe: false,
      builder: buildPiCommand,
      handler: run,
    },
    execCommand: {
      command: 'exec [prompt..]',
      aliases: ['e'],
      describe: 'Run LinX non-interactively',
      builder: buildPiCommand,
      async handler(argv): Promise<void> {
        await runPiCommand({ ...argv, print: true }, dependencies)
      },
    },
  }
}
