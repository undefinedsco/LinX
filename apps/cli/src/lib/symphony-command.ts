import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import type { AutoModeBackend, AutoModeMode } from '@linx/agent-runtime/auto-mode'
import type { LinxSymphonyRunPlan, LinxSymphonyWorkspaceKind } from '@linx/agent-runtime/symphony'
import { runAutoMode, listArchivedAutoModeSessions, type AutoRunOptions } from './auto-mode/index.js'
import {
  createArchivedLinxSymphonyRunPlan,
  formatLinxSymphonyRecordSummary,
  getLinxSymphonyHome,
  listLinxSymphonyDeliveries,
  listLinxSymphonySessions,
  listLinxSymphonyTasks,
  resolveLinxSymphonyRecord,
  updateLinxSymphonyDeliveryStatus,
  updateLinxSymphonySessionStatus,
  updateLinxSymphonyTaskStatus,
} from './symphony/archive.js'

const SYMPHONY_BACKENDS = ['codex', 'claude', 'codebuddy'] as const

export interface LinxSymphonyRuntime {
  runAutoMode(options: AutoRunOptions): Promise<number>
  listAutoModeSessions(): ReturnType<typeof listArchivedAutoModeSessions>
}

interface LinxSymphonyRunArgs {
  objective?: string[]
  backend?: AutoModeBackend
  auto?: boolean
  dryRun?: boolean
  cwd?: string
  title?: string
  acceptance?: string | string[]
  model?: string
  plain?: boolean
  repository?: string
  branch?: string
  worktree?: string
  workspaceKind?: LinxSymphonyWorkspaceKind
  '--'?: string[]
}

interface LinxSymphonyShowArgs {
  id?: string
}

const defaultRuntime: LinxSymphonyRuntime = {
  runAutoMode,
  listAutoModeSessions: listArchivedAutoModeSessions,
}

export function createLinxSymphonyCommand(runtime: LinxSymphonyRuntime = defaultRuntime): CommandModule<object, object> {
  return {
    command: 'symphony <command>',
    describe: 'Create and inspect LinX Symphony task deliveries',
    builder(command): Argv<object> {
      return buildLinxSymphonyCommandTree(command, runtime)
        .demandCommand(1, 'Usage: linx symphony <run|tasks|sessions|deliveries|show>')
    },
    handler() {
      // Subcommands own execution.
    },
  }
}

export const symphonyCommand = createLinxSymphonyCommand()

export function buildLinxSymphonyCommandTree<T extends object>(
  command: Argv<T>,
  runtime: LinxSymphonyRuntime = defaultRuntime,
): Argv<T> {
  return command
    .command(createRunCommand(runtime))
    .command(createListCommand('tasks', 'List Symphony tasks', () => listLinxSymphonyTasks().map((record) => formatLinxSymphonyRecordSummary('task', record))))
    .command(createListCommand('sessions', 'List Symphony sessions', () => listLinxSymphonySessions().map((record) => formatLinxSymphonyRecordSummary('session', record))))
    .command(createListCommand('deliveries', 'List Symphony deliveries', () => listLinxSymphonyDeliveries().map((record) => formatLinxSymphonyRecordSummary('delivery', record))))
    .command(createShowCommand())
}

function createRunCommand(runtime: LinxSymphonyRuntime): CommandModule<object, LinxSymphonyRunArgs> {
  return {
    command: 'run [objective..]',
    describe: 'Create a Symphony task delivery and optionally run it through a backend',
    builder(command): Argv<LinxSymphonyRunArgs> {
      return command
        .positional('objective', {
          array: true,
          type: 'string',
          describe: 'Task objective to delegate',
        })
        .option('backend', {
          type: 'string',
          choices: SYMPHONY_BACKENDS,
          default: 'codex',
          describe: 'External agent backend to receive the projected task',
        })
        .option('auto', {
          type: 'boolean',
          default: false,
          describe: 'Run backend in auto mode so AI Secretary handles in-policy confirmations',
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          describe: 'Archive the task/delivery/session plan without launching a backend',
        })
        .option('cwd', {
          type: 'string',
          describe: 'Workspace path for the target runtime session',
        })
        .option('title', {
          type: 'string',
          describe: 'Human-readable task title',
        })
        .option('acceptance', {
          alias: 'a',
          array: true,
          type: 'string',
          describe: 'Acceptance criterion; repeat for multiple criteria',
        })
        .option('model', {
          type: 'string',
          describe: 'Model id forwarded to the backend',
        })
        .option('plain', {
          type: 'boolean',
          default: false,
          describe: 'Disable full-screen backend UI and use plain output',
        })
        .option('repository', {
          type: 'string',
          describe: 'Repository URL metadata override',
        })
        .option('branch', {
          type: 'string',
          describe: 'Git branch metadata override',
        })
        .option('worktree', {
          type: 'string',
          describe: 'Git worktree metadata override',
        })
        .option('workspace-kind', {
          type: 'string',
          choices: ['git', 'folder'] as const,
          describe: 'Workspace kind metadata override',
        }) as Argv<LinxSymphonyRunArgs>
    },
    async handler(argv): Promise<void> {
      await runLinxSymphony(argv, runtime)
    },
  }
}

function createListCommand(
  commandName: 'tasks' | 'sessions' | 'deliveries',
  describe: string,
  loadLines: () => string[],
): CommandModule<object, object> {
  return {
    command: commandName,
    describe,
    builder(command): Argv<object> {
      return command
    },
    handler() {
      const lines = loadLines()
      if (lines.length === 0) {
        process.stdout.write(`No Symphony ${commandName} found.\n`)
        return
      }

      process.stdout.write(`${lines.join('\n')}\n`)
    },
  }
}

function createShowCommand(): CommandModule<object, LinxSymphonyShowArgs> {
  return {
    command: 'show <id>',
    describe: 'Show a Symphony task, delivery, or session by id/prefix',
    builder(command): Argv<LinxSymphonyShowArgs> {
      return command.positional('id', {
        type: 'string',
        describe: 'Task, delivery, or session id/prefix',
      }) as Argv<LinxSymphonyShowArgs>
    },
    handler(argv) {
      const id = typeof argv.id === 'string' ? argv.id : ''
      const resolved = resolveLinxSymphonyRecord(id)
      if (!resolved) {
        throw new Error(`Symphony record not found: ${id}`)
      }

      process.stdout.write(`${formatLinxSymphonyRecordSummary(resolved.kind, resolved.record)}\n`)
      process.stdout.write(`${JSON.stringify(resolved.record, null, 2)}\n`)
    },
  }
}

export async function runLinxSymphony(
  argv: LinxSymphonyRunArgs,
  runtime: LinxSymphonyRuntime = defaultRuntime,
): Promise<LinxSymphonyRunPlan> {
  const objective = normalizeObjective(argv.objective)
  const cwd = resolve(argv.cwd || process.cwd())
  const workspace = resolveWorkspaceMetadata(cwd, argv)
  const backend = argv.backend ?? 'codex'
  const mode: AutoModeMode = argv.auto ? 'auto' : 'manual'
  const plan = createArchivedLinxSymphonyRunPlan({
    objective,
    title: normalizeOptional(argv.title),
    acceptanceCriteria: normalizeAcceptanceCriteria(argv.acceptance),
    workspacePath: cwd,
    workspaceKind: workspace.kind,
    repository: workspace.repository,
    branch: workspace.branch,
    worktree: workspace.worktree,
    backend,
    mode,
    model: normalizeOptional(argv.model),
  })

  if (argv.dryRun) {
    updateLinxSymphonySessionStatus(plan.session, 'planned', { dryRun: true })
    printLinxSymphonyRunPlan(plan, { dryRun: true })
    return plan
  }

  let task = updateLinxSymphonyTaskStatus(plan.task, 'running')
  let delivery = updateLinxSymphonyDeliveryStatus(plan.delivery, 'dispatched')
  let session = updateLinxSymphonySessionStatus(plan.session, 'running')
  const beforeAutoModeIds = new Set(runtime.listAutoModeSessions().map((record) => record.id))

  try {
    const exitCode = await runtime.runAutoMode({
      backend,
      mode,
      autoModeEnabled: argv.auto,
      cwd,
      plain: Boolean(argv.plain),
      model: normalizeOptional(argv.model),
      prompt: plan.delivery.projection.prompt,
      passthroughArgs: ((argv['--'] as string[] | undefined) ?? []).map(String),
    })
    const autoModeSessionId = resolveCreatedAutoModeSessionId(beforeAutoModeIds, runtime)
    const status = exitCode === 0 ? 'completed' : 'failed'
    task = updateLinxSymphonyTaskStatus(task, status, exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` })
    delivery = updateLinxSymphonyDeliveryStatus(delivery, status, {
      autoModeSessionId,
      ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
    })
    session = updateLinxSymphonySessionStatus(session, status, {
      autoModeSessionId,
      exitCode,
      ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
    })
    printLinxSymphonyRunPlan({ task, delivery, session }, { dryRun: false })
    if (exitCode !== 0) {
      process.exitCode = exitCode
    }
    return { task, delivery, session }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateLinxSymphonyTaskStatus(task, 'failed', { error: message })
    updateLinxSymphonyDeliveryStatus(delivery, 'failed', { error: message })
    updateLinxSymphonySessionStatus(session, 'failed', { error: message, exitCode: 1 })
    throw error
  }
}

function printLinxSymphonyRunPlan(plan: LinxSymphonyRunPlan, options: { dryRun: boolean }): void {
  process.stdout.write(options.dryRun ? 'LinX Symphony dry-run\n' : 'LinX Symphony run\n')
  process.stdout.write(`task: ${formatLinxSymphonyRecordSummary('task', plan.task)}\n`)
  process.stdout.write(`delivery: ${formatLinxSymphonyRecordSummary('delivery', plan.delivery)}\n`)
  process.stdout.write(`session: ${formatLinxSymphonyRecordSummary('session', plan.session)}\n`)
  process.stdout.write(`archive: ${getLinxSymphonyHome()}\n`)
  if (options.dryRun) {
    process.stdout.write('\nProjected runtime prompt:\n')
    process.stdout.write(`${plan.delivery.projection.prompt}\n`)
  }
}

function resolveCreatedAutoModeSessionId(beforeIds: Set<string>, runtime: LinxSymphonyRuntime): string | undefined {
  const created = runtime.listAutoModeSessions()
    .filter((record) => !beforeIds.has(record.id))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  return created[0]?.id
}

function normalizeObjective(parts?: string[]): string {
  const objective = (parts ?? [])
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!objective) {
    throw new Error('Usage: linx symphony run <objective> [--backend codex] [--dry-run]')
  }
  return objective
}

function normalizeAcceptanceCriteria(value?: string | string[]): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values
    .flatMap((item) => item.split(/\r?\n/u))
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeOptional(value?: string | null): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function resolveWorkspaceMetadata(cwd: string, argv: LinxSymphonyRunArgs): {
  kind: LinxSymphonyWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
} {
  const git = isGitWorkspace(cwd)
  return {
    kind: argv.workspaceKind ?? (git ? 'git' : 'folder'),
    repository: normalizeOptional(argv.repository) ?? (git ? gitOutput(cwd, ['remote', 'get-url', 'origin']) : undefined),
    branch: normalizeOptional(argv.branch) ?? (git ? gitOutput(cwd, ['branch', '--show-current']) : undefined),
    worktree: normalizeOptional(argv.worktree) ?? (git ? gitOutput(cwd, ['rev-parse', '--show-toplevel']) : undefined),
  }
}

function isGitWorkspace(cwd: string): boolean {
  return gitOutput(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true'
}

function gitOutput(cwd: string, args: string[]): string | undefined {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if ((result.status ?? 1) !== 0) {
    return undefined
  }

  return normalizeOptional(result.stdout)
}
