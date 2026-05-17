import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import type { AutoModeBackend, AutoModeMode } from '@linx/agent-runtime/auto-mode'
import type { SymphonyRunPlan, SymphonyWorkspaceKind } from '@linx/agent-runtime/symphony'
import { runAutoMode, listArchivedAutoModeSessions, type AutoRunOptions } from './auto-mode/index.js'
import {
  createArchivedSymphonyRunPlan,
  formatSymphonyRecordSummary,
  getSymphonyHome,
  listSymphonyDeliveries,
  listSymphonyIssues,
  listSymphonySessions,
  resolveSymphonyRecord,
  updateSymphonyIssueStatus,
  updateSymphonyDeliveryStatus,
  updateSymphonySessionStatus,
} from './symphony/archive.js'

const SYMPHONY_BACKENDS = ['codex', 'claude', 'codebuddy'] as const

export interface SymphonyRuntime {
  runAutoMode(options: AutoRunOptions): Promise<number>
  listAutoModeSessions(): ReturnType<typeof listArchivedAutoModeSessions>
}

interface SymphonyRunArgs {
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
  workspaceKind?: SymphonyWorkspaceKind
  '--'?: string[]
}

interface SymphonyShowArgs {
  id?: string
}

const defaultRuntime: SymphonyRuntime = {
  runAutoMode,
  listAutoModeSessions: listArchivedAutoModeSessions,
}

export function createSymphonyCommand(runtime: SymphonyRuntime = defaultRuntime): CommandModule<object, object> {
  return {
    command: 'symphony <command>',
    describe: 'Inspect and tune AI Secretary Symphony delegation',
    builder(command): Argv<object> {
      return buildSymphonyCommandTree(command, runtime)
        .demandCommand(1, 'Usage: linx symphony <run|issues|sessions|deliveries|show>')
    },
    handler() {
      // Subcommands own execution.
    },
  }
}

export const symphonyCommand = createSymphonyCommand()

export function buildSymphonyCommandTree<T extends object>(
  command: Argv<T>,
  runtime: SymphonyRuntime = defaultRuntime,
): Argv<T> {
  return command
    .command(createRunCommand(runtime))
    .command(createListCommand('issues', 'List Symphony issues', () => listSymphonyIssues().map((record) => formatSymphonyRecordSummary('issue', record))))
    .command(createListCommand('sessions', 'List Symphony sessions', () => listSymphonySessions().map((record) => formatSymphonyRecordSummary('session', record))))
    .command(createListCommand('deliveries', 'List Symphony deliveries', () => listSymphonyDeliveries().map((record) => formatSymphonyRecordSummary('delivery', record))))
    .command(createShowCommand())
}

function createRunCommand(runtime: SymphonyRuntime): CommandModule<object, SymphonyRunArgs> {
  return {
    command: 'run [objective..]',
    describe: 'Ask AI Secretary to delegate work through Symphony',
    builder(command): Argv<SymphonyRunArgs> {
      return command
        .positional('objective', {
          array: true,
          type: 'string',
          describe: 'Task objective for Secretary to delegate',
        })
        .option('backend', {
          type: 'string',
          choices: SYMPHONY_BACKENDS,
          default: 'codex',
          describe: 'Worker backend receiving Secretary-projected work',
        })
        .option('auto', {
          type: 'boolean',
          default: false,
          describe: 'Let AI Secretary handle in-policy worker confirmations',
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          describe: 'Archive the issue/delivery/session plan without launching a backend',
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
        }) as Argv<SymphonyRunArgs>
    },
    async handler(argv): Promise<void> {
      await runSymphony(argv, runtime)
    },
  }
}

function createListCommand(
  commandName: 'issues' | 'sessions' | 'deliveries',
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

function createShowCommand(): CommandModule<object, SymphonyShowArgs> {
  return {
    command: 'show <id>',
    describe: 'Show a Symphony issue, delivery, or session by URI/key prefix',
    builder(command): Argv<SymphonyShowArgs> {
      return command.positional('id', {
        type: 'string',
        describe: 'Issue, delivery, or session URI/key prefix',
      }) as Argv<SymphonyShowArgs>
    },
    handler(argv) {
      const id = typeof argv.id === 'string' ? argv.id : ''
      const resolved = resolveSymphonyRecord(id)
      if (!resolved) {
        throw new Error(`Symphony record not found: ${id}`)
      }

      process.stdout.write(`${formatSymphonyRecordSummary(resolved.kind, resolved.record)}\n`)
      process.stdout.write(`${JSON.stringify(resolved.record, null, 2)}\n`)
    },
  }
}

export async function runSymphony(
  argv: SymphonyRunArgs,
  runtime: SymphonyRuntime = defaultRuntime,
): Promise<SymphonyRunPlan> {
  const objective = normalizeObjective(argv.objective)
  const cwd = resolve(argv.cwd || process.cwd())
  const workspace = resolveWorkspaceMetadata(cwd, argv)
  const backend = argv.backend ?? 'codex'
  const mode: AutoModeMode = argv.auto ? 'auto' : 'manual'
  const plan = createArchivedSymphonyRunPlan({
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
    updateSymphonySessionStatus(plan.session, 'planned', { dryRun: true })
    printSymphonyRunPlan(plan, { dryRun: true })
    return plan
  }

  let issue = updateSymphonyIssueStatus(plan.issue, 'in_progress')
  let delivery = updateSymphonyDeliveryStatus(plan.delivery, 'dispatched')
  let session = updateSymphonySessionStatus(plan.session, 'running')
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
      goalMode: true,
      passthroughArgs: ((argv['--'] as string[] | undefined) ?? []).map(String),
    })
    const autoModeSessionId = resolveCreatedAutoModeSessionId(beforeAutoModeIds, runtime)
    const status = exitCode === 0 ? 'completed' : 'failed'
    issue = updateSymphonyIssueStatus(issue, exitCode === 0 ? 'resolved' : 'blocked', exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` })
    delivery = updateSymphonyDeliveryStatus(delivery, status, {
      autoModeSessionId,
      ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
    })
    session = updateSymphonySessionStatus(session, status, {
      autoModeSessionId,
      exitCode,
      ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
    })
    printSymphonyRunPlan({ issue, task: plan.task, delivery, session }, { dryRun: false })
    if (exitCode !== 0) {
      process.exitCode = exitCode
    }
    return { issue, task: plan.task, delivery, session }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateSymphonyIssueStatus(issue, 'blocked', { error: message })
    updateSymphonyDeliveryStatus(delivery, 'failed', { error: message })
    updateSymphonySessionStatus(session, 'failed', { error: message, exitCode: 1 })
    throw error
  }
}

function printSymphonyRunPlan(plan: SymphonyRunPlan, options: { dryRun: boolean }): void {
  process.stdout.write(options.dryRun ? 'LinX Symphony dry-run\n' : 'LinX Symphony run\n')
  process.stdout.write(`issue: ${formatSymphonyRecordSummary('issue', plan.issue)}\n`)
  process.stdout.write(`task: ${plan.task}\n`)
  process.stdout.write(`delivery: ${formatSymphonyRecordSummary('delivery', plan.delivery)}\n`)
  process.stdout.write(`session: ${formatSymphonyRecordSummary('session', plan.session)}\n`)
  process.stdout.write(`archive: ${getSymphonyHome()}\n`)
  if (options.dryRun) {
    process.stdout.write('\nProjected runtime prompt:\n')
    process.stdout.write(`${plan.delivery.projection.prompt}\n`)
  }
}

function resolveCreatedAutoModeSessionId(beforeIds: Set<string>, runtime: SymphonyRuntime): string | undefined {
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

function resolveWorkspaceMetadata(cwd: string, argv: SymphonyRunArgs): {
  kind: SymphonyWorkspaceKind
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
