import type { CommandModule } from 'yargs'
import { resolveLinxPodUrl } from '@undefineds.co/models/client'
import {
  aiConfigProviderRef,
  aiModelResource,
  aiProviderResource,
  buildAIConfigDisconnectPlan,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  credentialResource,
  drizzle,
  getAIConfigProviderMetadata,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  solidResources,
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
  buildAIConfigDisconnectPlan: (input: {
    providerId: string
    currentCredentialRows: Array<Partial<CredentialRow> & Record<string, unknown>>
  }) => {
    providerId: string
    credentialDeleteIds: string[]
  }
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
  aiConfigProviderRef: (providerId: string) => string
  normalizeAIConfigProviderId: (value?: string | null) => string
  normalizeAIConfigResourceId: (value?: string | null) => string
}

interface AiConfigRows {
  credentialRows: CredentialRow[]
  providerRows: AIProviderRow[]
  modelRows: AIModelRow[]
}

interface AiConfigRowsOptions {
  providerId?: string
  includeSelectedModel?: boolean
}

interface AiCommandDependencies {
  aiRuntime?: AiRuntime
  resolvePodWriteContext?: (urlOverride?: string) => Promise<{ accessToken: string; podUrl: string; webId: string }>
  createDb?: (context: { accessToken: string; podUrl: string; webId: string }) => SolidDatabase
  loadAiConfigRows?: (db: SolidDatabase) => Promise<AiConfigRows>
  upsertById?: typeof upsertById
  deleteByIdIfExists?: typeof deleteByIdIfExists
  requireApiKey?: (argv: AiArgs) => Promise<string>
  write?: (chunk: string) => void
}

export interface ConnectAiProviderCredentialInput {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
  url?: string
}

export interface ConnectAiProviderCredentialResult {
  providerId: string
  modelId?: string
  maskedApiKey: string
}

let aiRuntimePromise: Promise<AiRuntime> | null = null

async function loadAiRuntime(): Promise<AiRuntime> {
  if (!aiRuntimePromise) {
    aiRuntimePromise = Promise.resolve({
      buildAIConfigDisconnectPlan,
      buildAIConfigMutationPlan,
      buildAIConfigProviderStateMap,
      aiConfigProviderRef,
      getAIConfigProviderMetadata,
      normalizeAIConfigProviderId,
      normalizeAIConfigResourceId,
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
    resourcePreparation: 'best-effort' as never,
    schema: solidResources,
  }) as unknown as SolidDatabase
}

async function loadAiConfigRows(db: SolidDatabase): Promise<{
  credentialRows: CredentialRow[]
  providerRows: AIProviderRow[]
  modelRows: AIModelRow[]
}> {
  const credentialRows = await db.select().from(credentialResource).execute() as CredentialRow[]
  return { credentialRows, providerRows: [], modelRows: [] }
}

function providerIdFromCredential(row: Partial<CredentialRow> & Record<string, unknown>, aiRuntime: AiRuntime): string {
  return aiRuntime.normalizeAIConfigProviderId(String(row.provider ?? row.id ?? ''))
}

function modelIdFromRef(value: unknown, aiRuntime: AiRuntime): string {
  return typeof value === 'string' ? aiRuntime.normalizeAIConfigResourceId(value) : ''
}

async function findProviderRow(db: SolidDatabase, providerId: string): Promise<AIProviderRow | null> {
  if (!providerId) return null
  return await db.findById(aiProviderResource, providerId) as AIProviderRow | null
}

async function findProviderSelectedModel(
  db: SolidDatabase,
  providerId: string,
  providerRow: AIProviderRow | null,
  aiRuntime: AiRuntime,
): Promise<AIModelRow | null> {
  const modelId = modelIdFromRef(providerRow?.hasModel, aiRuntime)
  if (!providerId || !modelId) return null

  const providerRef = aiRuntime.aiConfigProviderRef(providerId)
  const modelResourceId = db.resolveLocatorId(aiModelResource, {
    id: modelId,
    isProvidedBy: providerRef,
  })
  return await db.findById(aiModelResource, modelResourceId) as AIModelRow | null
}

async function loadTargetedAiConfigRows(
  db: SolidDatabase,
  aiRuntime: AiRuntime,
  options: AiConfigRowsOptions = {},
): Promise<AiConfigRows> {
  const credentialRows = await db.select().from(credentialResource).execute() as CredentialRow[]
  const providerIds = new Set<string>()

  if (options.providerId) {
    providerIds.add(options.providerId)
  } else {
    for (const row of credentialRows) {
      const providerId = providerIdFromCredential(row, aiRuntime)
      if (providerId) providerIds.add(providerId)
    }
  }

  const providerRows: AIProviderRow[] = []
  const modelRows: AIModelRow[] = []

  for (const providerId of providerIds) {
    const providerRow = await findProviderRow(db, providerId)
    if (!providerRow) continue
    providerRows.push(providerRow)

    if (options.includeSelectedModel) {
      const modelRow = await findProviderSelectedModel(db, providerId, providerRow, aiRuntime)
      if (modelRow) modelRows.push(modelRow)
    }
  }

  return { credentialRows, providerRows, modelRows }
}

async function upsertById(
  db: SolidDatabase,
  resource: Parameters<SolidDatabase['findById']>[0],
  id: string,
  insert: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<void> {
  const existing = await db.findById(resource, id)
  if (!existing) {
    await db.insert(resource).values(insert).execute()
    return
  }
  await db.updateById(resource, id, update)
}

async function deleteByIdIfExists(
  db: SolidDatabase,
  resource: Parameters<SolidDatabase['findById']>[0],
  id: string,
): Promise<void> {
  const existing = await db.findById(resource, id)
  if (existing) {
    await db.deleteById(resource, id)
  }
}

function requestInputToUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

export async function connectAiProviderCredential(
  input: ConnectAiProviderCredentialInput,
  dependencies: AiCommandDependencies = {},
): Promise<ConnectAiProviderCredentialResult> {
  const aiRuntime = dependencies.aiRuntime ?? await loadAiRuntime()
  const podContext = await (dependencies.resolvePodWriteContext ?? resolvePodWriteContext)(input.url)
  const db = (dependencies.createDb ?? createAiConfigDb)(podContext)
  const upsert = dependencies.upsertById ?? upsertById
  const removeIfExists = dependencies.deleteByIdIfExists ?? deleteByIdIfExists
  const providerArg = input.provider.trim()
  if (!providerArg) {
    throw new Error('Usage: linx ai connect <provider> --api-key <key>')
  }

  const provider = aiRuntime.normalizeAIConfigProviderId(providerArg)
  const { credentialRows, providerRows, modelRows } = dependencies.loadAiConfigRows
    ? await dependencies.loadAiConfigRows(db)
    : await loadTargetedAiConfigRows(db, aiRuntime, {
        providerId: provider,
        includeSelectedModel: true,
      })

  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new Error('API key is required')
  }
  const modelId = input.model?.trim()
  const plan = aiRuntime.buildAIConfigMutationPlan({
    providerId: provider,
    currentProviderRows: providerRows,
    currentCredentialRows: credentialRows,
    currentModelRows: modelRows,
    updates: {
      enabled: true,
      apiKey,
      baseUrl: input.baseUrl?.trim() || undefined,
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
    await upsert(db, aiProviderResource, plan.providerPayload.id, plan.providerPayload, {
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
    await upsert(db, credentialResource, plan.credentialPayload.id, plan.credentialPayload, {
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
    const modelResourceId = db.resolveLocatorId(aiModelResource, {
      id: modelPayload.id,
      isProvidedBy: modelPayload.isProvidedBy,
    })
    await upsert(db, aiModelResource, modelResourceId, modelPayload, {
      displayName: modelPayload.displayName,
      modelType: modelPayload.modelType,
      isProvidedBy: modelPayload.isProvidedBy,
      status: modelPayload.status,
      updatedAt: modelPayload.updatedAt,
    })
  }

  for (const modelIdToDelete of plan.modelDeleteIds) {
    const providerRef = aiRuntime.aiConfigProviderRef(plan.providerId)
    const modelResourceId = db.resolveLocatorId(aiModelResource, {
      id: modelIdToDelete,
      isProvidedBy: providerRef,
    })
    await removeIfExists(db, aiModelResource, modelResourceId)
  }

  return {
    providerId: plan.providerId,
    ...(modelId ? { modelId: aiRuntime.normalizeAIConfigResourceId(modelId) } : {}),
    maskedApiKey: maskSecret(apiKey),
  }
}

export async function runAiCommand(argv: AiArgs, dependencies: AiCommandDependencies = {}): Promise<void> {
  const action = argv.action
  const aiRuntime = dependencies.aiRuntime ?? await loadAiRuntime()
  const write = dependencies.write ?? ((chunk: string) => process.stdout.write(chunk))
  const deleteIfExists = dependencies.deleteByIdIfExists ?? deleteByIdIfExists
  const getApiKey = dependencies.requireApiKey ?? requireApiKey

  if (action === 'status') {
    const podContext = await (dependencies.resolvePodWriteContext ?? resolvePodWriteContext)(argv.url)
    const db = (dependencies.createDb ?? createAiConfigDb)(podContext)
    const provider = argv.provider ? aiRuntime.normalizeAIConfigProviderId(argv.provider) : undefined
    const { credentialRows, providerRows, modelRows } = dependencies.loadAiConfigRows
      ? await dependencies.loadAiConfigRows(db)
      : await loadTargetedAiConfigRows(db, aiRuntime, {
          providerId: provider,
          includeSelectedModel: true,
        })
    const states = aiRuntime.buildAIConfigProviderStateMap({
      fallbackToCatalogModels: false,
      credentialRows,
      providerRows,
      modelRows,
    })

    const filtered = Object.values(states).filter((state) => {
      if (!state.apiKey) return false
      if (!argv.provider) return true
      return provider === state.id
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

  if (action === 'disconnect') {
    const podContext = await (dependencies.resolvePodWriteContext ?? resolvePodWriteContext)(argv.url)
    const db = (dependencies.createDb ?? createAiConfigDb)(podContext)
    const provider = aiRuntime.normalizeAIConfigProviderId(providerArg)
    const { credentialRows } = dependencies.loadAiConfigRows
      ? await dependencies.loadAiConfigRows(db)
      : await loadTargetedAiConfigRows(db, aiRuntime, {
          providerId: provider,
          includeSelectedModel: false,
        })
    const plan = aiRuntime.buildAIConfigDisconnectPlan({
      providerId: provider,
      currentCredentialRows: credentialRows,
    })
    for (const credentialId of plan.credentialDeleteIds) {
      await deleteIfExists(db, credentialResource, credentialId)
    }

    write(`Disconnected AI provider: ${plan.providerId}\n`)
    return
  }

  const result = await connectAiProviderCredential({
    provider: providerArg,
    apiKey: await getApiKey(argv),
    baseUrl: argv['base-url'],
    model: argv.model,
    url: argv.url,
  }, dependencies)

  const metadata = aiRuntime.getAIConfigProviderMetadata(result.providerId)
  write(`Connected AI provider: ${metadata.id}\n`)
  if (result.modelId) {
    write(`model: ${result.modelId}\n`)
  }
  write(`api-key: ${result.maskedApiKey}\n`)
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
