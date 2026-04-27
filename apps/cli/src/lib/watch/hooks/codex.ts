import type { WatchBackendHook } from '../types.js'
import { resolveCodexAcpCommand } from './shared.js'

export const codexHook: WatchBackendHook = {
  id: 'codex',
  label: 'Codex',
  description: 'Use LinX watch TUI over local codex-acp runtime (Codex does the work; LinX owns the shell/control-plane integration).',
  buildSpawnPlan(options) {
    return {
      command: resolveCodexAcpCommand(),
      args: [...options.passthroughArgs],
    }
  },
}
