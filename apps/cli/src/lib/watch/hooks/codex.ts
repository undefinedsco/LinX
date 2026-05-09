import { createAcpAgentCapabilities } from '@linx/agent-runtime'
import type { WatchBackendHook } from '../types.js'
import { resolveCodexAcpCommand } from './shared.js'

export const codexHook: WatchBackendHook = {
  id: 'codex',
  label: 'Codex',
  description: 'Use LinX watch TUI over local codex-acp runtime (Codex does the work; LinX owns the shell/control-plane integration).',
  capabilities: createAcpAgentCapabilities({
    hasThinking: true,
  }),
  buildSpawnPlan(options) {
    return {
      command: resolveCodexAcpCommand(),
      args: [...options.passthroughArgs],
    }
  },
}
