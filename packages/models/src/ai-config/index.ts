import type { AIModelInsert, AIModelRow } from '../ai-model.schema.js'
import type { AIProviderInsert, AIProviderRow } from '../ai-provider.schema.js'
import type { CredentialInsert, CredentialRow } from '../credential.schema.js'

export interface AIConfigProviderCatalogEntry {
  id: string
  displayName: string
  defaultBaseUrl?: string
  defaultModels?: string[]
}

export interface AIConfigModel {
  id: string
  name: string
  enabled: boolean
  capabilities: string[]
  isCustom?: boolean
}

export interface AIConfigProviderState {
  id: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  models: AIConfigModel[]
  selectedModelId?: string
}

export interface AIConfigUpdate {
  enabled?: boolean
  apiKey?: string
  baseUrl?: string
  models?: AIConfigModel[]
}

export interface BuildAIConfigProviderStateMapOptions {
  catalog?: readonly AIConfigProviderCatalogEntry[]
  providerRows: Array<Partial<AIProviderRow> & Record<string, unknown>>
  credentialRows: Array<Partial<CredentialRow> & Record<string, unknown>>
  modelRows: Array<Partial<AIModelRow> & Record<string, unknown>>
  fallbackToCatalogModels?: boolean
}

export interface AIConfigMutationPlan {
  providerId: string
  providerPayload?: AIProviderInsert
  credentialPayload?: CredentialInsert
  modelUpserts: AIModelInsert[]
  modelDeleteIds: string[]
}

const AI_CONFIG_PROVIDER_CATALOG: readonly AIConfigProviderCatalogEntry[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
  },
  {
    id: 'google',
    displayName: 'Google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
  {
    id: 'x-ai',
    displayName: 'xAI',
    defaultBaseUrl: 'https://api.x.ai/v1',
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
  },
  {
    id: 'mistral',
    displayName: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
  },
  {
    id: 'groq',
    displayName: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'moonshot',
    displayName: 'Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
  },
  {
    id: 'zhipu',
    displayName: 'ZhiPu',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    defaultBaseUrl: 'https://api.codebuddy.ai/v1',
  },
]

const AI_CONFIG_PROVIDER_MAP = new Map(
  AI_CONFIG_PROVIDER_CATALOG.map((entry) => [entry.id, entry] as const),
)

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function titleizeProviderId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveCatalogEntry(id: string, catalog: readonly AIConfigProviderCatalogEntry[]): AIConfigProviderCatalogEntry | undefined {
  return catalog.find((entry) => entry.id === id)
}

function collectKnownProviderIds(catalog: readonly AIConfigProviderCatalogEntry[]): Set<string> {
  const ids = new Set<string>()
  for (const entry of catalog) {
    ids.add(entry.id)
  }
  return ids
}

function preferredSelectedModelId(models: AIConfigModel[]): string | undefined {
  return models.find((model) => model.enabled)?.id ?? models[0]?.id
}

function existingDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined
}

export function getAIConfigProviderCatalog(): readonly AIConfigProviderCatalogEntry[] {
  return AI_CONFIG_PROVIDER_CATALOG
}

export function getAIConfigProviderMetadata(providerId: string): AIConfigProviderCatalogEntry {
  const canonicalId = extractAIConfigProviderId(providerId)
  return AI_CONFIG_PROVIDER_MAP.get(canonicalId) ?? {
    id: canonicalId,
    displayName: titleizeProviderId(canonicalId),
  }
}

export function extractAIConfigResourceId(raw?: string | null): string {
  if (!raw) return ''
  if (raw.includes('#')) return raw.split('#').pop() || raw
  const clean = raw.replace(/\/$/, '')
  const tail = clean.split('/').pop() || clean
  return tail.endsWith('.ttl') ? tail.slice(0, -4) : tail
}

export function extractAIConfigProviderId(raw?: string | null): string {
  return normalizeText(extractAIConfigResourceId(raw))
}

export function sameAIConfigProviderId(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = extractAIConfigProviderId(left)
  const normalizedRight = extractAIConfigProviderId(right)
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight
}

export function getAIConfigDefaultBaseUrl(providerId: string): string | undefined {
  return getAIConfigProviderMetadata(providerId).defaultBaseUrl
}

export function getDefaultAIConfigCredentialId(providerId: string): string {
  return `${extractAIConfigProviderId(providerId)}-default`
}

export function aiConfigProviderUri(providerId: string): string {
  return `/settings/ai/providers.ttl#${extractAIConfigProviderId(providerId)}`
}

export function aiConfigModelUri(modelId: string): string {
  return `/settings/ai/models.ttl#${extractAIConfigResourceId(modelId)}`
}

export function buildAIConfigProviderStateMap(options: BuildAIConfigProviderStateMapOptions): Record<string, AIConfigProviderState> {
  const catalog = options.catalog ?? AI_CONFIG_PROVIDER_CATALOG
  const fallbackToCatalogModels = options.fallbackToCatalogModels ?? true
  const states: Record<string, AIConfigProviderState> = {}
  const knownIds = collectKnownProviderIds(catalog)

  const providerMap = new Map<string, Partial<AIProviderRow> & Record<string, unknown>>()
  for (const row of options.providerRows) {
    const providerId = typeof row.id === 'string' ? row.id : ''
    if (!providerId) continue
    const previous = providerMap.get(providerId) ?? {}
    providerMap.set(providerId, { ...previous, ...row })
  }

  const credentialMap = new Map<string, Partial<CredentialRow> & Record<string, unknown>>()
  for (const row of options.credentialRows) {
    const providerId = extractAIConfigProviderId(typeof row.provider === 'string' ? row.provider : '')
    if (!providerId) continue
    const previous = credentialMap.get(providerId) ?? {}
    credentialMap.set(providerId, { ...previous, ...row })
  }

  const modelMap = new Map<string, AIConfigModel[]>()
  for (const row of options.modelRows) {
    const providerId = extractAIConfigProviderId(typeof row.isProvidedBy === 'string' ? row.isProvidedBy : '')
    if (!providerId) continue

    const modelId = typeof row.id === 'string' ? row.id : ''
    if (!modelId) continue

    const list = modelMap.get(providerId) ?? []
    list.push({
      id: modelId,
      name: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : modelId,
      enabled: (typeof row.status === 'string' ? row.status : 'active') !== 'inactive',
      capabilities: [],
      isCustom: !(resolveCatalogEntry(providerId, catalog)?.defaultModels ?? []).includes(modelId),
    })
    modelMap.set(providerId, list)
  }

  const providerIds = new Set<string>()
  for (const entry of catalog) providerIds.add(entry.id)
  for (const providerId of providerMap.keys()) providerIds.add(providerId)
  for (const providerId of credentialMap.keys()) providerIds.add(providerId)
  for (const providerId of modelMap.keys()) providerIds.add(providerId)

  for (const providerId of providerIds) {
    if (!knownIds.has(providerId) && !providerMap.has(providerId) && !credentialMap.has(providerId) && !modelMap.has(providerId)) {
      continue
    }

    const metadata = resolveCatalogEntry(providerId, catalog) ?? getAIConfigProviderMetadata(providerId)
    const providerRow = providerMap.get(providerId)
    const credentialRow = credentialMap.get(providerId)
    const persistedModels = modelMap.get(providerId) ?? []
    const models = persistedModels.length > 0 || !fallbackToCatalogModels
      ? persistedModels
      : (metadata.defaultModels ?? []).map((modelId) => ({
          id: modelId,
          name: modelId,
          enabled: true,
          capabilities: [],
        }))

    const selectedModelId = extractAIConfigResourceId(
      typeof providerRow?.hasModel === 'string' ? providerRow.hasModel : '',
    ) || preferredSelectedModelId(models)

    states[providerId] = {
      id: providerId,
      enabled: (typeof credentialRow?.status === 'string' ? credentialRow.status : 'inactive') === 'active',
      apiKey: typeof credentialRow?.apiKey === 'string' ? credentialRow.apiKey : undefined,
      baseUrl:
        (typeof credentialRow?.baseUrl === 'string' && credentialRow.baseUrl) ||
        (typeof providerRow?.baseUrl === 'string' && providerRow.baseUrl) ||
        metadata.defaultBaseUrl,
      models,
      selectedModelId: selectedModelId || undefined,
    }
  }

  return states
}

export function buildAIConfigMutationPlan(input: {
  providerId: string
  currentProviderRows: Array<Partial<AIProviderRow> & Record<string, unknown>>
  currentCredentialRows: Array<Partial<CredentialRow> & Record<string, unknown>>
  currentModelRows: Array<Partial<AIModelRow> & Record<string, unknown>>
  updates: AIConfigUpdate
}): AIConfigMutationPlan {
  const providerId = extractAIConfigProviderId(input.providerId)
  const metadata = getAIConfigProviderMetadata(providerId)
  const existingProvider = input.currentProviderRows.find((row) => row.id === providerId)
  const existingCredential = input.currentCredentialRows.find((row) =>
    sameAIConfigProviderId(typeof row.provider === 'string' ? row.provider : '', providerId),
  )
  const existingModels = input.currentModelRows.filter((row) =>
    sameAIConfigProviderId(typeof row.isProvidedBy === 'string' ? row.isProvidedBy : '', providerId),
  )
  const hasConfigUpdate = input.updates.enabled !== undefined || input.updates.apiKey !== undefined || input.updates.baseUrl !== undefined

  let providerPayload: AIProviderInsert | undefined
  let credentialPayload: CredentialInsert | undefined
  const modelUpserts: AIModelInsert[] = []
  const modelDeleteIds: string[] = []

  if (hasConfigUpdate || input.updates.models !== undefined) {
    const selectedModelId = input.updates.models
      ? preferredSelectedModelId(input.updates.models)
      : extractAIConfigResourceId(typeof existingProvider?.hasModel === 'string' ? existingProvider.hasModel : '')

    providerPayload = {
      id: providerId,
      baseUrl:
        input.updates.baseUrl ??
        (typeof existingProvider?.baseUrl === 'string' ? existingProvider.baseUrl : undefined) ??
        metadata.defaultBaseUrl,
      proxyUrl: typeof existingProvider?.proxyUrl === 'string' ? existingProvider.proxyUrl : undefined,
      hasModel: selectedModelId ? aiConfigModelUri(selectedModelId) : undefined,
    }
  }

  if (hasConfigUpdate) {
    credentialPayload = {
      id:
        (typeof existingCredential?.id === 'string' ? existingCredential.id : '') ||
        getDefaultAIConfigCredentialId(providerId),
      provider: aiConfigProviderUri(providerId),
      service: typeof existingCredential?.service === 'string' && existingCredential.service ? existingCredential.service : 'ai',
      status:
        input.updates.enabled !== undefined
          ? input.updates.enabled
            ? 'active'
            : 'inactive'
          : typeof existingCredential?.status === 'string' && existingCredential.status
            ? existingCredential.status
            : 'active',
      apiKey:
        input.updates.apiKey ??
        (typeof existingCredential?.apiKey === 'string' ? existingCredential.apiKey : undefined),
      baseUrl:
        input.updates.baseUrl ??
        (typeof existingCredential?.baseUrl === 'string' ? existingCredential.baseUrl : undefined),
      label:
        typeof existingCredential?.label === 'string' && existingCredential.label
          ? existingCredential.label
          : `${metadata.displayName} Key`,
    }
  }

  if (input.updates.models !== undefined) {
    const existingById = new Map(
      existingModels.map((row) => [
        typeof row.id === 'string' ? row.id : '',
        row,
      ] as const),
    )
    const nextIds = new Set<string>()

    for (const model of input.updates.models) {
      const modelId = extractAIConfigResourceId(model.id)
      if (!modelId) continue
      nextIds.add(modelId)
      const existing = existingById.get(modelId)
      const now = new Date()
      modelUpserts.push({
        id: modelId,
        displayName: model.name || modelId,
        modelType: 'chat',
        isProvidedBy: aiConfigProviderUri(providerId),
        status: model.enabled ? 'active' : 'inactive',
        createdAt: existingDate(existing?.createdAt) ?? now,
        updatedAt: now,
      })
    }

    for (const modelId of existingById.keys()) {
      if (!nextIds.has(modelId)) {
        modelDeleteIds.push(modelId)
      }
    }
  }

  return {
    providerId,
    providerPayload,
    credentialPayload,
    modelUpserts,
    modelDeleteIds,
  }
}
