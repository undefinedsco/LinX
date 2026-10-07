import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type AiConnectionsProvider,
  type AiGatewayModel,
  type AiProviderSummary,
  createAiConnectionsClient,
} from '@undefineds.co/ai-connections'
import type { AIProvider } from '../domain/types'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'

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
  const client = useMemo(() => (
    database.status === 'ready' && webId && podBaseUrl
      ? createAiConnectionsClient({ webId, podBaseUrl, authenticatedFetch: session.fetch })
      : null
  ), [database.status, podBaseUrl, session.fetch, webId])

  const query = useQuery({
    queryKey: ['xpod-ai-model-catalog', client?.webId, client?.apiBase],
    enabled: Boolean(client),
    staleTime: 30_000,
    queryFn: async () => {
      if (!client) return { providers: [], models: [] }
      const [providers, models] = await Promise.all([client.listProviders(), client.listModels()])
      return { providers, models }
    },
  })

  const providers = useMemo(
    () => projectCatalog(query.data?.providers ?? [], query.data?.models ?? []),
    [query.data],
  )

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
