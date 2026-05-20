import { createAcpAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeBackendHook } from '../types.js'

export const claudeHook: AutoModeBackendHook = {
  id: 'claude',
  endpoint: linxRuntimeEndpointForBackend('claude'),
  label: 'Claude Code',
  description: 'Use local claude-code-acp transport for persistent multi-turn auto-mode sessions.',
  capabilities: createAcpAgentCapabilities({
    hasThinking: true,
  }),
  buildSpawnPlan(options) {
    return {
      command: 'claude-code-acp',
      args: [...options.passthroughArgs],
    }
  },
}
