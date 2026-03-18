import type { WatchBackendHook } from '../types.js'

export const codebuddyHook: WatchBackendHook = {
  id: 'codebuddy',
  label: 'CodeBuddy Code',
  description: 'Use local codebuddy ACP transport for persistent multi-turn watch sessions.',
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
