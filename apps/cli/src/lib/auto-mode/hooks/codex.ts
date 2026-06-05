import { createAcpAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeBackendHook } from '../types.js'
import { resolveCodexAcpCommand } from './shared.js'

function encodeCodexConfigValue(value: string): string {
  return JSON.stringify(value)
}

function isNonCodexProviderModel(model: string): boolean {
  return /(?:deepseek|claude|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model)
}

function buildCodexArgs(passthroughArgs: string[], commandEnv?: Record<string, string>, model?: string): string[] {
  const baseUrl = commandEnv?.CODEX_BASE_URL?.trim()
  const normalizedModel = model?.trim()
  if (normalizedModel && isNonCodexProviderModel(normalizedModel)) {
    throw new Error(`codex backend cannot run model ${normalizedModel}. Use claude/cc or linx for provider-routed models.`)
  }

  return [
    ...(baseUrl ? [
      '-c',
      `openai_base_url=${encodeCodexConfigValue(baseUrl)}`,
    ] : []),
    ...(normalizedModel ? [
      '-c',
      `model=${encodeCodexConfigValue(normalizedModel)}`,
    ] : []),
    ...passthroughArgs,
  ]
}

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
      args: buildCodexArgs(options.passthroughArgs, options.commandEnv, options.model),
    }
  },
}
