import type { Argv, CommandModule } from 'yargs'
import { runPrintMode, type AgentSessionRuntime } from '@earendil-works/pi-coding-agent'
import { resolveAccountBaseUrl } from './account-api.js'
import { buildAutoModeOptions, isAutoModeRequest, runAutoModeCommand, type AutoModeCommandArgs } from './auto-mode-command.js'
import { resolveLinxInteractiveLoginReason, resolveLinxStartupLoginPromptDecision } from './linx-startup-login-policy.js'
import { bootstrapLinxInteractiveMode, type LinxLoginReason } from './linx-interactive-bootstrap.js'
import { clearDefaultPodDataSession, getDefaultPodDataSession } from './pod-data-session.js'
import { resolveStartupLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { createLinxPiSessionManager } from './linx-session-manager.js'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { resolveLinxPiStartupControlState } from './linx-pi-startup-control.js'
import { selectLinxPiSession } from './linx-session-selector-ui.js'
import { createLinxPodMirrorRuntimeHost } from './linx-pod-mirror-runtime-host.js'
import { runLinxPodMirrorSyncRetryCommand, runLinxPodMirrorSyncStatusCommand } from './linx-pod-mirror-sync-command.js'

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

export interface CreateLinxRuntimeAdapterForPiCommandOptions {
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
}

export type CreateLinxRuntimeAdapterForPiCommand = (
  options: CreateLinxRuntimeAdapterForPiCommandOptions,
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
    const selectedSession = await selectLinxPiSession(cwdFromArg(argv.cwd))
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
    await runLinxPodMirrorSyncStatusCommand({ agentDir: LINX_AGENT_DIR })
    return
  }

  if (argv['pi-sync-retry']) {
    await runLinxPodMirrorSyncRetryCommand({
      cwd: argv.cwd || process.cwd(),
      agentDir: LINX_AGENT_DIR,
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
  const controlState = await resolveLinxPiStartupControlState({
    requestedAuto: typeof argv.auto === 'boolean' ? argv.auto : undefined,
    hydrateFromPod: !argv.print && !startupLoginPrompt.shouldPrompt,
    restoreAutoFromHydration,
    sessionManager,
  })
  const autoEnabled = controlState.autoEnabled
  const symphonyEnabled = controlState.symphonyEnabled

  const adapter = dependencies.createRuntimeAdapter({
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

    const podMirrorHost = createLinxPodMirrorRuntimeHost({
      runtime,
      cwd: adapter.cwd,
      agentDir: LINX_AGENT_DIR,
      sessionManager,
      autoEnabled,
      symphonyEnabled,
    })
    const interactive = bootstrapLinxInteractiveMode(podMirrorHost.runtime, {
      initialMessage: prompt || undefined,
      restoredAuto: autoEnabled && restoreAutoFromHydration,
      onAutoControlChange(enabled) {
        podMirrorHost.syncAutoControlState(enabled)
      },
      onSymphonyControlChange(enabled) {
        podMirrorHost.syncSymphonyControlState(enabled)
      },
    })
    const bridge = podMirrorHost.runtime
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
      await podMirrorHost.close()
      interactive.stop()
    }
  } finally {
    await adapter.close()
    clearDefaultPodDataSession()
  }
}

function cwdFromArg(cwd: unknown): string {
  return typeof cwd === 'string' && cwd.trim() ? cwd : process.cwd()
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
