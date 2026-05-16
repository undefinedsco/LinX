import { createAcpAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeBackendHook } from '../types.js'

export const codebuddyHook: AutoModeBackendHook = {
  id: 'codebuddy',
  endpoint: linxRuntimeEndpointForBackend('codebuddy'),
  label: 'CodeBuddy Code',
  description: 'Use local codebuddy ACP transport for persistent multi-turn auto-mode sessions.',
  capabilities: createAcpAgentCapabilities({
    hasThinking: true,
  }),
  buildSpawnPlan(options) {
    return {
      command: 'codebuddy',
      args: [
        '--acp',
        '--acp-transport',
        'stdio',
        ...(options.model ? ['--model', options.model] : []),
        ...options.passthroughArgs,
      ],
    }
  },
}
