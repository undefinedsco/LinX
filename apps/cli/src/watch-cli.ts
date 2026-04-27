#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  formatRemoteWatchApprovalSummary,
  formatArchivedWatchSession,
  formatWatchSessionSummary,
  loadArchivedWatchEvents,
  listArchivedWatchSessions,
  listRemoteWatchApprovals,
  listSupportedWatchBackends,
  loadArchivedWatchSession,
  resolveRemoteWatchApproval,
  runWatch,
  type WatchBackend,
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
          choices: ['run', 'backends', 'sessions', 'show', 'approvals', 'approve', 'reject', 'codex', 'claude', 'codebuddy'] as const,
        })
        .positional('backend', {
          type: 'string',
          describe: 'Watch backend for `run`, session id for `show`, or approval id for `approve|reject`',
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
        .option('session', {
          type: 'boolean',
          default: false,
          describe: 'Approve for the current watch session instead of only once.',
        })
        .option('reason', {
          type: 'string',
          describe: 'Optional note recorded with an approval decision.',
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

      if (action === 'approvals') {
        const approvals = await listRemoteWatchApprovals()
        if (approvals.length === 0) {
          process.stdout.write('No pending remote approvals in the approval inbox.\n')
          return
        }

        process.stdout.write(`${approvals.map(formatRemoteWatchApprovalSummary).join('\n')}\n`)
        return
      }

      if (action === 'approve' || action === 'reject') {
        const approvalId = argv.backend ? String(argv.backend) : ''
        if (!approvalId) {
          throw new Error(`Usage: linx watch ${action} <approvalId>`)
        }

        const summary = await resolveRemoteWatchApproval({
          approvalId,
          decision: action === 'approve'
            ? (argv.session ? 'accept_for_session' : 'accept')
            : 'decline',
          note: argv.reason ? String(argv.reason) : undefined,
        })
        process.stdout.write(`${formatRemoteWatchApprovalSummary(summary)}\n`)
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
