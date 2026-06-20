import {
  resolveAutoModeCommandRoute,
  type AutoModeControlCommandRoute,
  type AutoModePeerCommandRoute,
} from '@linx/agent-runtime/auto-mode'

const BACKEND_OWNED_SLASH_COMMANDS = new Set([
  'commands',
  'models',
  'rollback',
  'status',
])

export type LinxShellCommand =
  | { action: 'auto'; route: AutoModeControlCommandRoute }
  | { action: 'peer-command'; route: AutoModePeerCommandRoute }
  | { action: 'cd'; target?: string }
  | { action: 'ai-connect'; provider?: string; baseUrl?: string; model?: string }
  | { action: 'statusline'; args: string[] }
  | { action: 'update' }
  | { action: 'rewind-select' }
  | { action: 'rewind-turns'; turns: number }

export function shouldRouteToBackendCommand(command: string): boolean {
  const input = command.trim()
  if (!input.startsWith('/')) {
    return false
  }

  const name = input.slice(1).split(/\s+/, 1)[0]?.toLowerCase()
  if (!name) {
    return false
  }

  return BACKEND_OWNED_SLASH_COMMANDS.has(name)
}

export function parseLinxShellCommand(input: string): LinxShellCommand | null {
  const command = input.trim()
  const autoModeRoute = resolveAutoModeCommandRoute(command)
  if (autoModeRoute?.kind === 'control-command') {
    return { action: 'auto', route: autoModeRoute }
  }
  if (autoModeRoute?.kind === 'peer-command') {
    return { action: 'peer-command', route: autoModeRoute }
  }

  if (command === '/cd') {
    return { action: 'cd' }
  }

  if (command.startsWith('/cd ')) {
    return { action: 'cd', target: command.slice('/cd'.length).trim() }
  }

  if (command === '/ai connect') {
    return { action: 'ai-connect' }
  }

  if (command.startsWith('/ai connect ')) {
    return { action: 'ai-connect', ...parseInteractiveAiConnectArgs(command.slice('/ai connect'.length).trim()) }
  }

  if (command === '/statusline' || command === '/status-line') {
    return { action: 'statusline', args: [] }
  }

  if (command.startsWith('/statusline ') || command.startsWith('/status-line ')) {
    const body = command.startsWith('/statusline ')
      ? command.slice('/statusline'.length).trim()
      : command.slice('/status-line'.length).trim()
    return { action: 'statusline', args: splitInteractiveCommandArgs(body) }
  }

  if (command === '/update' || command === '/upgrade') {
    return { action: 'update' }
  }

  if (command === '/rewind') {
    return { action: 'rewind-select' }
  }

  if (command.startsWith('/rewind ')) {
    const turns = parseRewindTurnCount(command.slice('/rewind'.length).trim())
    return { action: 'rewind-turns', turns: turns ?? 0 }
  }

  return null
}

function parseRewindTurnCount(input: string): number | null {
  if (!/^\d+$/.test(input)) {
    return null
  }
  const value = Number.parseInt(input, 10)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseInteractiveAiConnectArgs(input: string): Pick<Extract<LinxShellCommand, { action: 'ai-connect' }>, 'provider' | 'baseUrl' | 'model'> {
  const tokens = splitInteractiveCommandArgs(input)
  let provider: string | undefined
  let baseUrl: string | undefined
  let model: string | undefined

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) {
      continue
    }

    if (token === '--base-url') {
      baseUrl = tokens[index + 1]
      index += 1
      continue
    }
    if (token.startsWith('--base-url=')) {
      baseUrl = token.slice('--base-url='.length)
      continue
    }
    if (token === '--model') {
      model = tokens[index + 1]
      index += 1
      continue
    }
    if (token.startsWith('--model=')) {
      model = token.slice('--model='.length)
      continue
    }
    if (!token.startsWith('-') && !provider) {
      provider = token
    }
  }

  return {
    ...(provider?.trim() ? { provider: provider.trim() } : {}),
    ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
    ...(model?.trim() ? { model: model.trim() } : {}),
  }
}

function splitInteractiveCommandArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) {
    current += '\\'
  }
  if (current) {
    tokens.push(current)
  }

  return tokens
}
