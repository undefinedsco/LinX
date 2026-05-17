import type { AutoModeBackend } from './types.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  getDefaultAIConfigCredentialId,
  getAIConfigProviderFamilyIds,
  normalizeAIConfigResourceId,
  selectAIConfigCredential,
} from '../models.js'

type SupportedPodAutoModeBackend = AutoModeBackend

interface PodQueryDb {
  updateById?: (resource: unknown, id: string, data: Record<string, unknown>) => Promise<unknown>
  updateByLocator?: (table: unknown, locator: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown>
  findById<T = unknown>(resource: unknown, id: string): Promise<T | null>
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
  proxyUrl?: string
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
  if (db.updateById) {
    await db.updateById(runtime.credentialResource, row.id, { lastUsedAt: new Date() })
    return
  }
  await db.updateByLocator?.(runtime.credentialResource, { id: row.id }, { lastUsedAt: new Date() })
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
        CODEX_API_KEY: match.apiKey,
        ...(match.baseUrl ? { CODEX_BASE_URL: match.baseUrl } : {}),
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
  backend: SupportedPodAutoModeBackend,
  runtime: PodAiRuntime,
  podSession: PodDataSession,
): Promise<{ db: PodQueryDb; credentials: PodCredentialRow[]; providers: PodProviderRow[] } | null> {
  if (!runtime.createDb || !runtime.credentialResource || !runtime.aiProviderResource) {
    return null
  }

  const db = runtime.createDb(podSession)
  return loadKnownBackendRowsWithDrizzle(backend, db, {
    credentialResource: runtime.credentialResource,
    aiProviderResource: runtime.aiProviderResource,
  })
}

async function loadKnownBackendRowsWithDrizzle(
  backend: SupportedPodAutoModeBackend,
  db: PodQueryDb,
  runtime: Required<Pick<PodAiRuntime, 'credentialResource' | 'aiProviderResource'>>,
): Promise<{ db: PodQueryDb; credentials: PodCredentialRow[]; providers: PodProviderRow[] }> {
  const providerId = BACKEND_PROVIDER_IDS[backend][0]
  const providerIds = getAIConfigProviderFamilyIds(providerId)
  const credentialIds = Array.from(new Set([
    ...providerIds.flatMap((id) => credentialIdCandidates(getDefaultAIConfigCredentialId(id))),
  ]))
  const providerResourceIds = Array.from(new Set(providerIds.flatMap(providerIdCandidates)))

  const [credentials, providers] = await Promise.all([
    findRowsByIds<PodCredentialRow>(db, runtime.credentialResource, credentialIds),
    findRowsByIds<PodProviderRow>(db, runtime.aiProviderResource, providerResourceIds),
  ])

  return { db, credentials, providers }
}

function credentialIdCandidates(id: string): string[] {
  const normalized = normalizeAIConfigResourceId(id) || id
  return [
    normalized,
    `credentials.ttl#${normalized}`,
    `#${normalized}`,
  ]
}

function providerIdCandidates(id: string): string[] {
  const normalized = normalizeAIConfigResourceId(id) || id
  return [
    normalized,
    `${normalized}.ttl`,
  ]
}

async function findRowsByIds<T extends object>(
  db: PodQueryDb,
  resource: unknown,
  ids: string[],
): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    const row = await db.findById<T>(resource, id).catch((error) => {
      if (isMissingExactReadError(error)) {
        return null
      }
      throw error
    })
    if (row) {
      rows.push(row)
    }
  }

  return rows
}

function isMissingExactReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /404|not found|missing/i.test(message)
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

  const rows = await loadRowsWithDrizzle(backend, activeRuntime, podSession)
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
