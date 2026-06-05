import type { Argv } from 'yargs'
import {
  formatArchivedAutoModeSession,
  formatAutoModeSessionSummary,
  loadArchivedAutoModeEvents,
  listArchivedAutoModeSessions,
  listArchivedAutoModeSessionsWithPendingSync,
  listSupportedAutoModeBackends,
  loadArchivedAutoModeSession,
  retryArchivedAutoModePodSync,
  resumeAutoModeSession,
  runAutoMode,
  type AutoModeWorkerBackend,
} from './auto-mode/index.js'

const AUTO_MODE_BACKENDS = ['linx', 'codex', 'claude', 'codebuddy'] as const

export interface AutoModeCommandArgs {
  prompt?: string[]
  backend?: AutoModeWorkerBackend
  auto?: boolean
  model?: string
  cwd?: string
  plain?: boolean
  'list-backends'?: boolean
  sessions?: boolean
  show?: string
  'sync-status'?: boolean
  'sync-retry'?: string
  resumeSession?: string
  '--'?: string[]
}

export function isAutoModeBackend(value: unknown): value is AutoModeWorkerBackend {
  return typeof value === 'string' && AUTO_MODE_BACKENDS.includes(value as AutoModeWorkerBackend)
}

export function isAutoModeRequest(argv: AutoModeCommandArgs): boolean {
  return Boolean(argv['list-backends'])
    || Boolean(argv.sessions)
    || typeof argv.show === 'string'
    || Boolean(argv['sync-status'])
    || typeof argv['sync-retry'] === 'string'
}

export function buildAutoModeOptions<T extends object>(command: Argv<T>): Argv<T & AutoModeCommandArgs> {
  const withOptions = command
    .option('backend', {
      type: 'string',
      choices: AUTO_MODE_BACKENDS,
      describe: 'Runtime backend for the LinX session',
    })
    .option('auto', {
      type: 'boolean',
      describe: 'Start with AI Secretary driving the selected backend session and asking when blocked',
    })
    .option('plain', {
      type: 'boolean',
      hidden: true,
    })
    .option('list-backends', {
      type: 'boolean',
      describe: 'List available backend runtimes',
    })
    .option('sessions', {
      type: 'boolean',
      hidden: true,
    })
    .option('show', {
      type: 'string',
      hidden: true,
    })
    .option('sync-status', {
      type: 'boolean',
      hidden: true,
    })
    .option('sync-retry', {
      type: 'string',
      hidden: true,
    })
  return withOptions as Argv<T & AutoModeCommandArgs>
}

export async function runAutoModeCommand(argv: AutoModeCommandArgs): Promise<void> {
  if (argv['list-backends']) {
    const backends = listSupportedAutoModeBackends()
    for (const backend of backends) {
      process.stdout.write(`- ${backend.backend} (${backend.label})\n`)
      process.stdout.write(`  ${backend.description}\n`)
      process.stdout.write(`  auto: ${backend.auto}\n`)
    }
    return
  }

  if (argv.sessions) {
    const sessions = listArchivedAutoModeSessions()
    if (sessions.length === 0) {
      process.stdout.write('No auto-mode sessions found.\n')
      return
    }

    process.stdout.write(`${sessions.map(formatAutoModeSessionSummary).join('\n')}\n`)
    return
  }

  if (argv['sync-status']) {
    const sessions = listArchivedAutoModeSessionsWithPendingSync()
    if (sessions.length === 0) {
      process.stdout.write('No pending auto-mode Pod sync sessions.\n')
      return
    }

    process.stdout.write(`${sessions.map((session) => `${session.id} · ${formatAutoModeSessionSummary(session)}`).join('\n')}\n`)
    return
  }

  if (argv['sync-retry']) {
    const synced = await retryArchivedAutoModePodSync(argv['sync-retry'])
    process.stdout.write(synced
      ? `Retried auto-mode Pod sync: ${argv['sync-retry']}\n`
      : `Auto-mode Pod sync skipped: ${argv['sync-retry']}\n`)
    return
  }

  if (argv.show) {
    const session = loadArchivedAutoModeSession(argv.show)
    if (!session) {
      throw new Error(`Auto-mode session not found: ${argv.show}`)
    }

    process.stdout.write(formatArchivedAutoModeSession(session, loadArchivedAutoModeEvents(argv.show)))
    return
  }

  if (argv.resumeSession) {
    const session = loadArchivedAutoModeSession(argv.resumeSession)
    if (!session) {
      throw new Error(`Auto-mode session not found: ${argv.resumeSession}`)
    }

    const exitCode = await resumeAutoModeSession(session, {
      cwd: argv.cwd || process.cwd(),
      model: argv.model,
      plain: Boolean(argv.plain),
    })
    if (exitCode !== 0) {
      process.exitCode = exitCode
    }
    return
  }

  if (!isAutoModeBackend(argv.backend)) {
    throw new Error('Usage: linx --backend <linx|codex|claude|codebuddy> [prompt] [--auto] [-- backend args]')
  }

  const prompt = (argv.prompt ?? [])
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .trim() || undefined

  const exitCode = await runAutoMode({
    backend: argv.backend,
    autoEnabled: Boolean(argv.auto),
    cwd: argv.cwd || process.cwd(),
    plain: Boolean(argv.plain),
    model: argv.model,
    prompt,
    passthroughArgs: ((argv['--'] as string[] | undefined) ?? []).map(String),
  })

  if (exitCode !== 0) {
    process.exitCode = exitCode
  }
}
