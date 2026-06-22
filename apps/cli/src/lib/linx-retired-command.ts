import type { Argv, CommandModule } from 'yargs'

type RetiredSymphonyCommandArgs = {
  args?: string[]
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

export function registerRetiredCommands(command: Argv<object>): Argv<object> {
  return command
    .command(retiredSymphonyCommand)
}
