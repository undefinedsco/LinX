import {
  DEFAULT_AGENT_PROVIDERS,
  getBuiltinProvider,
} from '@undefineds.co/models'

type AgentProvider = (typeof DEFAULT_AGENT_PROVIDERS)[number]

export const LINX_PLATFORM_PROVIDER_ID = 'undefineds'
export const LINX_PLATFORM_MODEL_IDS = ['linx-lite', 'linx'] as const
export const DEFAULT_LINX_PLATFORM_MODEL_ID = 'linx-lite'

const LINX_PLATFORM_PROVIDER: AgentProvider = {
  slug: LINX_PLATFORM_PROVIDER_ID,
  displayName: 'LinX Platform',
  homepage: 'https://undefineds.co/linx',
  logoUrl: '/linx-logo.png',
  models: [
    { id: 'linx-lite', displayName: 'LinX Lite' },
    { id: 'linx', displayName: 'LinX' },
  ],
}

export function normalizeChatModelId(modelId: string): string {
  const normalizedModelId = modelId.trim()
  if (!normalizedModelId) {
    return ''
  }

  const legacyPlatformPrefix = `${LINX_PLATFORM_PROVIDER_ID}/`
  if (normalizedModelId.startsWith(legacyPlatformPrefix)) {
    const candidate = normalizedModelId.slice(legacyPlatformPrefix.length)
    if ((LINX_PLATFORM_MODEL_IDS as readonly string[]).includes(candidate)) {
      return candidate
    }
  }

  return normalizedModelId
}

function mergeProviders(providers: AgentProvider[]): AgentProvider[] {
  const bySlug = new Map<string, AgentProvider>()

  for (const provider of providers) {
    const existing = bySlug.get(provider.slug)
    if (!existing) {
      bySlug.set(provider.slug, {
        ...provider,
        models: provider.models.map((model) => ({
          ...model,
          id: normalizeChatModelId(model.id),
        })),
      })
      continue
    }

    const mergedModels = [...existing.models]
    const seenIds = new Set(existing.models.map((model) => normalizeChatModelId(model.id)))
    for (const model of provider.models) {
      const normalizedModelId = normalizeChatModelId(model.id)
      if (seenIds.has(normalizedModelId)) {
        continue
      }
      seenIds.add(normalizedModelId)
      mergedModels.push({
        ...model,
        id: normalizedModelId,
      })
    }

    bySlug.set(provider.slug, {
      ...existing,
      ...provider,
      models: mergedModels,
    })
  }

  return Array.from(bySlug.values())
}

export const CHAT_AGENT_PROVIDERS: AgentProvider[] = mergeProviders([
  ...DEFAULT_AGENT_PROVIDERS,
  LINX_PLATFORM_PROVIDER,
])

export function findAgentProviderForModel(modelId: string): string | null {
  const normalizedModelId = normalizeChatModelId(modelId)
  if (!normalizedModelId) {
    return null
  }

  const provider = CHAT_AGENT_PROVIDERS.find((candidate) =>
    candidate.models.some((model) => normalizeChatModelId(model.id) === normalizedModelId),
  )
  return provider?.slug ?? null
}

export function getAgentProviderInfo(providerSlug: string) {
  return (
    CHAT_AGENT_PROVIDERS.find((provider) => provider.slug === providerSlug)
    ?? getBuiltinProvider(providerSlug)
    ?? null
  )
}
