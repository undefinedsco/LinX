import type { AutoModeBackend } from './types.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import { selectAIConfigCredential } from '../models.js'

type SupportedPodAutoModeBackend = AutoModeBackend

interface PodQueryDb {
  select(): {
    from(resource: unknown): {
      execute(): Promise<unknown[]>
    }
  }
  findById?: (resource: unknown, id: string) => Promise<unknown | null>
  updateById?: (resource: unknown, id: string, data: Record<string, unknown>) => Promise<unknown>
}

interface PodCredentialRow extends Record<string, unknown> {
  id?: string
  service?: string
  status?: string
  apiKey?: string
  provider?: string
  baseUrl?: string
  proxyUrl?: string
  label?: string
  isDefault?: boolean
  lastUsedAt?: Date
  failCount?: number
}

interface PodProviderRow extends Record<string, unknown> {
  id?: string
  '@id'?: string
  baseUrl?: string
}

export interface PodBackedAutoModeCredential {
  backend: SupportedPodAutoModeBackend
  provider: 'anthropic' | 'openai' | 'codebuddy'
  env: Record<string, string>
}

interface PodProviderMatch {
  providerId: string
  apiKey: string
  baseUrl?: string
}

interface PodAiRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb?: (session: PodDataSession) => PodQueryDb
  credentialResource?: unknown
  aiProviderResource?: unknown
}

const BACKEND_PROVIDER_IDS: Record<SupportedPodAutoModeBackend, readonly string[]> = {
  claude: ['anthropic', 'claude'],
  codex: ['openai', 'codex'],
  codebuddy: ['codebuddy'],
}

function selectPodCredentialForBackend(
  backend: SupportedPodAutoModeBackend,
  credentials: PodCredentialRow[],
  providers: PodProviderRow[],
): PodProviderMatch | null {
  const providerIds = BACKEND_PROVIDER_IDS[backend]

  for (const providerId of providerIds) {
    const selected = selectAIConfigCredential(providerId, credentials, providers)
    if (!selected) continue
    return {
      providerId: selected.providerId,
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl,
    }
  }

  return null
}

async function markCredentialUsed(
  runtime: PodAiRuntime,
  db: PodQueryDb,
  row: PodCredentialRow | undefined,
): Promise<void> {
  if (!row?.id || !runtime.credentialResource) return
  await db.updateById?.(runtime.credentialResource, row.id, { lastUsedAt: new Date() })
}

function buildBackendEnv(match: PodProviderMatch, backend: SupportedPodAutoModeBackend): PodBackedAutoModeCredential {
  if (backend === 'claude') {
    return {
      backend,
      provider: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: match.apiKey,
      },
    }
  }

  if (backend === 'codex') {
    return {
      backend,
      provider: 'openai',
      env: {
        OPENAI_API_KEY: match.apiKey,
        CODEX_API_KEY: match.apiKey,
        ...(match.baseUrl ? { OPENAI_BASE_URL: match.baseUrl } : {}),
      },
    }
  }

  return {
    backend,
    provider: 'codebuddy',
    env: {
      CODEBUDDY_API_KEY: match.apiKey,
      ...(match.baseUrl ? { CODEBUDDY_BASE_URL: match.baseUrl } : {}),
    },
  }
}

function missingPodClientCredentialsMessage(): string {
  return 'LinX cloud credential source is not connected yet. Run `linx login` first.'
}

export function podCredentialMissingMessage(backend: SupportedPodAutoModeBackend): string {
  if (backend === 'claude') {
    return 'No active Anthropic AI credential was found in LinX Pod AI settings. Configure an Anthropic credential in LinX, then try again.'
  }

  if (backend === 'codex') {
    return 'No active OpenAI/Codex credential was found in LinX Pod AI settings. Configure an OpenAI credential in LinX, then try again.'
  }

  if (backend === 'codebuddy') {
    return 'No active CodeBuddy credential was found in LinX Pod AI settings. Configure a CodeBuddy credential in LinX, then try again.'
  }

  return 'No matching Pod AI credential was found.'
}

async function dynamicImport(specifier: string): Promise<Record<string, any>> {
  const loader = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<Record<string, any>>
  return loader(specifier)
}

async function createDefaultRuntime(): Promise<PodAiRuntime> {
  const models = await dynamicImport(new URL('../models.js', import.meta.url).href)

  return {
    getPodDataSession: getDefaultPodDataSession,
    createDb(podSession) {
      return models.drizzle(podSession.solidSession, {
        logger: false,
        disableInteropDiscovery: true,
        podUrl: podSession.podUrl,
        resourcePreparation: 'off' as never,
        schema: models.solidResources,
      }) as PodQueryDb
    },
    credentialResource: models.credentialResource,
    aiProviderResource: models.aiProviderResource,
  }
}

async function loadRowsWithDrizzle(
  runtime: PodAiRuntime,
  podSession: PodDataSession,
  backend: SupportedPodAutoModeBackend,
): Promise<{ db: PodQueryDb; credentials: PodCredentialRow[]; providers: PodProviderRow[] } | null> {
  if (!runtime.createDb || !runtime.credentialResource || !runtime.aiProviderResource) {
    return null
  }

  const db = runtime.createDb(podSession)
  const credentials = await db.select().from(runtime.credentialResource).execute() as PodCredentialRow[]
  const providers = await Promise.all(
    BACKEND_PROVIDER_IDS[backend].map(async (providerId) => {
      return db.findById?.(runtime.aiProviderResource, providerId) as Promise<PodProviderRow | null | undefined>
    }),
  )

  return { db, credentials, providers: providers.filter((provider): provider is PodProviderRow => Boolean(provider)) }
}

export async function loadPodBackendCredential(
  backend: AutoModeBackend,
  runtime?: PodAiRuntime,
): Promise<PodBackedAutoModeCredential | null> {
  const activeRuntime = runtime ?? await createDefaultRuntime()
  const podSession = await activeRuntime.getPodDataSession()
  if (!podSession) {
    throw new Error(missingPodClientCredentialsMessage())
  }

  const rows = await loadRowsWithDrizzle(activeRuntime, podSession, backend)
  if (!rows) {
    throw new Error('LinX cloud credential source requires shared models/drizzle-solid access.')
  }

  const match = selectPodCredentialForBackend(backend, rows.credentials, rows.providers)
  if (!match) {
    return null
  }

  const selected = selectAIConfigCredential(match.providerId, rows.credentials, rows.providers)
  await markCredentialUsed(activeRuntime, rows.db, selected?.credential as PodCredentialRow | undefined)

  return buildBackendEnv(match, backend)
}

export const __podInternal = {
  BACKEND_PROVIDER_IDS,
  selectPodCredentialForBackend,
}
