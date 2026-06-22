import type { CommandModule } from 'yargs'
import { statusLineConfigCommand } from './linx-status-line-config-command.js'

export const configCommand: CommandModule<object, object> = {
  command: 'config <section>',
  describe: 'Show or configure LinX local settings',
  builder: (yargs) =>
    yargs
      .command(statusLineConfigCommand)
      .demandCommand(1, 'Specify a config section. Try `linx config status-line --help`.')
      .strict()
      .help(),
  handler(): void {},
}
