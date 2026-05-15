import type { Argv } from 'yargs'
import {
  formatArchivedAutoModeSession,
  formatAutoModeSessionSummary,
  loadArchivedAutoModeEvents,
  listArchivedAutoModeSessions,
  listSupportedAutoModeBackends,
  loadArchivedAutoModeSession,
  resumeAutoModeSession,
  runAutoMode,
  type AutoModeBackend,
  type AutoModeMode,
} from './auto-mode/index.js'

const AUTO_MODE_BACKENDS = ['codex', 'claude', 'codebuddy'] as const

export interface AutoModeCommandArgs {
  prompt?: string[]
  backend?: AutoModeBackend
  auto?: boolean
  model?: string
  cwd?: string
  plain?: boolean
  'list-backends'?: boolean
  sessions?: boolean
  show?: string
  resumeSession?: string
  '--'?: string[]
}

export function isAutoModeBackend(value: unknown): value is AutoModeBackend {
  return typeof value === 'string' && AUTO_MODE_BACKENDS.includes(value as AutoModeBackend)
}

export function isAutoModeRequest(argv: AutoModeCommandArgs): boolean {
  return isAutoModeBackend(argv.backend)
    || Boolean(argv.auto)
    || Boolean(argv.plain)
    || Boolean(argv['list-backends'])
    || Boolean(argv.sessions)
    || typeof argv.show === 'string'
}

function resolveAutoMode(argv: AutoModeCommandArgs): AutoModeMode {
  if (argv.auto) {
    return 'auto'
  }
  return 'manual'
}

export function buildAutoModeOptions<T extends object>(command: Argv<T>): Argv<T & AutoModeCommandArgs> {
  const withOptions = command
    .option('backend', {
      type: 'string',
      choices: AUTO_MODE_BACKENDS,
      describe: 'External agent backend to control from LinX',
    })
    .option('auto', {
      type: 'boolean',
      describe: 'Start the selected backend with automatic AI secretary approvals enabled',
    })
    .option('plain', {
      type: 'boolean',
      describe: 'Disable full-screen TUI and use plain streaming output',
    })
    .option('list-backends', {
      type: 'boolean',
      describe: 'List supported external agent backends',
    })
    .option('sessions', {
      type: 'boolean',
      describe: 'List auto-mode sessions',
    })
    .option('show', {
      type: 'string',
      describe: 'Replay an auto-mode session by session id',
    })
  return withOptions as Argv<T & AutoModeCommandArgs>
}

export async function runAutoModeCommand(argv: AutoModeCommandArgs): Promise<void> {
  if (argv['list-backends']) {
    const backends = listSupportedAutoModeBackends()
    for (const backend of backends) {
      process.stdout.write(`- ${backend.backend} (${backend.label})\n`)
      process.stdout.write(`  ${backend.description}\n`)
      process.stdout.write(`  manual: ${backend.modes.manual}\n`)
      process.stdout.write(`  smart: ${backend.modes.smart}\n`)
      process.stdout.write(`  auto: ${backend.modes.auto}\n`)
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
    throw new Error('Usage: linx --backend <codex|claude|codebuddy> [prompt] [--auto] [-- backend args]')
  }

  const prompt = (argv.prompt ?? [])
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .trim() || undefined

  const exitCode = await runAutoMode({
    backend: argv.backend,
    mode: resolveAutoMode(argv),
    autoModeEnabled: Boolean(argv.auto),
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
