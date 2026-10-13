export type AgentAiRuntimeLocation = 'client' | 'server'

export const DEFAULT_AGENT_AI_RUNTIME_LOCATION: AgentAiRuntimeLocation = 'client'

export function normalizeAgentAiRuntimeLocation(value: unknown): AgentAiRuntimeLocation {
  return value === 'server' ? 'server' : DEFAULT_AGENT_AI_RUNTIME_LOCATION
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readAgentAiRuntimeLocation(metadata: unknown): AgentAiRuntimeLocation {
  if (!isRecord(metadata)) {
    return DEFAULT_AGENT_AI_RUNTIME_LOCATION
  }

  const linx = metadata.linx
  if (!isRecord(linx)) {
    return DEFAULT_AGENT_AI_RUNTIME_LOCATION
  }

  return normalizeAgentAiRuntimeLocation(linx.aiRuntimeLocation)
}

export function writeAgentAiRuntimeLocationMetadata(
  metadata: unknown,
  runtimeLocation: AgentAiRuntimeLocation,
): Record<string, unknown> {
  const base = isRecord(metadata) ? { ...metadata } : {}
  const currentLinx = isRecord(base.linx) ? base.linx : {}

  return {
    ...base,
    linx: {
      ...currentLinx,
      aiRuntimeLocation: normalizeAgentAiRuntimeLocation(runtimeLocation),
    },
  }
}

export function describeAgentWorkspaceAccess(runtimeLocation: AgentAiRuntimeLocation): string {
  if (runtimeLocation === 'server') {
    return '在你的空间服务上运行：关掉这台设备也能继续。'
  }

  return '在这台设备上运行：设备关掉时会暂停，读写你的空间仍按你的授权来。'
}
