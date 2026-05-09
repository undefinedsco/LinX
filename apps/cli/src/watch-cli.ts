#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  formatArchivedWatchSession,
  formatWatchSessionSummary,
  loadArchivedWatchEvents,
  listArchivedWatchSessions,
  listSupportedWatchBackends,
  loadArchivedWatchSession,
  runWatch,
  type WatchBackend,
  type WatchApprovalSource,
  type WatchCredentialSource,
  type WatchMode,
} from './lib/watch/index.js'

const cli = yargs(hideBin(process.argv))
  .scriptName('linx watch')
  .parserConfiguration({
    'populate--': true,
  })
  .command(
    '$0 <action> [backend] [prompt..]',
    'Run or inspect local watch backends',
    (command) =>
      command
        .positional('action', {
          type: 'string',
          choices: ['run', 'backends', 'sessions', 'show', 'codex', 'claude', 'codebuddy'] as const,
        })
        .positional('backend', {
          type: 'string',
          describe: 'Watch backend for `run` or session id for `show`',
        })
        .option('mode', {
          type: 'string',
          default: 'smart',
          choices: ['manual', 'smart', 'auto'] as const,
          describe: 'Unified autonomy mode',
        })
        .option('model', {
          type: 'string',
          describe: 'Backend-native model override',
        })
        .option('cwd', {
          type: 'string',
          describe: 'Working directory for local backend execution',
        })
        .option('plain', {
          type: 'boolean',
          default: false,
          describe: 'Disable full-screen TUI and use plain streaming output',
        })
        .option('credential-source', {
          type: 'string',
          default: 'auto',
          choices: ['auto', 'local', 'cloud'] as const,
          describe: 'Resolve credentials only: local CLI login, LinX cloud config, or auto fallback. Runtime still runs locally.',
        })
        .option('approval-source', {
          type: 'string',
          default: 'hybrid',
          choices: ['local', 'remote', 'hybrid'] as const,
          describe: 'Resolve backend approval requests locally, through Pod remote approvals, or whichever answers first.',
        }),
    async (argv) => {
      const rawAction = String(argv.action)
      const directBackend = ['codex', 'claude', 'codebuddy'].includes(rawAction)
      const action = directBackend ? 'run' : rawAction

      if (action === 'backends') {
        const backends = listSupportedWatchBackends()
        for (const backend of backends) {
          process.stdout.write(`- ${backend.backend} (${backend.label})\n`)
          process.stdout.write(`  ${backend.description}\n`)
          process.stdout.write(`  manual: ${backend.modes.manual}\n`)
          process.stdout.write(`  smart: ${backend.modes.smart}\n`)
          process.stdout.write(`  auto: ${backend.modes.auto}\n`)
        }
        return
      }

      if (action === 'sessions') {
        const sessions = listArchivedWatchSessions()
        if (sessions.length === 0) {
          process.stdout.write('No watch sessions found.\n')
          return
        }

        process.stdout.write(`${sessions.map(formatWatchSessionSummary).join('\n')}\n`)
        return
      }

      if (action === 'show') {
        const sessionId = argv.backend ? String(argv.backend) : ''
        if (!sessionId) {
          throw new Error('Usage: linx watch show <sessionId>')
        }

        const session = loadArchivedWatchSession(sessionId)
        if (!session) {
          throw new Error(`Watch session not found: ${sessionId}`)
        }

        process.stdout.write(formatArchivedWatchSession(session, loadArchivedWatchEvents(sessionId)))
        return
      }

      const backend = (directBackend ? rawAction : argv.backend) as WatchBackend | undefined
      if (!backend || !['codex', 'claude', 'codebuddy'].includes(backend)) {
        throw new Error('Usage: linx watch run <codex|claude|codebuddy> <prompt> [-- backend args]\n   or: linx watch <codex|claude|codebuddy> <prompt>')
      }

      const plain = Boolean(argv.plain)
      const prompt = ((directBackend ? [argv.backend, ...(argv.prompt as string[] | undefined ?? [])] : (argv.prompt as string[] | undefined)) ?? [])
        .filter((item): item is string => typeof item === 'string')
        .join(' ')
        .trim() || undefined
      const exitCode = await runWatch({
        backend,
        mode: argv.mode as WatchMode,
        cwd: argv.cwd || process.cwd(),
        plain,
        model: argv.model,
        prompt,
        passthroughArgs: ((argv['--'] as string[] | undefined) ?? []).map(String),
        credentialSource: argv['credential-source'] as WatchCredentialSource,
        approvalSource: argv['approval-source'] as WatchApprovalSource,
      })

      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
    },
  )
  .strict()
  .help()

process.on('unhandledRejection', (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

cli.parse()
