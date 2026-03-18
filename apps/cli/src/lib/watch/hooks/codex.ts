import type { WatchBackendHook } from '../types.js'

export const codexHook: WatchBackendHook = {
  id: 'codex',
  label: 'Codex',
  description: 'Use local codex-acp transport for persistent multi-turn watch sessions.',
  buildSpawnPlan(options) {
    return {
      command: 'codex-acp',
      args: [...options.passthroughArgs],
    }
  },
}
