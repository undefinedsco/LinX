import type { DiscoveryRegistry, ModelCapability, ModelMetadata } from './types'

export interface VercelModelPricing {
  input?: string
  output?: string
}

export interface VercelModelEntry {
  id: string
  name?: string
  description?: string
  owned_by?: string
  context_window?: number
  max_tokens?: number
  type?: string
  tags?: string[]
  pricing?: VercelModelPricing
}

export interface VercelModelCatalogResponse {
  object?: string
  data?: VercelModelEntry[]
}

export const VERCEL_OWNER_PROVIDER_MAP: Record<string, string> = {
  alibaba: 'qwen',
  anthropic: 'anthropic',
  deepseek: 'deepseek',
  google: 'google',
  minimax: 'minimax',
  mistral: 'mistral',
  moonshotai: 'moonshot',
  openai: 'openai',
  togetherai: 'together',
  xai: 'x-ai',
  zai: 'zhipu',
}

const DEFAULT_SYNCED_MODEL_TYPES = new Set(['language'])

function toNumber(value?: string): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeCapabilities(entry: VercelModelEntry): ModelCapability[] {
  const capabilities = new Set<ModelCapability>()
  const tags = new Set(entry.tags ?? [])

  if (entry.type === 'language') {
    capabilities.add('chat')
  }
  if (tags.has('vision') || tags.has('file-input')) {
    capabilities.add('vision')
  }
  if (tags.has('tool-use')) {
    capabilities.add('function-calling')
  }
  if (entry.type === 'language') {
    capabilities.add('streaming')
  }

  return Array.from(capabilities)
}

function compareModels(left: ModelMetadata, right: ModelMetadata): number {
  if (left.provider !== right.provider) {
    return left.provider.localeCompare(right.provider)
  }
  if (Boolean(left.isDefault) !== Boolean(right.isDefault)) {
    return left.isDefault ? -1 : 1
  }
  return left.id.localeCompare(right.id)
}

export function mapVercelOwnerToProviderId(owner?: string | null): string {
  if (!owner) return ''
  return VERCEL_OWNER_PROVIDER_MAP[owner] ?? ''
}

export function normalizeVercelModelEntry(
  entry: VercelModelEntry,
  defaultModelIds: Readonly<Record<string, string>> = {},
): ModelMetadata | null {
  const provider = mapVercelOwnerToProviderId(entry.owned_by)
  if (!provider) return null
  if (!entry.id || !DEFAULT_SYNCED_MODEL_TYPES.has(String(entry.type ?? 'language'))) {
    return null
  }

  return {
    id: entry.id,
    provider,
    displayName: entry.name || entry.id,
    description: entry.description,
    contextLength: typeof entry.context_window === 'number' ? entry.context_window : undefined,
    maxOutputTokens: typeof entry.max_tokens === 'number' ? entry.max_tokens : undefined,
    capabilities: normalizeCapabilities(entry),
    pricing: {
      input: toNumber(entry.pricing?.input) ?? 0,
      output: toNumber(entry.pricing?.output) ?? 0,
    },
    isDefault: defaultModelIds[provider] === entry.id || undefined,
  }
}

export function mergeVercelModelsIntoDiscovery(
  currentModels: readonly ModelMetadata[],
  upstreamModels: readonly VercelModelEntry[],
  defaultModelIds: Readonly<Record<string, string>> = {},
): ModelMetadata[] {
  const syncedProviderIds = new Set(
    upstreamModels
      .map((entry) => mapVercelOwnerToProviderId(entry.owned_by))
      .filter(Boolean),
  )

  const preservedModels = currentModels.filter((model) => !syncedProviderIds.has(model.provider))
  const normalizedModels = upstreamModels
    .map((entry) => normalizeVercelModelEntry(entry, defaultModelIds))
    .filter((model): model is ModelMetadata => Boolean(model))

  const deduped = new Map<string, ModelMetadata>()
  for (const model of [...preservedModels, ...normalizedModels]) {
    deduped.set(`${model.provider}:${model.id}`, model)
  }

  return Array.from(deduped.values()).sort(compareModels)
}

export function updateDiscoveryModelRegistry(
  currentRegistry: DiscoveryRegistry,
  upstreamCatalog: VercelModelCatalogResponse,
  updatedAt: string,
  defaultModelIds: Readonly<Record<string, string>> = {},
): DiscoveryRegistry {
  const upstreamModels = Array.isArray(upstreamCatalog.data) ? upstreamCatalog.data : []

  return {
    ...currentRegistry,
    updatedAt,
    models: mergeVercelModelsIntoDiscovery(currentRegistry.models ?? [], upstreamModels, defaultModelIds),
  }
}
