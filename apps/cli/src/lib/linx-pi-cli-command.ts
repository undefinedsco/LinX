import type { Argv, CommandModule } from 'yargs'
import { resolveAccountBaseUrl } from './account-api.js'
import { buildAutoModeOptions, type AutoModeCommandArgs } from './auto-mode-command.js'
import { resolveLinxStartupLoginPromptDecision } from './linx-startup-login-policy.js'
import { getDefaultPodDataSession } from './pod-data-session.js'
import { resolveStartupLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { assertLinxPiSessionSelectorCompatibility, createLinxPiSessionManager } from './linx-session-manager.js'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { resolveLinxPiStartupControlState } from './linx-pi-startup-control.js'
import { assertDefaultStartupPromptTokenIsAllowed, type LinxTopLevelCommandAdmissionOptions } from './linx-top-level-command-admission.js'
import { handleLinxPodMirrorSyncCliAdmission } from './linx-pod-mirror-sync-cli-admission.js'
import { handleLinxAutoModeCliAdmission } from './linx-auto-mode-cli-admission.js'
import { handleLinxPiResumeCliAdmission } from './linx-pi-resume-cli-admission.js'
import { runLinxPiRuntime, type CreateLinxRuntimeAdapterForPiCommand } from './linx-pi-runtime-execution.js'

export interface LinxPiCliCommandDependencies {
  createRuntimeAdapter: CreateLinxRuntimeAdapterForPiCommand
}

export interface LinxPiCliCommands {
  defaultPiCommand: CommandModule<object, LinxDefaultCommandArgs>
  execCommand: CommandModule<object, LinxDefaultCommandArgs>
}

export type RunPiCommandOptions = LinxTopLevelCommandAdmissionOptions

export async function runPiCommand(argv: {
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
  'pi-sync-status'?: boolean
  'pi-sync-retry'?: string
  prompt?: string[]
} & AutoModeCommandArgs, dependencies: LinxPiCliCommandDependencies, options: RunPiCommandOptions = {}): Promise<void> {
  assertLinxPiCliSessionSelectorCompatibility(argv)
  assertDefaultStartupPromptTokenIsAllowed(argv, options)
  if (await handleLinxPiResumeCliAdmission(argv, {
    runWithSelectedSession(selectedArgv) {
      return runPiCommand(selectedArgv, dependencies, options)
    },
  })) {
    return
  }

  if (await handleLinxAutoModeCliAdmission(argv)) {
    return
  }

  if (await handleLinxPodMirrorSyncCliAdmission(argv)) {
    return
  }

  if (await handleLinxAutoModeCliAdmission(argv, { includeBackend: true })) {
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

  await runLinxPiRuntime({
    adapter: dependencies.createRuntimeAdapter({
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
    }),
    agentDir: LINX_AGENT_DIR,
    autoEnabled,
    print: argv.print,
    prompt: argv.prompt,
    restoreAutoFromHydration,
    sessionManager,
    startupLoginPrompt,
    symphonyEnabled,
  })
}

export function assertLinxPiCliSessionSelectorCompatibility(argv: {
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

export interface PiCommandArgs {
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
    .option('session-id', {
      type: 'string',
      describe: 'Use exact LinX session ID, creating it if missing',
    })
    .option('session-dir', {
      type: 'string',
      describe: 'Directory for LinX session storage and lookup',
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
  return {
    defaultPiCommand: {
      command: '$0 [prompt..]',
      describe: 'Run LinX with the selected runtime backend',
      builder: buildPiCommand,
      handler(argv): Promise<void> {
        return runPiCommand(argv, dependencies, { rejectReservedPromptCommands: true })
      },
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
