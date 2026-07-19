import { CHAT_AGENT_PROVIDERS, LINX_PLATFORM_PROVIDER_ID, getAgentProviderInfo } from '@/lib/agent-providers'
import type { ModelCapability, ModelOption } from '@/components/ui/model-selector'
import type { AIProvider } from '@/modules/model-services/types'

export type ModelProviderOption = {
  id: string
  name: string
}

const supportedModelCapabilities: ModelCapability[] = [
  'vision',
  'function_calling',
  'web_search',
  'reasoning',
  'embedding',
  'rerank',
  'free',
]

export function normalizeCapabilities(value: unknown): ModelCapability[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ModelCapability =>
    typeof item === 'string' && supportedModelCapabilities.includes(item as ModelCapability),
  )
}

export function buildChatModelOptions(modelServiceProviders: Record<string, AIProvider>): ModelOption[] {
  const rows = new Map<string, ModelOption>()

  for (const provider of CHAT_AGENT_PROVIDERS.filter((item) => item.slug === LINX_PLATFORM_PROVIDER_ID)) {
    for (const model of provider.models) {
      rows.set(`${provider.slug}:${model.id}`, {
        id: model.id,
        name: model.displayName,
        providerId: provider.slug,
        providerName: provider.displayName,
        capabilities: [],
      })
    }
  }

  for (const provider of Object.values(modelServiceProviders)) {
    if (provider.enabled === false) continue
    for (const model of provider.models ?? []) {
      if (model.enabled === false) continue
      const modelDescription = (model as { description?: unknown }).description
      rows.set(`${provider.id}:${model.id}`, {
        id: model.id,
        name: model.name || model.id,
        providerId: provider.id,
        providerName: provider.name || provider.id,
        capabilities: normalizeCapabilities(model.capabilities),
        description: typeof modelDescription === 'string' ? modelDescription : undefined,
      })
    }
  }

  return Array.from(rows.values())
}

export function buildModelProviderOptions(
  modelServiceProviders: Record<string, AIProvider>,
  currentProvider?: string,
): ModelProviderOption[] {
  const rows = new Map<string, ModelProviderOption>()

  for (const provider of CHAT_AGENT_PROVIDERS.filter((item) => item.slug === LINX_PLATFORM_PROVIDER_ID)) {
    rows.set(provider.slug, { id: provider.slug, name: provider.displayName })
  }

  for (const provider of Object.values(modelServiceProviders)) {
    if (provider.enabled === false) continue
    rows.set(provider.id, { id: provider.id, name: provider.name || provider.id })
  }

  if (currentProvider && !rows.has(currentProvider)) {
    const info = getAgentProviderInfo(currentProvider)
    rows.set(currentProvider, { id: currentProvider, name: info?.displayName || currentProvider })
  }

  return Array.from(rows.values())
}

export function selectModelForProvider(
  providerId: string,
  modelServiceProviders: Record<string, AIProvider>,
  modelOptions: ModelOption[],
): string {
  const configuredProvider = modelServiceProviders[providerId]
  const selectedModelId = configuredProvider?.selectedModelId
  if (selectedModelId && modelOptions.some((model) => model.providerId === providerId && model.id === selectedModelId)) {
    return selectedModelId
  }

  return modelOptions.find((model) => model.providerId === providerId)?.id || ''
}

export function resolveDefaultChatModelSelection(
  modelServiceProviders: Record<string, AIProvider>,
  modelOptions: ModelOption[],
): { provider: string; model: string } {
  const configuredProviders = Object.values(modelServiceProviders)
  const candidates = configuredProviders.filter((provider) => provider.enabled !== false)

  for (const provider of candidates) {
    const model = selectModelForProvider(provider.id, modelServiceProviders, modelOptions)
    if (model) {
      return { provider: provider.id, model }
    }
  }

  const fallbackProvider = modelOptions.some((option) => option.providerId === LINX_PLATFORM_PROVIDER_ID)
    ? LINX_PLATFORM_PROVIDER_ID
    : modelOptions[0]?.providerId ?? LINX_PLATFORM_PROVIDER_ID
  return {
    provider: fallbackProvider,
    model: selectModelForProvider(fallbackProvider, modelServiceProviders, modelOptions) || modelOptions[0]?.id || 'linx-lite',
  }
}

export function isBuiltinChatModelSelection(providerId: string, modelId: string): boolean {
  return CHAT_AGENT_PROVIDERS.some((provider) =>
    provider.slug === providerId
    && provider.models.some((model) => model.id === modelId),
  )
}

export function findProviderForModel(
  modelOptions: ModelOption[],
  modelId: string,
  preferredProvider?: string,
): string | null {
  return (
    modelOptions.find((model) => model.id === modelId && model.providerId === preferredProvider)?.providerId
    || modelOptions.find((model) => model.id === modelId)?.providerId
    || null
  )
}
