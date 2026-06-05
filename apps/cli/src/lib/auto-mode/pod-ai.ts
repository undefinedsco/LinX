import type { AutoModeWorkerBackend } from './types.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  aiConfigRepository,
  selectAIConfigCredentialForBackend,
  type AIConfigBackendCredentialSelection,
  type SolidDatabase,
} from '../models.js'

type SupportedPodAutoModeBackend = Exclude<AutoModeWorkerBackend, 'linx'>

export interface PodBackedAutoModeCredential {
  backend: SupportedPodAutoModeBackend
  provider: string
  env: Record<string, string>
}

interface PodAiRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb?: (session: PodDataSession) => SolidDatabase
}

interface PodProviderMatch {
  providerId: string
  apiKey: string
  baseUrl?: string
}

function selectPodCredentialForBackend(
  backend: SupportedPodAutoModeBackend,
  credentials: Array<Record<string, unknown>>,
  providers: Array<Record<string, unknown>>,
): PodProviderMatch | null {
  const selected = selectAIConfigCredentialForBackend(backend, credentials, providers)
  if (!selected) return null
  return {
    providerId: selected.providerId,
    apiKey: selected.apiKey,
    baseUrl: selected.baseUrl,
  }
}

function buildBackendEnv(
  match: AIConfigBackendCredentialSelection,
  backend: SupportedPodAutoModeBackend,
): PodBackedAutoModeCredential {
  if (backend === 'claude') {
    return {
      backend,
      provider: match.providerId,
      env: {
        ANTHROPIC_API_KEY: match.apiKey,
        ...(match.baseUrl ? { ANTHROPIC_BASE_URL: match.baseUrl } : {}),
      },
    }
  }

  if (backend === 'codex') {
    return {
      backend,
      provider: match.providerId,
      env: {
        CODEX_API_KEY: match.apiKey,
        ...(match.baseUrl ? { CODEX_BASE_URL: match.baseUrl } : {}),
      },
    }
  }

  return {
    backend,
    provider: match.providerId,
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
    return 'No active Codex-compatible AI credential was found in LinX Pod AI settings. Configure a provider credential in LinX, then try again.'
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
      }) as SolidDatabase
    },
  }
}

async function loadRowsWithDrizzle(
  backend: SupportedPodAutoModeBackend,
  runtime: PodAiRuntime,
  podSession: PodDataSession,
): Promise<{ db: SolidDatabase; match: AIConfigBackendCredentialSelection | undefined } | null> {
  if (!runtime.createDb) {
    return null
  }

  const db = runtime.createDb(podSession)
  return {
    db,
    match: await aiConfigRepository.loadCredentialForBackend(db, backend),
  }
}

export async function loadPodBackendCredential(
  backend: SupportedPodAutoModeBackend,
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

  if (!rows.match) {
    return null
  }

  await aiConfigRepository.markCredentialUsed(rows.db, rows.match)

  return buildBackendEnv(rows.match, backend)
}

export const __podInternal = {
  selectPodCredentialForBackend,
}
