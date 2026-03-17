import type { WatchBackendHook, WatchRunOptions } from '../types.js'
import { extractSessionIdFromJsonLine, parseJsonProtocolLine } from './shared.js'

function codebuddyModeArgs(mode: WatchRunOptions['mode']): string[] {
  if (mode === 'manual') {
    return ['--permission-mode', 'default']
  }

  if (mode === 'smart') {
    return ['--permission-mode', 'acceptEdits']
  }

  return ['--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions']
}

export const codebuddyHook: WatchBackendHook = {
  id: 'codebuddy',
  label: 'CodeBuddy Code',
  description: 'Use local codebuddy print/stream-json turns with backend-native session resume.',
  sessionKind: 'per-turn-cli',
  buildSpawnPlan(options) {
    return {
      command: 'codebuddy',
      args: buildCodebuddyArgs(options),
    }
  },
  buildTurnPlan(options, turn) {
    const args = buildCodebuddyArgs(options)
    if (turn.backendSessionId) {
      args.push('--resume', turn.backendSessionId)
    }
    args.push(turn.prompt)

    return {
      command: 'codebuddy',
      args,
    }
  },
  extractSessionId(line) {
    return extractSessionIdFromJsonLine(line)
  },
  parseLine(line) {
    return parseJsonProtocolLine(line)
  },
}

function buildCodebuddyArgs(options: WatchRunOptions): string[] {
  const args = [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    ...codebuddyModeArgs(options.mode),
  ]

  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.passthroughArgs.length > 0) {
    args.push(...options.passthroughArgs)
  }

  return args
}
