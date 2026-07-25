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
    return '服务端 / xpod：空间在 server 侧按本地文件夹访问。'
  }

  return '客户端：通过 xpod CLI 访问空间，不把 Pod 当成本地目录。'
}
