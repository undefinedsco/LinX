import type { WatchBackend } from './types.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'

type SupportedPodWatchBackend = WatchBackend

interface PodQueryDb {
  select(): {
    from(table: unknown): {
      execute(): Promise<unknown[]>
    }
  }
}

interface PodCredentialRow {
  id?: string
  service?: string
  status?: string
  apiKey?: string
  provider?: string
  baseUrl?: string
}

interface PodProviderRow {
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
  createDb: (session: PodDataSession) => PodQueryDb
  credentialTable: unknown
  aiProviderTable: unknown
}

async function dynamicImport(specifier: string): Promise<Record<string, any>> {
  const loader = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<Record<string, any>>
  return loader(specifier)
}

const POD_PROVIDER_IDS: Record<SupportedPodWatchBackend, readonly string[]> = {
  claude: ['anthropic', 'claude'],
  codex: ['openai', 'codex'],
  codebuddy: ['codebuddy'],
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordValue(record: Record<string, unknown>, key: string): string | undefined {
  return normalizeString(record[key])
}

function isActiveAiCredential(row: PodCredentialRow): boolean {
  return normalizeString(row.service)?.toLowerCase() === 'ai'
    && normalizeString(row.status)?.toLowerCase() === 'active'
    && typeof row.apiKey === 'string'
    && row.apiKey.trim().length > 0
}

function matchesProviderReference(reference: string, providerIds: readonly string[], providers: PodProviderRow[]): string | null {
  const normalizedReference = reference.trim()

  for (const provider of providers) {
    const providerRecord = provider as Record<string, unknown>
    const providerId = normalizeString(provider.id)
    if (!providerId || !providerIds.includes(providerId)) {
      continue
    }

    const providerSubject = recordValue(providerRecord, '@id')
    if (
      normalizedReference === providerId
      || normalizedReference === providerSubject
      || normalizedReference.endsWith(`#${providerId}`)
    ) {
      return providerId
    }
  }

  for (const providerId of providerIds) {
    if (normalizedReference === providerId || normalizedReference.endsWith(`#${providerId}`)) {
      return providerId
    }
  }

  return null
}

function selectPodCredentialForBackend(
  backend: SupportedPodWatchBackend,
  credentials: PodCredentialRow[],
  providers: PodProviderRow[],
): PodProviderMatch | null {
  const providerIds = POD_PROVIDER_IDS[backend]

  for (const credential of credentials) {
    if (!isActiveAiCredential(credential)) {
      continue
    }

    const providerReference = normalizeString(credential.provider)
    if (!providerReference) {
      continue
    }

    const providerId = matchesProviderReference(providerReference, providerIds, providers)
    if (!providerId) {
      continue
    }

    const providerRow = providers.find((provider) => normalizeString(provider.id) === providerId)
    const baseUrl = normalizeString(credential.baseUrl) ?? normalizeString(providerRow?.baseUrl)

    return {
      providerId,
      apiKey: credential.apiKey!.trim(),
      baseUrl,
    }
  }

  return null
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

async function createDefaultRuntime(): Promise<PodAiRuntime> {
  const [models] = await Promise.all([
    dynamicImport('../models.js'),
  ])

  return {
    getPodDataSession: getDefaultPodDataSession,
    createDb(podSession) {
      return models.drizzle(podSession.solidSession ?? podSession, {
        logger: false,
        disableInteropDiscovery: true,
        schema: models.solidSchema,
      }) as unknown as PodQueryDb
    },
    credentialTable: models.credentialTable,
    aiProviderTable: models.aiProviderTable,
  }
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

  const db = activeRuntime.createDb(podSession)
  const [credentials, providers] = await Promise.all([
    db.select().from(activeRuntime.credentialTable).execute() as Promise<PodCredentialRow[]>,
    db.select().from(activeRuntime.aiProviderTable).execute() as Promise<PodProviderRow[]>,
  ])

  const match = selectPodCredentialForBackend(backend, credentials, providers)
  if (!match) {
    return null
  }

  return buildBackendEnv(match, backend)
}

export const __podInternal = {
  POD_PROVIDER_IDS,
  isActiveAiCredential,
  matchesProviderReference,
  selectPodCredentialForBackend,
}
