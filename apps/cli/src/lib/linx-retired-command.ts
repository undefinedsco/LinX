import type { Argv, CommandModule } from 'yargs'

type RetiredSymphonyCommandArgs = {
  args?: string[]
}

type ForkCommandArgs = {
  thread?: string
  last: boolean
}

const retiredSymphonyCommand: CommandModule<object, RetiredSymphonyCommandArgs> = {
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
      }) as Argv<RetiredSymphonyCommandArgs>
  },
  handler(): void {
    throw new Error('`linx symphony` is not a product command. Enter the TUI, run `/symphony on`, then send the objective as normal chat to Secretary.')
  },
}

const forkPlaceholderCommand: CommandModule<object, ForkCommandArgs> = {
  command: 'fork [thread]',
  describe: 'Fork a previous interactive session',
  builder(command) {
    return command
      .positional('thread', { type: 'string', describe: 'Thread ID to fork' })
      .option('last', { type: 'boolean', default: false, describe: 'Fork the most recent thread' }) as Argv<ForkCommandArgs>
  },
  handler(): void {
    throw new Error('Fork is not implemented yet for LinX Pod-backed sessions.')
  },
}

export function registerRetiredAndPlaceholderCommands(command: Argv<object>): Argv<object> {
  return command
    .command(retiredSymphonyCommand)
    .command(forkPlaceholderCommand)
}
