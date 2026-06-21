#!/usr/bin/env node
import './lib/node-warning-filter.js'
import { readFileSync } from 'node:fs'
import yargs, { type CommandModule } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { configCommand } from './lib/status-line-command.js'
import { codexNativeProxyCommand, symphonyCodexMcpCommand } from './lib/linx-codex-plugin-command.js'
import { createLinxPiCliCommands } from './lib/linx-pi-cli-command.js'
import { linxInstallPackageCommand, linxListPackageCommand, linxRemovePackageCommand, linxUpdatePackageCommand } from './lib/linx-package-command.js'
import { legacyChatCommand, modelsCommand } from './lib/linx-chat-models-command.js'
import { createLinxRuntimeAdapter } from './lib/pi-adapter/index.js'
import { formatLinxCliErrorMessage } from './lib/linx-cloud-errors.js'

function readPackageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : 'unknown'
  } catch {
    return 'unknown'
  }
}



const { defaultPiCommand, execCommand, hiddenPiAliasCommand, hiddenPiFrontendAliasCommand } = createLinxPiCliCommands({
  createRuntimeAdapter(options) {
    return createLinxRuntimeAdapter({
      async createRemoteCompletion(completionOptions) {
        const chatApi = await import('./lib/chat-api.js')
        return chatApi.createRemoteCompletionResult(completionOptions)
      },
      async listRemoteModels(authFetch, runtimeUrl, listOptions) {
        const chatApi = await import('./lib/chat-api.js')
        return chatApi.listRemoteModels(authFetch, runtimeUrl, listOptions ?? { fallback: false, timeoutMs: 5000 })
      },
    }, options)
  },
})

const retiredSymphonyCommand: CommandModule<object, { args?: string[] }> = {
  command: 'symphony [args..]',
  describe: false,
  builder(command) {
    return command
      .help(false)
      .version(false)
      .positional('args', {
        array: true,
        type: 'string',
        describe: 'Retired Symphony CLI arguments',
      })
  },
  handler(): void {
    throw new Error('`linx symphony` is not a product command. Enter the TUI, run `/symphony on`, then send the objective as normal chat to Secretary.')
  },
}

const cli = yargs(hideBin(process.argv))
  .scriptName('linx')
  .version(readPackageVersion())
  .parserConfiguration({
    'populate--': true,
  })
  .command(loginCommand)
  .command(logoutCommand)
  .command(whoamiCommand)
  .command(aiCommand)
  .command(configCommand)
  .command(retiredSymphonyCommand)
  .command(linxInstallPackageCommand)
  .command(linxRemovePackageCommand)
  .command(linxUpdatePackageCommand)
  .command(linxListPackageCommand)
  .command(execCommand)
  .command(defaultPiCommand)
  .command(legacyChatCommand)
  .command(modelsCommand)
  .command(
    'fork [thread]',
    'Fork a previous interactive session',
    (command) => command
      .positional('thread', { type: 'string', describe: 'Thread ID to fork' })
      .option('last', { type: 'boolean', default: false, describe: 'Fork the most recent thread' }),
    () => {
      throw new Error('Fork is not implemented yet for LinX Pod-backed sessions.')
    },
  )
  .command(hiddenPiAliasCommand)
  .command(hiddenPiFrontendAliasCommand)
  .command(symphonyCodexMcpCommand)
  .command(codexNativeProxyCommand)
  .strict()
  .help()
  .fail((message, error, yargsInstance) => {
    if (error) {
      console.error(formatLinxCliErrorMessage(error))
      process.exit(1)
    }
    if (message) {
      console.error(formatLinxCliErrorMessage(message))
      process.exit(1)
    }
    yargsInstance.showHelp()
    process.exit(1)
  })

process.on('unhandledRejection', (error: unknown) => {
  console.error(formatLinxCliErrorMessage(error))
  process.exit(1)
})

cli.parse()
