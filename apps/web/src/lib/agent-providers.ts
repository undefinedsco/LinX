import {
  DEFAULT_AGENT_PROVIDERS,
  getBuiltinProvider,
} from '@undefineds.co/models'

type AgentProvider = (typeof DEFAULT_AGENT_PROVIDERS)[number]

const LINX_CLOUD_PROVIDER: AgentProvider = {
  slug: 'undefineds',
  displayName: 'Undefineds Cloud',
  homepage: 'https://undefineds.co',
  logoUrl: '/linx-logo.png',
  models: [
    { id: 'undefineds/linx-lite', displayName: 'LinX Lite' },
    { id: 'undefineds/linx', displayName: 'LinX' },
  ],
}

function mergeProviders(providers: AgentProvider[]): AgentProvider[] {
  const bySlug = new Map<string, AgentProvider>()

  for (const provider of providers) {
    const existing = bySlug.get(provider.slug)
    if (!existing) {
      bySlug.set(provider.slug, {
        ...provider,
        models: [...provider.models],
      })
      continue
    }

    const mergedModels = [...existing.models]
    const seenIds = new Set(existing.models.map((model) => model.id))
    for (const model of provider.models) {
      if (seenIds.has(model.id)) {
        continue
      }
      seenIds.add(model.id)
      mergedModels.push(model)
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
  LINX_CLOUD_PROVIDER,
  ...DEFAULT_AGENT_PROVIDERS,
])

export function findAgentProviderForModel(modelId: string): string | null {
  const normalizedModelId = modelId.trim()
  if (!normalizedModelId) {
    return null
  }

  const provider = CHAT_AGENT_PROVIDERS.find((candidate) =>
    candidate.models.some((model) => model.id === normalizedModelId),
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
