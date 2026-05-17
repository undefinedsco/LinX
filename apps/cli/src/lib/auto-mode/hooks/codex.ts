import { createAcpAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeBackendHook } from '../types.js'
import { resolveCodexAcpCommand } from './shared.js'

function encodeCodexConfigValue(value: string): string {
  return JSON.stringify(value)
}

function buildCodexArgs(passthroughArgs: string[], commandEnv?: Record<string, string>): string[] {
  const baseUrl = commandEnv?.CODEX_BASE_URL?.trim()
  if (!baseUrl) {
    return [...passthroughArgs]
  }

  return [
    '-c',
    `openai_base_url=${encodeCodexConfigValue(baseUrl)}`,
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
      args: buildCodexArgs(options.passthroughArgs, options.commandEnv),
    }
  },
}
