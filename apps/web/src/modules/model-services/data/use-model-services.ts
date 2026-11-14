import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type AiConnectionsClient,
  type AiConnectionsProvider,
  type AiGatewayModel,
  type AiProviderSummary,
  createAiConnectionsClient,
} from '@undefineds.co/ai-connections/client'
import type { AIProvider } from '../domain/types'
import { LINX_PLATFORM_PROVIDER_ID } from '@/lib/agent-providers'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'

const BUILTIN_PROVIDERS_HEADER = 'x-xpod-builtin-providers'

interface RawCatalogRows {
  providers: unknown[] | null
  models: unknown[] | null
  builtinHeader: string | null
}

/**
 * One client plus the raw rows only that client's fetch closure writes.
 * Nothing is shared across sessions/service origins, so a late response from a
 * previous login can never overwrite the current advertisement.
 */
interface CatalogLoad {
  client: AiConnectionsClient
  rawRows: RawCatalogRows
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read-only deployment built-ins from the authoritative server advertisement.
 *
 * Personal providers keep the published client's strict parsing; only rows the
 * server itself marks `builtin:true` + `readOnly:true` are projected, and only
 * when the response advertises them (header) — never a hardcoded "available".
 * They are mapped to the existing platform provider identity so inference keeps
 * using the platform runtime with bare `linx`/`linx-lite`, and they cannot be
 * edited or given credentials.
 */
export function projectDeploymentBuiltin(
  rows: RawCatalogRows,
  existing: Record<string, AIProvider>,
): AIProvider | null {
  const advertised = (rows.builtinHeader ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const providers = (rows.providers ?? []).filter(isRecord)
  const provider = providers.find((row) => (
    typeof row.id === 'string'
    && row.builtin === true
    && row.readOnly === true
    // The server's own state is authoritative: an unconfigured/disabled or
    // non-available row is not offered, and nothing is assumed when absent.
    && row.status === 'available'
    && row.enabled !== false
    && advertised.includes(row.id)
  ))
  if (!provider || typeof provider.id !== 'string') return null
  if (existing[LINX_PLATFORM_PROVIDER_ID]) return null

  const models = (rows.models ?? [])
    .filter(isRecord)
    .filter((row) => (row.owned_by === provider.id || row.provider === provider.id))
    .filter((row) => row.availability !== 'unavailable')
    .flatMap((row) => {
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      if (!id) return []
      const protocols = Array.isArray(row.protocols)
        ? row.protocols.filter((entry): entry is string => typeof entry === 'string')
        : []
      return [{
        id,
        name: (typeof row.display_name === 'string' && row.display_name) || id,
        enabled: true,
        capabilities: protocols,
        isCustom: false,
      }]
    })
  if (models.length === 0) return null

  return {
    id: LINX_PLATFORM_PROVIDER_ID,
    name: typeof provider.name === 'string' && provider.name.trim() ? provider.name.trim() : 'LinX',
    description: '由当前站点提供的内置模型服务，只读',
    enabled: true,
    models,
    defaultModels: models.map((model) => model.id),
    capabilities: [...new Set(models.flatMap((model) => model.capabilities))],
    builtin: true,
    readOnly: true,
  }
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  kimi: 'Kimi',
  bailian: '百炼',
  deepseek: 'DeepSeek',
}

export function useModelServices() {
  const { session } = useSession()
  const database = useSolidDatabase()
  const webId = session.info.webId
  const podBaseUrl = database.db ? resolveCurrentPodBaseUrl(database.db) : null
  // Capture the raw payloads of the client's own catalog GETs (the published
  // parser drops platform ids and unknown builtin providers). The state is
  // created per client and captured by that client's fetch closure: there is
  // no hook-wide mutable store, no extra request, no parallel client.
  const catalog = useMemo<CatalogLoad | null>(() => {
    if (database.status !== 'ready' || !webId || !podBaseUrl) return null
    const rawRows: RawCatalogRows = { providers: null, models: null, builtinHeader: null }
    const authenticatedFetch: typeof session.fetch = async (input, init) => {
      const response = await session.fetch(input, init)
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url
      try {
        const path = new URL(url).pathname
        if (path.endsWith('/api/ai/providers')) {
          const header = response.headers.get(BUILTIN_PROVIDERS_HEADER)
          const payload = await response.clone().json() as { data?: unknown }
          rawRows.builtinHeader = header
          rawRows.providers = Array.isArray(payload?.data) ? payload.data : null
        } else if (path.endsWith('/v1/models')) {
          const payload = await response.clone().json() as { data?: unknown }
          rawRows.models = Array.isArray(payload?.data) ? payload.data : null
        }
      } catch {
        // A non-JSON/opaque response is not a catalog advertisement.
      }
      return response
    }
    return {
      client: createAiConnectionsClient({ webId, podBaseUrl, authenticatedFetch }),
      rawRows,
    }
  }, [database.status, podBaseUrl, session.fetch, webId])

  const query = useQuery({
    // A new client instance (login/service switch, even for the same account)
    // gets its own query; cached data of a previous client is never reused.
    queryKey: [
      'xpod-ai-model-catalog',
      catalog?.client.webId,
      catalog?.client.apiBase,
      session.info.sessionId ?? '',
    ],
    enabled: Boolean(catalog),
    staleTime: 30_000,
    queryFn: async () => {
      if (!catalog) return { providers: [], models: [] }
      const [providers, models] = await Promise.all([
        catalog.client.listProviders(),
        catalog.client.listModels(),
      ])
      return {
        providers,
        models,
        builtin: projectDeploymentBuiltin(catalog.rawRows, projectCatalog(providers, models)),
      }
    },
  })

  const providers = useMemo(() => {
    const projected = projectCatalog(query.data?.providers ?? [], query.data?.models ?? [])
    const builtin = query.data?.builtin
    return builtin ? { ...projected, [builtin.id]: builtin } : projected
  }, [query.data])

  return {
    providers,
    error: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading,
    refresh: query.refetch,
  }
}

function projectCatalog(
  summaries: AiProviderSummary[],
  models: AiGatewayModel[],
): Record<string, AIProvider> {
  const summariesByProvider = new Map(summaries.map((summary) => [summary.id, summary]))
  const catalogModels = mergeCatalogModels(
    models,
    summaries.flatMap((summary) => summary.selectedModels),
  )
  const providerIds = new Set<AiConnectionsProvider>([
    ...summaries.map((summary) => summary.id),
    ...catalogModels.map((model) => model.provider),
  ])

  return Object.fromEntries([...providerIds].map((providerId) => {
    const summary = summariesByProvider.get(providerId)
    const providerModels = (catalogModels as Array<AiGatewayModel & { id: string }>)
      .filter((model) => model.provider === providerId)
      .map((model) => ({
        id: model.id,
        name: model.displayName || model.id,
        enabled: true,
        capabilities: model.capabilities ?? [],
        isCustom: model.custom === true,
      }))

    const provider: AIProvider = {
      id: providerId,
      name: summary?.name || PROVIDER_NAMES[providerId] || providerId,
      description: '由 Xpod 公共模型服务管理',
      enabled: Boolean(summary && summary.status !== 'unconfigured' && summary.status !== 'unavailable' && providerModels.length > 0),
      baseUrl: summary?.credentials.find((credential) => credential.enabled)?.baseUrl,
      models: providerModels,
      defaultModels: providerModels.map((model) => model.id),
      capabilities: [...new Set(providerModels.flatMap((model) => model.capabilities))],
    }
    return [providerId, provider]
  }))
}

function mergeCatalogModels(
  gatewayModels: AiGatewayModel[],
  selectedModels: AiGatewayModel[],
): AiGatewayModel[] {
  const merged = new Map<string, AiGatewayModel>()
  for (const model of [...gatewayModels, ...selectedModels]) {
    const key = `${model.provider}:${model.id}`
    merged.set(key, { ...merged.get(key), ...model })
  }
  return [...merged.values()]
}
