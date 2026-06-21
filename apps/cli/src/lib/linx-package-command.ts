import type { Argv, CommandModule } from 'yargs'
import { DefaultPackageManager, SettingsManager } from '@earendil-works/pi-coding-agent'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'

type LinxPackageAction = 'install' | 'remove' | 'update' | 'list'

type LinxPackageCommandOptions = {
  source?: string
  local?: boolean
}

type LinxConfiguredPackage = {
  scope?: string
  source: string
  filtered?: boolean
  installedPath?: string
}

type LinxPackageManagerLike = {
  installAndPersist(source: string, options: { local: boolean }): Promise<unknown>
  removeAndPersist(source: string, options: { local: boolean }): Promise<boolean>
  update(source?: string): Promise<unknown>
  listConfiguredPackages(): LinxConfiguredPackage[]
  setProgressCallback(callback: (event: { type?: string; message?: string }) => void): void
}

export const linxInstallPackageCommand: CommandModule<object, LinxPackageCommandOptions> = {
  command: 'install [source]',
  describe: 'Install a LinX package or extension',
  builder(command) {
    return command
      .positional('source', { type: 'string', describe: 'Package source to install' })
      .option('local', { alias: 'l', type: 'boolean', default: false, describe: 'Install project-locally (.pi/settings.json)' }) as Argv<LinxPackageCommandOptions>
  },
  async handler(argv) {
    await runLinxPackageCommand('install', {
      source: typeof argv.source === 'string' ? argv.source : undefined,
      local: Boolean(argv.local),
    })
  },
}

export const linxRemovePackageCommand: CommandModule<object, LinxPackageCommandOptions> = {
  command: 'remove [source]',
  describe: 'Remove a LinX package or extension',
  builder(command) {
    return command
      .positional('source', { type: 'string', describe: 'Package source to remove' })
      .option('local', { alias: 'l', type: 'boolean', default: false, describe: 'Remove from project settings (.pi/settings.json)' }) as Argv<LinxPackageCommandOptions>
  },
  async handler(argv) {
    await runLinxPackageCommand('remove', {
      source: typeof argv.source === 'string' ? argv.source : undefined,
      local: Boolean(argv.local),
    })
  },
}

export const linxUpdatePackageCommand: CommandModule<object, LinxPackageCommandOptions> = {
  command: 'update [source]',
  describe: 'Update installed LinX packages',
  builder(command) {
    return command.positional('source', { type: 'string', describe: 'Package source to update' }) as Argv<LinxPackageCommandOptions>
  },
  async handler(argv) {
    await runLinxPackageCommand('update', {
      source: typeof argv.source === 'string' ? argv.source : undefined,
    })
  },
}

export const linxListPackageCommand: CommandModule<object, object> = {
  command: 'list',
  describe: 'List installed LinX packages',
  builder(command) {
    return command
  },
  async handler() {
    await runLinxPackageCommand('list')
  },
}

async function runLinxPackageCommand(action: LinxPackageAction, options: LinxPackageCommandOptions = {}): Promise<void> {
  if ((action === 'install' || action === 'remove') && !options.source) {
    throw new Error(`Missing ${action} source. Usage: linx ${action} <source> [-l]`)
  }

  const packageManager = createLinxPackageManager(process.cwd())
  packageManager.setProgressCallback((event) => {
    if (event.type === 'start' && event.message) {
      process.stdout.write(`${event.message}\n`)
    }
  })

  switch (action) {
    case 'install':
      await packageManager.installAndPersist(options.source!, { local: Boolean(options.local) })
      process.stdout.write(`Installed ${options.source}\n`)
      return
    case 'remove': {
      const removed = await packageManager.removeAndPersist(options.source!, { local: Boolean(options.local) })
      if (!removed) {
        throw new Error(`No matching package found for ${options.source}`)
      }
      process.stdout.write(`Removed ${options.source}\n`)
      return
    }
    case 'update':
      await packageManager.update(options.source)
      process.stdout.write(options.source ? `Updated ${options.source}\n` : 'Updated packages\n')
      return
    case 'list':
      printConfiguredLinxPackages(packageManager)
      return
  }
}

function createLinxPackageManager(cwd: string): LinxPackageManagerLike {
  const settingsManager = SettingsManager.create(cwd, LINX_AGENT_DIR)
  return new DefaultPackageManager({
    cwd,
    agentDir: LINX_AGENT_DIR,
    settingsManager,
  })
}

function printConfiguredLinxPackages(packageManager: Pick<LinxPackageManagerLike, 'listConfiguredPackages'>): void {
  const configuredPackages = packageManager.listConfiguredPackages()
  if (configuredPackages.length === 0) {
    process.stdout.write('No packages installed.\n')
    return
  }

  printConfiguredPackageGroup('User packages', configuredPackages.filter((pkg) => pkg.scope === 'user'))
  printConfiguredPackageGroup('Project packages', configuredPackages.filter((pkg) => pkg.scope === 'project'))
}

function printConfiguredPackageGroup(title: string, packages: LinxConfiguredPackage[]): void {
  if (packages.length === 0) {
    return
  }

  process.stdout.write(`${title}:\n`)
  for (const pkg of packages) {
    const display = pkg.filtered ? `${pkg.source} (filtered)` : pkg.source
    process.stdout.write(`  ${display}\n`)
    if (pkg.installedPath) {
      process.stdout.write(`    ${pkg.installedPath}\n`)
    }
  }
}
