import {
  resolveAgentRuntimeConfig,
  type AgentRuntimeBackendConfig,
  type AgentRuntimeConfig,
} from '@linx/agent-runtime'
import type { AutoModeSessionRecord } from '@linx/agent-runtime/auto-mode'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'

const DEFAULT_SECRETARY_RUNTIME_BACKEND: AgentRuntimeBackendConfig = {
  backend: 'linx',
  model: DEFAULT_LINX_CLOUD_MODEL_ID,
  credentialSource: 'cloud',
}

export function createSecretaryAgentRuntimeConfig(input: {
  systemPrompt: string
  metadata?: Record<string, unknown>
  overrides?: { model?: string; runtime?: Partial<AgentRuntimeBackendConfig> }
}): AgentRuntimeConfig {
  return resolveAgentRuntimeConfig(
    {
      agent: '__secretary__',
      role: 'secretary',
      model: DEFAULT_LINX_CLOUD_MODEL_ID,
      label: 'AI Secretary',
      runtime: DEFAULT_SECRETARY_RUNTIME_BACKEND,
      systemPrompt: input.systemPrompt,
      metadata: input.metadata,
    },
    input.overrides,
  )
}

export function resolveSecretaryRuntimeOverrides(record?: Partial<AutoModeSessionRecord>): {
  model?: string
  runtime?: Partial<AgentRuntimeBackendConfig>
} | undefined {
  const metadata = record?.metadata
  const candidates = [
    isRecord(metadata?.agentRuntime) ? metadata.agentRuntime : undefined,
    isRecord(metadata?.symphony) && isRecord(metadata.symphony.agentRuntime)
      ? metadata.symphony.agentRuntime
      : undefined,
  ]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    const runtime = normalizeAgentRuntimeBackendConfig(candidate)
    if (runtime) {
      return {
        ...(runtime.model ? { model: runtime.model } : {}),
        runtime,
      }
    }
  }
  return undefined
}

export function normalizeAgentRuntimeBackendConfig(value: Record<string, unknown>): Partial<AgentRuntimeBackendConfig> | undefined {
  const backend = normalizeString(value.backend)
  const model = normalizeString(value.model)
  const credentialSource = normalizeString(value.credentialSource)
  const runtime = normalizeString(value.runtime)
  const transport = normalizeString(value.transport)
  const endpoint = normalizeString(value.endpoint)
  const metadata = isRecord(value.metadata) ? { ...value.metadata } : undefined
  const resolved: Partial<AgentRuntimeBackendConfig> = {
    ...(backend ? { backend } : {}),
    ...(model ? { model } : {}),
    ...(credentialSource ? { credentialSource } : {}),
    ...(runtime ? { runtime } : {}),
    ...(transport ? { transport } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(metadata ? { metadata } : {}),
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
