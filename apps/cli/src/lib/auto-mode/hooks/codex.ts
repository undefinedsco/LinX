import { createAcpAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeBackendHook } from '../types.js'
import { resolveCodexAcpCommand } from './shared.js'

export const codexHook: AutoModeBackendHook = {
  id: 'codex',
  endpoint: linxRuntimeEndpointForBackend('codex'),
  label: 'Codex',
  description: 'Use local codex-acp runtime; Codex does the work while LinX owns auth, storage, and approval control.',
  capabilities: createAcpAgentCapabilities({
    hasThinking: true,
  }),
  buildSpawnPlan(options) {
    return {
      command: options.commandOverride ?? resolveCodexAcpCommand(),
      args: [...options.passthroughArgs],
    }
  },
}
