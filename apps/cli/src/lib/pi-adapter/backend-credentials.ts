import { connectAiProviderCredential } from '../ai-command.js'
import { loadPodBackendCredential, podCredentialMissingMessage, type PodBackedAutoModeCredential } from '../auto-mode/pod-ai.js'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'

type ProviderCredentialBackend = Exclude<AutoModeWorkerBackend, 'linx'>

export type BackendCredentialInput = {
  providerIdPrompt?: string
  apiKeyPrompt: string
  baseUrlPrompt?: string
  providerId: string
  providerLabel: string
  reason: BackendCredentialRepairReason
}

export interface BackendCredentialEntry {
  providerId?: string
  apiKey: string
  baseUrl?: string
}

export type BackendCredentialRepairReason = 'missing' | 'invalid'

export function backendCredentialInput(backend: ProviderCredentialBackend): BackendCredentialInput {
  if (backend === 'claude') {
    return {
      apiKeyPrompt: 'Anthropic API key',
      providerId: 'anthropic',
      providerLabel: 'Anthropic',
      reason: 'missing',
    }
  }

  if (backend === 'codex') {
    return {
      providerIdPrompt: 'Codex provider id',
      apiKeyPrompt: 'Codex provider API key',
      baseUrlPrompt: 'Codex-compatible API base URL',
      providerId: 'openai',
      providerLabel: 'Codex-compatible provider',
      reason: 'missing',
    }
  }

  return {
    apiKeyPrompt: 'CodeBuddy API key',
    providerId: 'codebuddy',
    providerLabel: 'CodeBuddy',
    reason: 'missing',
  }
}

export function backendCredentialInputForReason(
  backend: ProviderCredentialBackend,
  reason: BackendCredentialRepairReason,
): BackendCredentialInput {
  return {
    ...backendCredentialInput(backend),
    reason,
  }
}

export function isMissingBackendCredentialError(backend: ProviderCredentialBackend, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message === podCredentialMissingMessage(backend)
}

export interface PiBackendCredentialRuntime {
  loadPodBackendCredential: typeof loadPodBackendCredential
  connectAiProviderCredential: typeof connectAiProviderCredential
}

export const defaultPiBackendCredentialRuntime: PiBackendCredentialRuntime = {
  loadPodBackendCredential,
  connectAiProviderCredential,
}

export async function promptAndSavePiBackendCredential(
  backend: ProviderCredentialBackend,
  input: {
    promptCredential: (details: BackendCredentialInput) => Promise<BackendCredentialEntry | null | undefined>
    runtime?: PiBackendCredentialRuntime
    reason?: BackendCredentialRepairReason
  },
): Promise<PodBackedAutoModeCredential> {
  const runtime = input.runtime ?? defaultPiBackendCredentialRuntime
  const reason = input.reason ?? 'missing'
  const details = backendCredentialInputForReason(backend, reason)
  const entered = await input.promptCredential(details)
  const providerId = entered?.providerId?.trim() || details.providerId
  const apiKey = entered?.apiKey.trim()
  if (!providerId) {
    throw new Error(`${details.providerLabel} provider id is required to start ${backend}.`)
  }
  if (!apiKey) {
    throw new Error(`${details.providerLabel} API key is required to start ${backend}.`)
  }

  await runtime.connectAiProviderCredential({
    provider: providerId,
    apiKey,
    ...(entered?.baseUrl?.trim() ? { baseUrl: entered.baseUrl.trim() } : {}),
    ...(backend === 'codex' ? { supportsBackend: 'codex', rotationPolicy: 'round_robin' } : {}),
  })

  const saved = await runtime.loadPodBackendCredential(backend)
  if (!saved) {
    throw new Error(`Saved ${details.providerLabel} credential, but it was not readable from LinX Pod AI settings.`)
  }

  return saved
}

export async function loadOrPromptPiBackendCredential(
  backend: ProviderCredentialBackend,
  input: {
    promptCredential: (details: BackendCredentialInput) => Promise<BackendCredentialEntry | null | undefined>
    runtime?: PiBackendCredentialRuntime
  },
): Promise<PodBackedAutoModeCredential> {
  const runtime = input.runtime ?? defaultPiBackendCredentialRuntime
  const existing = await runtime.loadPodBackendCredential(backend)
  if (existing) {
    return existing
  }

  return promptAndSavePiBackendCredential(backend, {
    promptCredential: input.promptCredential,
    runtime,
    reason: 'missing',
  })
}
