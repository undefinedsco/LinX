import { createAcpAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeBackendHook } from '../types.js'

function isProviderRoutedModel(model: string): boolean {
  return /(?:deepseek|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model)
}

export const claudeHook: AutoModeBackendHook = {
  id: 'claude',
  endpoint: linxRuntimeEndpointForBackend('claude'),
  label: 'Claude Code',
  description: 'Use local claude-code-acp transport for persistent multi-turn auto-mode sessions.',
  capabilities: createAcpAgentCapabilities({
    hasThinking: true,
    canSetModel: true,
  }),
  buildSpawnPlan(options) {
    const normalizedModel = options.model?.trim()
    if (normalizedModel && isProviderRoutedModel(normalizedModel)) {
      throw new Error(`claude backend cannot set provider-routed model ${normalizedModel}. Configure it behind a Claude Code alias such as opus, or omit the model.`)
    }

    return {
      command: options.commandOverride ?? 'claude-code-acp',
      args: [
        ...options.passthroughArgs,
      ],
    }
  },
}
