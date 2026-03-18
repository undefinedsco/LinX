import type { WatchBackendHook } from '../types.js'

export const claudeHook: WatchBackendHook = {
  id: 'claude',
  label: 'Claude Code',
  description: 'Use local claude-code-acp transport for persistent multi-turn watch sessions.',
  buildSpawnPlan(options) {
    return {
      command: 'claude-code-acp',
      args: [...options.passthroughArgs],
    }
  },
}
