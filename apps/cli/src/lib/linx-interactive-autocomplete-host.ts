type LinxInteractiveAutocompleteProvider = {
  commands?: unknown[]
}

type LinxInteractiveAutocompleteTarget = {
  setupAutocompleteProvider?: (...args: unknown[]) => unknown
  setupAutocomplete?: (...args: unknown[]) => unknown
  autocompleteProvider?: LinxInteractiveAutocompleteProvider
}

const linxInteractiveAutocompleteInstalled = new WeakSet<object>()

export function installLinxInteractiveAutocompleteCommands(
  target: unknown,
  commands: readonly unknown[],
  getCommandName: (command: unknown) => string | undefined,
): void {
  if (!target || typeof target !== 'object' || linxInteractiveAutocompleteInstalled.has(target)) {
    return
  }

  const interactive = target as LinxInteractiveAutocompleteTarget
  const setupName = typeof interactive.setupAutocompleteProvider === 'function'
    ? 'setupAutocompleteProvider'
    : 'setupAutocomplete'
  const originalSetup = interactive[setupName]?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive[setupName] = function patchedLinxSetupAutocompleteProvider(this: LinxInteractiveAutocompleteTarget, ...args: unknown[]): unknown {
    const result = originalSetup(...args)
    installAutocompleteCommands(this.autocompleteProvider, commands, getCommandName)
    return result
  }

  linxInteractiveAutocompleteInstalled.add(target)
}

function installAutocompleteCommands(
  provider: LinxInteractiveAutocompleteProvider | undefined,
  commands: readonly unknown[],
  getCommandName: (command: unknown) => string | undefined,
): void {
  if (!Array.isArray(provider?.commands)) {
    return
  }

  for (const command of commands) {
    const name = getCommandName(command)
    if (!provider.commands.some((existing) => getCommandName(existing) === name)) {
      provider.commands.push(command)
    }
  }
}
