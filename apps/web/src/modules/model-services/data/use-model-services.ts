import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type AiBuiltinProviderSummary,
  type AiConnectionsClient,
  type AiConnectionsProvider,
  type AiGatewayModel,
  type AiProviderSummary,
  createAiConnectionsClient,
} from '@undefineds.co/ai-connections/client'
import type { BuiltinDirectoryState } from '@undefineds.co/ai-connections'
import type { AIProvider } from '../domain/types'
import { LINX_PLATFORM_PROVIDER_ID } from '@/lib/agent-providers'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'

/**
 * One client per (webId, pod) pair. Nothing is shared between sessions, so a
 * response for a replaced client is never adopted.
 */
interface CatalogLoad {
  client: AiConnectionsClient
}

/**
 * The deployment's own read-only AI directory, as the server declared it.
 *
 * The published client reads this through `listBuiltinProviders()`, which
 * answers from `builtin:true` + `readOnly:true` rows on `/api/ai/providers`.
 * That parser is the single authority for the deployment id, so LinX never
 * inspects the payload, never reads an advertisement header and never carries a
 * provider-id branch of its own.
 *
 * The directory is mapped onto the existing platform identity so chat keeps
 * addressing the platform runtime with bare `linx`/`linx-lite`. Nothing here
 * grants a credential, enables editing, or invents a provider the server did
 * not declare.
 */
export function projectBuiltinDirectory(
  summaries: AiBuiltinProviderSummary[],
  existing: Record<string, AIProvider>,
): AIProvider | null {
  if (existing[LINX_PLATFORM_PROVIDER_ID]) return null

  const models = summaries
    .flatMap((summary) => (summary.status === 'available' ? summary.models : []))
    .flatMap((model) => {
      const id = typeof model.id === 'string' ? model.id.trim() : ''
      if (!id) return []
      return [{
        id,
        name: model.displayName?.trim() || id,
        enabled: true,
        capabilities: [],
        isCustom: false,
      }]
    })
    // Two deployments can declare the same model id; the first wins so the
    // picker never shows a duplicate row for one model.
    .filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
  if (models.length === 0) return null

  const advertisedName = summaries
    .find((summary) => summary.status === 'available' && summary.models.length > 0)
    ?.name
    .trim()

  return {
    id: LINX_PLATFORM_PROVIDER_ID,
    name: advertisedName || 'LinX',
    description: '由当前站点提供的内置模型服务，只读',
    enabled: true,
    models,
    defaultModels: models.map((model) => model.id),
    capabilities: [],
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
  // The published client owns catalog parsing. LinX does not wrap its fetch,
  // re-parse the payload, or read an advertisement header: `listBuiltinProviders`
  // is the declared surface for the deployment's own directory.
  const catalog = useMemo<CatalogLoad | null>(() => {
    if (database.status !== 'ready' || !webId || !podBaseUrl) return null
    return {
      client: createAiConnectionsClient({
        webId,
        podBaseUrl,
        authenticatedFetch: session.fetch,
      }),
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
      if (!catalog) {
        return {
          providers: [],
          models: [],
          builtinDirectory: { status: 'loading' } as BuiltinDirectoryState,
          personalError: null,
        }
      }
      const { client } = catalog
      // The personal catalog and the deployment directory are independent reads:
      // whichever one fails, the other still describes what it owns. The builtin
      // directory is never derived from the personal provider list, so a failing
      // Pod read cannot erase a directory the caller never had to read the Pod for.
      //
      // `listBuiltinProviders` is an optional capability. The method is captured
      // and invoked with the client as receiver, exactly as the shared panel
      // does, so an absent method declares the absence and an older client is not
      // mistaken for a deployment that serves no built-ins.
      const readBuiltin = client.listBuiltinProviders
      const builtinPromise: Promise<AiBuiltinProviderSummary[]> = readBuiltin
        ? readBuiltin.call(client)
        : Promise.resolve([])

      const [providersResult, modelsResult, builtinResult] = await Promise.allSettled([
        client.listProviders(),
        client.listModels(),
        builtinPromise,
      ])

      const providers = providersResult.status === 'fulfilled' ? providersResult.value : []
      const models = modelsResult.status === 'fulfilled' ? modelsResult.value : []
      const failure = [providersResult, modelsResult]
        .find((result): result is PromiseRejectedResult => result.status === 'rejected')

      // A failed directory read is reported as failed, never as an empty one.
      // The four states mirror the shared panel so every LinX consumer can tell
      // "the deployment has no built-ins" apart from "the read did not succeed".
      const builtinDirectory: BuiltinDirectoryState = !readBuiltin
        ? { status: 'unsupported' }
        : builtinResult.status === 'fulfilled'
          ? { status: 'ready', providers: builtinResult.value }
          : { status: 'failed', message: errorMessage(builtinResult.reason) }

      return {
        providers,
        models,
        builtinDirectory,
        personalError: failure ? errorMessage(failure.reason) : null,
      }
    },
  })

  const providers = useMemo(() => {
    const projected = projectCatalog(query.data?.providers ?? [], query.data?.models ?? [])
    const directory = query.data?.builtinDirectory
    const builtin = directory?.status === 'ready'
      ? projectBuiltinDirectory(directory.providers, projected)
      : null
    return builtin ? { ...projected, [builtin.id]: builtin } : projected
  }, [query.data])

  return {
    providers,
    // Personal connection failures stay visible for personal operations, while
    // the deployment built-in remains usable.
    error: query.error instanceof Error
      ? query.error.message
      : query.data?.personalError ?? null,
    /**
     * The deployment directory, distinct from the personal catalog on purpose.
     *
     * `unsupported`/`failed`/`ready`-empty are three different facts, and
     * consumers that only look at `providers` cannot tell them apart. Reporting
     * `loading` while the query is pending keeps a slow read from reading as a
     * settled failure.
     */
    builtinDirectory: resolveBuiltinDirectory(query.data?.builtinDirectory, query.error),
    isLoading: query.isLoading,
    refresh: query.refetch,
  }
}

/**
 * The settled directory state, or `loading` while nothing has settled yet.
 *
 * A query-level failure is a failed directory read. It is never folded into the
 * personal `error` above, because that string drives personal operations.
 */
function resolveBuiltinDirectory(
  settled: BuiltinDirectoryState | undefined,
  queryError: unknown,
): BuiltinDirectoryState {
  if (settled) return settled
  if (queryError instanceof Error) return { status: 'failed', message: queryError.message }
  return { status: 'loading' }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
