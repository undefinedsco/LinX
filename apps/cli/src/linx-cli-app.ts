import { readFileSync } from 'node:fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { configCommand } from './lib/linx-config-command.js'
import { codexNativeProxyCommand, symphonyCodexMcpCommand } from './lib/linx-codex-plugin-command.js'
import { registerRetiredCommands } from './lib/linx-retired-command.js'
import { createLinxDefaultCliCommands } from './lib/linx-pi-cli-command.js'
import { createDefaultLinxCliRuntimeAdapter } from './linx-cli-runtime-adapter-factory.js'
import { linxInstallPackageCommand, linxListPackageCommand, linxRemovePackageCommand, linxUpdatePackageCommand } from './lib/linx-package-command.js'
import { modelsCommand } from './lib/linx-models-command.js'
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

export function runLinxCli(argv = process.argv): void {
  const { defaultCommand, execCommand } = createLinxDefaultCliCommands({
    createRuntimeAdapter: createDefaultLinxCliRuntimeAdapter,
  })

  const cli = registerRetiredCommands(yargs(hideBin(argv))
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
    .command(linxInstallPackageCommand)
    .command(linxRemovePackageCommand)
    .command(linxUpdatePackageCommand)
    .command(linxListPackageCommand)
    .command(execCommand)
    .command(defaultCommand)
    .command(modelsCommand)
    .command(symphonyCodexMcpCommand)
    .command(codexNativeProxyCommand)
    .strict()
    .help())
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

  cli.parse()
}

export function installLinxCliUnhandledRejectionHandler(): void {
  process.on('unhandledRejection', (error: unknown) => {
    console.error(formatLinxCliErrorMessage(error))
    process.exit(1)
  })
}
