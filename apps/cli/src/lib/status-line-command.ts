import type { CommandModule } from 'yargs'
import {
  DEFAULT_STATUS_LINE_TOKENS,
  LINX_STATUS_LINE_TOKEN_NAMES,
  getLinxStatusLineConfigPath,
  parseLinxStatusLineColorArg,
  parseLinxStatusLineTokenArgs,
  readLinxStatusLineConfig,
  resetLinxStatusLineConfig,
  writeLinxStatusLineConfigPatch,
  type LinxStatusLineToken,
} from './linx-status-line.js'

interface StatusLineArgs {
  args?: string[]
  colors?: boolean
}

export const configCommand: CommandModule<object, object> = {
  command: 'config <section>',
  describe: 'Show or configure LinX local settings',
  builder: (yargs) =>
    yargs
      .command(statusLineCommand)
      .demandCommand(1, 'Specify a config section. Try `linx config status-line --help`.')
      .strict()
      .help(),
  handler(): void {},
}

const statusLineCommand: CommandModule<object, StatusLineArgs> = {
  command: 'status-line [args..]',
  aliases: ['statusline', 'footer'],
  describe: 'Show or configure the LinX TUI status line',
  builder: (yargs) =>
    yargs
      .positional('args', {
        array: true,
        type: 'string',
        describe: 'Action: set <tokens...>, colors <on|off>, tokens, reset',
      })
      .option('colors', {
        type: 'boolean',
        describe: 'Enable or disable status line colors when setting tokens',
      })
      .example('$0 config status-line', 'Show the effective status line config')
      .example('$0 config status-line set model-with-reasoning git-branch context-remaining', 'Configure status line tokens')
      .example('$0 config status-line colors off', 'Disable dimmed status line colors')
      .example('$0 config status-line reset', 'Return to the built-in default'),
  handler: runStatusLineCommand,
}

async function runStatusLineCommand(argv: StatusLineArgs): Promise<void> {
  const args = (argv.args ?? []).map((arg) => String(arg).trim()).filter(Boolean)
  const action = args[0]?.toLowerCase()

  if (!action) {
    if (argv.colors !== undefined) {
      writeLinxStatusLineConfigPatch({ statusLineUseColors: argv.colors })
      printStatusLineConfigured('Updated status line colors.')
      return
    }
    printStatusLineConfig()
    return
  }

  if (action === 'tokens' || action === 'list') {
    printAvailableStatusLineTokens()
    return
  }

  if (action === 'reset') {
    resetLinxStatusLineConfig()
    process.stdout.write(`Reset LinX status line to default.\n`)
    process.stdout.write(`Default tokens: ${DEFAULT_STATUS_LINE_TOKENS.join(', ')}\n`)
    return
  }

  if (action === 'colors' || action === 'color') {
    const value = parseLinxStatusLineColorArg(args[1])
    if (value === undefined) {
      throw new Error('Usage: linx config status-line colors <on|off>')
    }
    writeLinxStatusLineConfigPatch({ statusLineUseColors: value })
    printStatusLineConfigured(`Status line colors ${value ? 'enabled' : 'disabled'}.`)
    return
  }

  const tokenArgs = action === 'set' ? args.slice(1) : args
  if (tokenArgs.length === 0) {
    throw new Error('Usage: linx config status-line set <tokens...>')
  }

  const tokens = parseStatusLineTokenArgsForCommand(tokenArgs)
  writeLinxStatusLineConfigPatch({
    statusLine: tokens,
    ...(argv.colors !== undefined ? { statusLineUseColors: argv.colors } : {}),
  })
  printStatusLineConfigured('Updated LinX status line.')
}

function printStatusLineConfig(): void {
  const config = readLinxStatusLineConfig()
  process.stdout.write(`LinX status line\n`)
  process.stdout.write(`config: ${getLinxStatusLineConfigPath()}\n`)
  process.stdout.write(`tokens: ${config.tokens.join(', ')}\n`)
  process.stdout.write(`tokens source: ${config.tokenSource}\n`)
  process.stdout.write(`colors: ${config.useColors ? 'on' : 'off'}\n`)
  process.stdout.write(`colors source: ${config.colorSource}\n`)
}

function printStatusLineConfigured(message: string): void {
  const config = readLinxStatusLineConfig()
  process.stdout.write(`${message}\n`)
  process.stdout.write(`config: ${getLinxStatusLineConfigPath()}\n`)
  process.stdout.write(`tokens: ${config.tokens.join(', ')}\n`)
  process.stdout.write(`colors: ${config.useColors ? 'on' : 'off'}\n`)
}

function printAvailableStatusLineTokens(): void {
  process.stdout.write(`Available LinX status line tokens:\n`)
  for (const token of LINX_STATUS_LINE_TOKEN_NAMES) {
    process.stdout.write(`- ${token}\n`)
  }
}

function parseStatusLineTokenArgsForCommand(args: string[]): LinxStatusLineToken[] {
  try {
    return parseLinxStatusLineTokenArgs(args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown status line token')) {
      throw new Error(`${message}. Run \`linx config status-line tokens\` to list valid tokens.`)
    }
    throw error
  }
}
