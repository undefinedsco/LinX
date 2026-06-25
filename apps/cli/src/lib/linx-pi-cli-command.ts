import type { Argv, CommandModule } from 'yargs'
import { buildAutoModeOptions, type AutoModeCommandArgs } from './auto-mode-command.js'
import { assertDefaultStartupPromptTokenIsAllowed, type LinxTopLevelCommandAdmissionOptions } from './linx-top-level-command-admission.js'
import { handleLinxPodMirrorSyncCliAdmission } from './linx-pod-mirror-sync-cli-admission.js'
import { handleLinxAutoModeCliAdmission } from './linx-auto-mode-cli-admission.js'
import { handleLinxPiResumeCliAdmission } from './linx-pi-resume-cli-admission.js'
import { runLinxPiRuntime, type CreateLinxRuntimeAdapterForPiCommand } from './linx-pi-runtime-execution.js'
import { assertLinxPiStartupSessionSelectorCompatibility, createLinxPiStartupPlan } from './linx-pi-startup-plan.js'

export interface LinxDefaultCliCommandDependencies {
  createRuntimeAdapter: CreateLinxRuntimeAdapterForPiCommand
}

export interface LinxDefaultCliCommands {
  defaultCommand: CommandModule<object, LinxDefaultCommandArgs>
  execCommand: CommandModule<object, LinxDefaultCommandArgs>
}

export type RunLinxDefaultCommandOptions = LinxTopLevelCommandAdmissionOptions

export async function runLinxDefaultCommand(argv: {
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
} & AutoModeCommandArgs, dependencies: LinxDefaultCliCommandDependencies, options: RunLinxDefaultCommandOptions = {}): Promise<void> {
  assertLinxDefaultCliSessionSelectorCompatibility(argv)
  assertDefaultStartupPromptTokenIsAllowed(argv, options)
  if (await handleLinxPiResumeCliAdmission(argv, {
    runWithSelectedSession(selectedArgv) {
      return runLinxDefaultCommand(selectedArgv, dependencies, options)
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

  const startupPlan = await createLinxPiStartupPlan(argv)
  await runLinxPiRuntime({
    ...startupPlan.runtimeOptions,
    adapter: dependencies.createRuntimeAdapter(startupPlan.adapterOptions),
  })
}

export function assertLinxDefaultCliSessionSelectorCompatibility(argv: {
  session?: string
  'session-id'?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
}): void {
  assertLinxPiStartupSessionSelectorCompatibility(argv)
}

export interface LinxDefaultCommandBaseArgs {
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

export type LinxDefaultCommandArgs = LinxDefaultCommandBaseArgs & AutoModeCommandArgs

export function buildLinxDefaultCommand(command: Argv<object>): Argv<LinxDefaultCommandArgs> {
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

export function createLinxDefaultCliCommands(dependencies: LinxDefaultCliCommandDependencies): LinxDefaultCliCommands {
  return {
    defaultCommand: {
      command: '$0 [prompt..]',
      describe: 'Run LinX with the selected runtime backend',
      builder: buildLinxDefaultCommand,
      handler(argv): Promise<void> {
        return runLinxDefaultCommand(argv, dependencies, { rejectReservedPromptCommands: true })
      },
    },
    execCommand: {
      command: 'exec [prompt..]',
      aliases: ['e'],
      describe: 'Run LinX non-interactively',
      builder: buildLinxDefaultCommand,
      async handler(argv): Promise<void> {
        await runLinxDefaultCommand({ ...argv, print: true }, dependencies)
      },
    },
  }
}
