import type { WatchBackendHook, WatchRunOptions } from '../types.js'
import { extractSessionIdFromJsonLine, parseJsonProtocolLine } from './shared.js'

function claudeModeArgs(mode: WatchRunOptions['mode']): string[] {
  if (mode === 'manual') {
    return ['--permission-mode', 'default']
  }

  if (mode === 'smart') {
    return ['--permission-mode', 'auto']
  }

  return ['--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions']
}

export const claudeHook: WatchBackendHook = {
  id: 'claude',
  label: 'Claude Code',
  description: 'Use local claude print/stream-json turns with backend-native session resume.',
  sessionKind: 'per-turn-cli',
  buildSpawnPlan(options) {
    return {
      command: 'claude',
      args: buildClaudeArgs(options),
    }
  },
  buildTurnPlan(options, turn) {
    const args = buildClaudeArgs(options)
    if (turn.backendSessionId) {
      args.push('--resume', turn.backendSessionId)
    }
    args.push(turn.prompt)

    return {
      command: 'claude',
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

function buildClaudeArgs(options: WatchRunOptions): string[] {
  const args = [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    ...claudeModeArgs(options.mode),
  ]

  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.passthroughArgs.length > 0) {
    args.push(...options.passthroughArgs)
  }

  return args
}
