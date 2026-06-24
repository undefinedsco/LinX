import { getAIConfigProviderCatalog } from './models.js'
import { installLinxInteractiveAutocompleteCommands } from './linx-interactive-autocomplete-host.js'

export function installSymphonyAutocomplete(interactive: any): void {
  installLinxCommandAutocomplete(interactive)
}

export function installLinxCommandAutocomplete(interactive: any): void {
  installLinxInteractiveAutocompleteCommands(
    interactive,
    LINX_INTERACTIVE_SLASH_COMMANDS,
    getAutocompleteCommandName,
  )
}

const LINX_INTERACTIVE_SLASH_COMMANDS = [
  {
    name: 'auto',
    argumentHint: 'on|off|status',
    description: 'toggle AI Secretary driving for this session',
    getArgumentCompletions: (prefix: string) => completeStaticArguments(prefix, [
      { value: 'on', description: 'Secretary drives the session and asks when blocked' },
      { value: 'off', description: 'User drives the session directly' },
      { value: 'status', description: 'Show whether Secretary driving is enabled' },
    ]),
  },
  {
    name: 'cd',
    argumentHint: '<dir>',
    description: 'change workspace for this LinX session',
  },
  {
    name: 'goal',
    argumentHint: '<peer-command>',
    description: 'send a goal command to the current chat peer',
  },
  {
    name: 'rewind',
    description: 'select a user message and rewind the active branch before it',
  },
  {
    name: 'statusline',
    argumentHint: 'set|colors|tokens|reset',
    description: 'configure which items appear in the status line',
    getArgumentCompletions: (prefix: string) => completeStaticArguments(prefix, [
      { value: 'set', description: 'Set status line tokens' },
      { value: 'colors', description: 'Enable or disable status line colors' },
      { value: 'tokens', description: 'List available status line tokens' },
      { value: 'reset', description: 'Restore default status line tokens' },
    ]),
  },
  {
    name: 'update',
    description: 'check for a LinX CLI update and install from the TUI',
  },
  {
    name: 'ai',
    argumentHint: 'connect <provider>',
    description: 'connect AI provider credentials to LinX Pod settings',
    getArgumentCompletions: completeAiArguments,
  },
  {
    name: 'symphony',
    argumentHint: 'on|off|status',
    description: 'turn Secretary task handoff on/off, or show status',
    getArgumentCompletions: (prefix: string) => completeStaticArguments(prefix, [
      { value: 'on', description: 'Secretary can plan and hand off larger tasks' },
      { value: 'off', description: 'Return to direct chat' },
      { value: 'status', description: 'Show whether Symphony task handoff is enabled' },
    ]),
  },
] as const

function completeStaticArguments(prefix: string, options: Array<{ value: string; description: string }>): Array<{ value: string; label: string; description: string }> | null {
  const normalized = prefix.trimStart().toLowerCase()
  const matches = options.filter((option) => option.value.startsWith(normalized))
  if (matches.length === 0) {
    return null
  }
  return matches.map((option) => ({
    value: option.value,
    label: option.value,
    description: option.description,
  }))
}

function completeAiArguments(prefix: string): Array<{ value: string; label: string; description: string }> | null {
  const input = prefix.trimStart().toLowerCase()
  if (!input || 'connect'.startsWith(input)) {
    return [{
      value: 'connect ',
      label: 'connect',
      description: 'Connect an AI provider key to LinX Pod AI settings',
    }]
  }

  const connectPrefix = 'connect '
  if (!input.startsWith(connectPrefix)) {
    return null
  }

  const providerPrefix = input.slice(connectPrefix.length)
  const providers = getAiConnectCompletionProviders()
  const matches = providers.filter((provider) => provider.startsWith(providerPrefix))
  if (matches.length === 0) {
    return null
  }

  return matches.map((provider) => ({
    value: `connect ${provider}`,
    label: provider,
    description: `Connect ${provider} credentials`,
  }))
}

function getAiConnectCompletionProviders(): string[] {
  const providerIds: string[] = []
  const aliases: string[] = []
  for (const entry of getAIConfigProviderCatalog()) {
    providerIds.push(entry.id)
    aliases.push(...(entry.aliases ?? []))
  }
  return Array.from(new Set([...providerIds, ...aliases]))
}

function getAutocompleteCommandName(command: unknown): string | undefined {
  if (!command || typeof command !== 'object') {
    return undefined
  }
  const value = 'name' in command
    ? (command as { name?: unknown }).name
    : 'value' in command
      ? (command as { value?: unknown }).value
      : undefined
  return typeof value === 'string' ? value : undefined
}
