import type { CommandModule } from 'yargs'
import { resolveLinxPodUrl } from '@undefineds.co/models/client'
import {
  aiModelTable,
  aiProviderTable,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  credentialTable,
  drizzle,
  getAIConfigProviderMetadata,
  initSolidTables,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
  solidSchema,
  type AIModelRow,
  type AIProviderRow,
  type CredentialRow,
  type SolidDatabase,
} from './models.js'
import { getClientCredentialId, getClientCredentialKey, getClientCredentials, loadCredentials } from './credentials-store.js'
import { loadAccountSession } from './account-session.js'
import { authenticatedFetch, getAccessToken } from './solid-auth.js'
import { getOidcAccessToken } from './oidc-auth.js'
import { promptPassword } from './prompt.js'
interface AiArgs {
  action?: 'connect' | 'disconnect' | 'status'
  provider?: string
  url?: string
  'api-key'?: string
  model?: string
  'base-url'?: string
}

interface AiRuntime {
  buildAIConfigMutationPlan: (input: {
    providerId: string
    currentProviderRows: Array<Partial<AIProviderRow> & Record<string, unknown>>
    currentCredentialRows: Array<Partial<CredentialRow> & Record<string, unknown>>
    currentModelRows: Array<Partial<AIModelRow> & Record<string, unknown>>
    updates: {
      enabled?: boolean
      apiKey?: string
      baseUrl?: string
      models?: Array<{
        id: string
        name: string
        enabled: boolean
        capabilities: string[]
      }>
    }
  }) => {
    providerId: string
    providerPayload?: {
      id?: string
      baseUrl?: string
      proxyUrl?: string
      hasModel?: string
    }
    credentialPayload?: {
      id?: string
      provider?: string
      service?: string
      status?: string
      apiKey?: string
      baseUrl?: string
      label?: string
    }
    modelUpserts: Array<{
      id?: string
      displayName?: string
      modelType?: string
      isProvidedBy?: string
      status?: string
      createdAt?: Date
      updatedAt?: Date
    }>
    modelDeleteIds: string[]
  }
  buildAIConfigProviderStateMap: (input: {
    fallbackToCatalogModels?: boolean
    credentialRows: Array<Partial<CredentialRow> & Record<string, unknown>>
    providerRows: Array<Partial<AIProviderRow> & Record<string, unknown>>
    modelRows: Array<Partial<AIModelRow> & Record<string, unknown>>
  }) => Record<string, {
    id: string
    apiKey?: string
    selectedModelId?: string
  }>
  getAIConfigProviderMetadata: (providerId: string) => { id: string }
  normalizeAIConfigProviderId: (value?: string | null) => string
  normalizeAIConfigResourceId: (value?: string | null) => string
  sameAIConfigProviderFamily: (left?: string | null, right?: string | null) => boolean
}

interface AiConfigRows {
  credentialRows: CredentialRow[]
  providerRows: AIProviderRow[]
  modelRows: AIModelRow[]
}

interface AiCommandDependencies {
  aiRuntime?: AiRuntime
  resolvePodWriteContext?: (urlOverride?: string) => Promise<{ accessToken: string; podUrl: string; webId: string }>
  createDb?: (context: { accessToken: string; podUrl: string; webId: string }) => SolidDatabase
  loadAiConfigRows?: (db: SolidDatabase) => Promise<AiConfigRows>
  upsertByLocator?: typeof upsertByLocator
  deleteByLocatorIfExists?: typeof deleteByLocatorIfExists
  requireApiKey?: (argv: AiArgs) => Promise<string>
  write?: (chunk: string) => void
}

let aiRuntimePromise: Promise<AiRuntime> | null = null

async function loadAiRuntime(): Promise<AiRuntime> {
  if (!aiRuntimePromise) {
    aiRuntimePromise = Promise.resolve({
      buildAIConfigMutationPlan,
      buildAIConfigProviderStateMap,
      getAIConfigProviderMetadata,
      normalizeAIConfigProviderId,
      normalizeAIConfigResourceId,
      sameAIConfigProviderFamily,
    })
  }

  return aiRuntimePromise!
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '****'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

async function requireApiKey(argv: AiArgs): Promise<string> {
  if (argv['api-key']?.trim()) {
    return argv['api-key'].trim()
  }

  const apiKey = await promptPassword('API key: ')
  if (!apiKey) {
    throw new Error('API key is required')
  }

  return apiKey
}

async function resolvePodWriteContext(urlOverride?: string): Promise<{ accessToken: string; podUrl: string; webId: string }> {
  const creds = loadCredentials()
  if (!creds) {
    throw new Error('No local client credentials found. Run `linx login` first.')
  }
  if (!creds.webId) {
    throw new Error('No WebID found in local credentials. Run `linx login` again.')
  }

  const clientCreds = getClientCredentials(creds)
  let accessToken: string | null = null
  if (clientCreds) {
    const baseUrl = (urlOverride ?? creds.url).replace(/\/?$/, '/')
    const tokenResult = await getAccessToken(getClientCredentialId(clientCreds), getClientCredentialKey(clientCreds), baseUrl)
    accessToken = tokenResult?.accessToken ?? null
  } else {
    accessToken = await getOidcAccessToken(creds)
  }

  if (!accessToken) {
    throw new Error('Failed to obtain Pod access token. Run `linx login` again.')
  }

  return {
    accessToken,
    webId: creds.webId,
    podUrl: loadAccountSession()?.podUrl || resolveLinxPodUrl(creds.webId),
  }
}

function createAiConfigDb(context: { accessToken: string; podUrl: string; webId: string }): SolidDatabase {
  const solidSession = {
    info: {
      isLoggedIn: true,
      webId: context.webId,
      podUrl: context.podUrl,
    },
    fetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) => (
      authenticatedFetch(requestInputToUrl(input), context.accessToken, init)
    ),
    logout: async () => {},
  }
  return drizzle(solidSession, {
    logger: false,
    disableInteropDiscovery: true,
    schema: solidSchema,
  }) as unknown as SolidDatabase
}

async function loadAiConfigRows(db: SolidDatabase): Promise<{
  credentialRows: CredentialRow[]
  providerRows: AIProviderRow[]
  modelRows: AIModelRow[]
}> {
  await initSolidTables(db, [credentialTable, aiProviderTable, aiModelTable])
  const [credentialRows, providerRows, modelRows] = await Promise.all([
    db.select().from(credentialTable).execute() as Promise<CredentialRow[]>,
    db.select().from(aiProviderTable).execute() as Promise<AIProviderRow[]>,
    db.select().from(aiModelTable).execute() as Promise<AIModelRow[]>,
  ])
  return { credentialRows, providerRows, modelRows }
}

async function upsertByLocator(
  db: SolidDatabase,
  table: Parameters<SolidDatabase['resolveLocatorIri']>[0],
  locator: Record<string, unknown>,
  insert: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<void> {
  const existing = await db.findByLocator(table, locator)
  if (!existing) {
    await db.insert(table).values(insert).execute()
    return
  }
  await db.updateByLocator(table, locator, update)
}

async function deleteByLocatorIfExists(
  db: SolidDatabase,
  table: Parameters<SolidDatabase['resolveLocatorIri']>[0],
  locator: Record<string, unknown>,
): Promise<void> {
  const existing = await db.findByLocator(table, locator)
  if (existing) {
    await db.deleteByLocator(table, locator)
  }
}

function requestInputToUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

export async function runAiCommand(argv: AiArgs, dependencies: AiCommandDependencies = {}): Promise<void> {
  const action = argv.action
  const aiRuntime = dependencies.aiRuntime ?? await loadAiRuntime()
  const podContext = await (dependencies.resolvePodWriteContext ?? resolvePodWriteContext)(argv.url)
  const db = (dependencies.createDb ?? createAiConfigDb)(podContext)
  const { credentialRows, providerRows, modelRows } = await (dependencies.loadAiConfigRows ?? loadAiConfigRows)(db)
  const write = dependencies.write ?? ((chunk: string) => process.stdout.write(chunk))
  const upsert = dependencies.upsertByLocator ?? upsertByLocator
  const deleteIfExists = dependencies.deleteByLocatorIfExists ?? deleteByLocatorIfExists
  const getApiKey = dependencies.requireApiKey ?? requireApiKey

  if (action === 'status') {
    const states = aiRuntime.buildAIConfigProviderStateMap({
      fallbackToCatalogModels: false,
      credentialRows,
      providerRows,
      modelRows,
    })

    const filtered = Object.values(states).filter((state) => {
      if (!state.apiKey) return false
      if (!argv.provider) return true
      return aiRuntime.sameAIConfigProviderFamily(argv.provider, state.id)
    })

    if (filtered.length === 0) {
      write('No LinX cloud AI credentials found.\n')
      return
    }

    const lines: string[] = []
    for (const state of filtered) {
      lines.push(`provider: ${state.id}`)
      if (state.selectedModelId) {
        lines.push(`model: ${state.selectedModelId}`)
      }
      lines.push(`api-key: ${maskSecret(state.apiKey!)}`)
      lines.push('')
    }

    write(`${lines.join('\n').trimEnd()}\n`)
    return
  }

  const providerArg = argv.provider?.trim()
  if (!providerArg) {
    throw new Error(action === 'disconnect'
      ? 'Usage: linx ai disconnect <provider>'
      : 'Usage: linx ai connect <provider> --api-key <key>')
  }

  const provider = aiRuntime.normalizeAIConfigProviderId(providerArg)

  if (action === 'disconnect') {
    for (const row of credentialRows) {
      const rowProvider = typeof row.provider === 'string' ? row.provider : row.id
      if (!aiRuntime.sameAIConfigProviderFamily(rowProvider, provider)) {
        continue
      }
      await deleteIfExists(db, credentialTable, { id: row.id })
    }

    write(`Disconnected AI provider: ${provider}\n`)
    return
  }

  const apiKey = await getApiKey(argv)
  const modelId = argv.model?.trim()
  const plan = aiRuntime.buildAIConfigMutationPlan({
    providerId: provider,
    currentProviderRows: providerRows,
    currentCredentialRows: credentialRows,
    currentModelRows: modelRows,
    updates: {
      enabled: true,
      apiKey,
      baseUrl: argv['base-url']?.trim() || undefined,
      models: modelId
        ? [{
            id: modelId,
            name: modelId,
            enabled: true,
            capabilities: [],
          }]
        : undefined,
    },
  })

  if (plan.providerPayload?.id) {
    await upsert(db, aiProviderTable, { id: plan.providerPayload.id }, plan.providerPayload, {
      baseUrl: plan.providerPayload.baseUrl,
      proxyUrl: plan.providerPayload.proxyUrl,
      hasModel: plan.providerPayload.hasModel,
    })
  }

  if (
    plan.credentialPayload?.id
    && plan.credentialPayload.provider
    && plan.credentialPayload.service
    && plan.credentialPayload.status
  ) {
    await upsert(db, credentialTable, { id: plan.credentialPayload.id }, plan.credentialPayload, {
      provider: plan.credentialPayload.provider,
      service: plan.credentialPayload.service,
      status: plan.credentialPayload.status,
      apiKey: plan.credentialPayload.apiKey,
      baseUrl: plan.credentialPayload.baseUrl,
      label: plan.credentialPayload.label,
    })
  }

  for (const modelPayload of plan.modelUpserts) {
    if (!modelPayload.id || !modelPayload.isProvidedBy || !modelPayload.createdAt || !modelPayload.updatedAt) {
      continue
    }
    await upsert(db, aiModelTable, {
      id: modelPayload.id,
      isProvidedBy: modelPayload.isProvidedBy,
    }, modelPayload, {
      displayName: modelPayload.displayName,
      modelType: modelPayload.modelType,
      isProvidedBy: modelPayload.isProvidedBy,
      status: modelPayload.status,
      updatedAt: modelPayload.updatedAt,
    })
  }

  for (const modelIdToDelete of plan.modelDeleteIds) {
    await deleteIfExists(db, aiModelTable, {
      id: modelIdToDelete,
      isProvidedBy: plan.providerId,
    })
  }

  const metadata = aiRuntime.getAIConfigProviderMetadata(provider)
  write(`Connected AI provider: ${metadata.id}\n`)
  if (modelId) {
    write(`model: ${aiRuntime.normalizeAIConfigResourceId(modelId)}\n`)
  }
  write(`api-key: ${maskSecret(apiKey)}\n`)
}

export const aiCommand: CommandModule<object, AiArgs> = {
  command: 'ai <action> [provider]',
  describe: 'Manage LinX cloud AI provider credentials',
  builder: (yargs) =>
    yargs
      .positional('action', {
        type: 'string',
        choices: ['connect', 'disconnect', 'status'] as const,
      })
      .positional('provider', {
        type: 'string',
        description: 'Provider/backend id, for example claude, anthropic, codebuddy, codex',
      })
      .option('url', { type: 'string', description: 'Server base URL override' })
      .option('api-key', { type: 'string', description: 'Provider API key' })
      .option('model', { type: 'string', description: 'Default model id' })
      .option('base-url', { type: 'string', description: 'Provider API base URL override' }),
  handler: async (argv) => runAiCommand(argv),
}
