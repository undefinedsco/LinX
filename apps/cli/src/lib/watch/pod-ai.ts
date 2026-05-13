import type { WatchBackend } from './types.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import { selectAIConfigCredential } from '../models.js'

type SupportedPodWatchBackend = WatchBackend

interface PodQueryDb {
  select(): {
    from(table: unknown): {
      execute(): Promise<unknown[]>
    }
  }
  updateByLocator?: (table: unknown, locator: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown>
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

export interface PodBackedWatchCredential {
  backend: SupportedPodWatchBackend
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
  credentialTable?: unknown
  aiProviderTable?: unknown
}

const POD_PROVIDER_IDS: Record<SupportedPodWatchBackend, readonly string[]> = {
  claude: ['anthropic', 'claude'],
  codex: ['openai', 'codex'],
  codebuddy: ['codebuddy'],
}

function selectPodCredentialForBackend(
  backend: SupportedPodWatchBackend,
  credentials: PodCredentialRow[],
  providers: PodProviderRow[],
): PodProviderMatch | null {
  const providerIds = POD_PROVIDER_IDS[backend]

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
  if (!row?.id || !runtime.credentialTable) return
  await db.updateByLocator?.(runtime.credentialTable, { id: row.id }, { lastUsedAt: new Date() })
}

function buildBackendEnv(match: PodProviderMatch, backend: SupportedPodWatchBackend): PodBackedWatchCredential {
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

export function podCredentialMissingMessage(backend: SupportedPodWatchBackend): string {
  if (backend === 'claude') {
    return 'No active Anthropic AI credential was found in LinX cloud credential config. Configure one in `/settings/credentials.ttl` and try again.'
  }

  if (backend === 'codex') {
    return 'No active OpenAI/Codex credential was found in LinX cloud credential config. Configure one in `/settings/credentials.ttl` and try again.'
  }

  if (backend === 'codebuddy') {
    return 'No active CodeBuddy credential was found in LinX cloud credential config. Configure one in `/settings/credentials.ttl` and try again.'
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
        schema: models.solidSchema,
      }) as PodQueryDb
    },
    credentialTable: models.credentialTable,
    aiProviderTable: models.aiProviderTable,
  }
}

async function loadRowsWithDrizzle(
  runtime: PodAiRuntime,
  podSession: PodDataSession,
): Promise<{ db: PodQueryDb; credentials: PodCredentialRow[]; providers: PodProviderRow[] } | null> {
  if (!runtime.createDb || !runtime.credentialTable || !runtime.aiProviderTable) {
    return null
  }

  const db = runtime.createDb(podSession)
  const [credentials, providers] = await Promise.all([
    db.select().from(runtime.credentialTable).execute() as Promise<PodCredentialRow[]>,
    db.select().from(runtime.aiProviderTable).execute() as Promise<PodProviderRow[]>,
  ])

  return { db, credentials, providers }
}

export async function loadPodBackendCredential(
  backend: WatchBackend,
  runtime?: PodAiRuntime,
): Promise<PodBackedWatchCredential | null> {
  const activeRuntime = runtime ?? await createDefaultRuntime()
  const podSession = await activeRuntime.getPodDataSession()
  if (!podSession) {
    throw new Error(missingPodClientCredentialsMessage())
  }

  const rows = await loadRowsWithDrizzle(activeRuntime, podSession)
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
  POD_PROVIDER_IDS,
  selectPodCredentialForBackend,
}
