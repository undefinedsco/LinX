import type { CommandModule } from 'yargs'
import { createLinxPodSyncScope, type LinxSyncOperationKind, type LinxSyncRunResult } from '@linx/agent-runtime/sync'
import {
  aiConfigModelUri,
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
import { createPodDataSession, type PodDataSession } from './pod-data-session.js'
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
      supportsBackend?: string
      rotationPolicy?: string
      credentialId?: string
      credentialLabel?: string
      credentialBaseUrl?: string
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
      supportsBackend?: string
      rotationPolicy?: string
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
  resolvePodWriteContext?: (urlOverride?: string) => Promise<PodDataSession>
  createDb?: (context: PodDataSession) => SolidDatabase
  loadAiConfigRows?: (db: SolidDatabase) => Promise<AiConfigRows>
  upsertById?: typeof upsertById
  deleteByIdIfExists?: typeof deleteByIdIfExists
  requireApiKey?: (argv: AiArgs) => Promise<string>
  write?: (chunk: string) => void
  syncNow?: () => Date
  onSyncResult?: (result: LinxSyncRunResult) => void
}

export interface ConnectAiProviderCredentialInput {
  provider: string
  apiKey: string
  baseUrl?: string
  credentialId?: string
  credentialLabel?: string
  credentialBaseUrl?: string
  supportsBackend?: string
  rotationPolicy?: string
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

async function resolvePodWriteContext(_urlOverride?: string): Promise<PodDataSession> {
  const podSession = await createPodDataSession()
  if (!podSession) {
    throw new Error('No LinX Solid session found. Run `linx login` first.')
  }
  return podSession
}

async function resolveAiPodWriteContext(
  dependencies: Pick<AiCommandDependencies, 'resolvePodWriteContext'>,
  urlOverride?: string,
): Promise<{ context: PodDataSession; close?: () => Promise<void> }> {
  if (dependencies.resolvePodWriteContext) {
    return { context: await dependencies.resolvePodWriteContext(urlOverride) }
  }

  const context = await resolvePodWriteContext(urlOverride)
  return {
    context,
    close: () => context.close(),
  }
}

async function closeAiPodWriteContext(resolved: { close?: () => Promise<void> } | undefined): Promise<void> {
  await resolved?.close?.().catch(() => undefined)
}

function createAiConfigDb(context: PodDataSession): SolidDatabase {
  return drizzle(context.solidSession, {
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
  const modelResourceId = aiModelResource.buildId({
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

async function runAiConfigControlSync<T>(
  input: {
    action: string
    kind: LinxSyncOperationKind
    providerId?: string
    modelId?: string
  },
  dependencies: AiCommandDependencies,
  mutate: () => T | Promise<T>,
): Promise<T> {
  const sync = createLinxPodSyncScope({
    source: 'cli-ai-command',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'control-plane',
    authority: 'core',
    now: dependencies.syncNow,
    onResult(result) {
      dependencies.onSyncResult?.(result)
    },
  })

  return await sync.run({
    action: input.action,
    operationId: nextAiConfigSyncOperationId(input, dependencies),
    kind: input.kind,
    description: `ai-command:${input.action}`,
    subject: input.modelId ?? input.providerId,
    resourceBindings: {
      provider: input.providerId
        ? { uri: aiConfigProviderRef(input.providerId), local: input.providerId }
        : undefined,
      model: input.providerId && input.modelId
        ? { uri: aiConfigModelUri(input.modelId, input.providerId), local: input.modelId }
        : undefined,
    },
    task: mutate,
  })
}

function nextAiConfigSyncOperationId(
  input: { action: string; providerId?: string; modelId?: string },
  dependencies: Pick<AiCommandDependencies, 'syncNow'>,
): string {
  const subject = input.modelId ?? input.providerId ?? 'ai-config'
  const timestamp = (dependencies.syncNow?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
  return `ai-command:${input.action}:${subject}:${timestamp}`
}

export async function connectAiProviderCredential(
  input: ConnectAiProviderCredentialInput,
  dependencies: AiCommandDependencies = {},
): Promise<ConnectAiProviderCredentialResult> {
  const aiRuntime = dependencies.aiRuntime ?? await loadAiRuntime()
  const resolvedPodContext = await resolveAiPodWriteContext(dependencies, input.url)
  try {
    const db = (dependencies.createDb ?? createAiConfigDb)(resolvedPodContext.context)
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
        credentialId: input.credentialId?.trim() || undefined,
        credentialLabel: input.credentialLabel?.trim() || undefined,
        credentialBaseUrl: input.credentialBaseUrl?.trim() || undefined,
        supportsBackend: input.supportsBackend?.trim() || undefined,
        rotationPolicy: input.rotationPolicy?.trim() || undefined,
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

    const normalizedModelId = modelId ? aiRuntime.normalizeAIConfigResourceId(modelId) : undefined

    await runAiConfigControlSync({
      action: 'ai.connect',
      kind: 'upsert',
      providerId: plan.providerId,
      modelId: normalizedModelId,
    }, dependencies, async () => {
      if (plan.providerPayload?.id) {
        const providerUpdate = pruneUndefined({
          baseUrl: plan.providerPayload.baseUrl,
          proxyUrl: plan.providerPayload.proxyUrl,
          hasModel: plan.providerPayload.hasModel,
          supportsBackend: plan.providerPayload.supportsBackend,
          rotationPolicy: plan.providerPayload.rotationPolicy,
        })
        await upsert(db, aiProviderResource, plan.providerPayload.id, plan.providerPayload, providerUpdate)
      }

      if (
        plan.credentialPayload?.id
        && plan.credentialPayload.provider
        && plan.credentialPayload.service
        && plan.credentialPayload.status
      ) {
        const credentialUpdate = pruneUndefined({
          provider: plan.credentialPayload.provider,
          service: plan.credentialPayload.service,
          status: plan.credentialPayload.status,
          apiKey: plan.credentialPayload.apiKey,
          baseUrl: plan.credentialPayload.baseUrl,
          label: plan.credentialPayload.label,
        })
        await upsert(db, credentialResource, plan.credentialPayload.id, plan.credentialPayload, credentialUpdate)
      }

      for (const modelPayload of plan.modelUpserts) {
        if (!modelPayload.id || !modelPayload.isProvidedBy || !modelPayload.createdAt || !modelPayload.updatedAt) {
          continue
        }
        const modelResourceId = aiModelResource.buildId({
          id: modelPayload.id,
          isProvidedBy: modelPayload.isProvidedBy,
        })
        await upsert(db, aiModelResource, modelResourceId, {
          ...modelPayload,
          id: modelResourceId,
        }, {
          displayName: modelPayload.displayName,
          modelType: modelPayload.modelType,
          isProvidedBy: modelPayload.isProvidedBy,
          status: modelPayload.status,
          updatedAt: modelPayload.updatedAt,
        })
      }

      for (const modelIdToDelete of plan.modelDeleteIds) {
        const providerRef = aiRuntime.aiConfigProviderRef(plan.providerId)
        const modelResourceId = aiModelResource.buildId({
          id: modelIdToDelete,
          isProvidedBy: providerRef,
        })
        await removeIfExists(db, aiModelResource, modelResourceId)
      }
    })

    return {
      providerId: plan.providerId,
      ...(normalizedModelId ? { modelId: normalizedModelId } : {}),
      maskedApiKey: maskSecret(apiKey),
    }
  } finally {
    await closeAiPodWriteContext(resolvedPodContext)
  }
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

export async function runAiCommand(argv: AiArgs, dependencies: AiCommandDependencies = {}): Promise<void> {
  const action = argv.action
  const aiRuntime = dependencies.aiRuntime ?? await loadAiRuntime()
  const write = dependencies.write ?? ((chunk: string) => process.stdout.write(chunk))
  const deleteIfExists = dependencies.deleteByIdIfExists ?? deleteByIdIfExists
  const getApiKey = dependencies.requireApiKey ?? requireApiKey

  if (action === 'status') {
    const resolvedPodContext = await resolveAiPodWriteContext(dependencies, argv.url)
    try {
      const db = (dependencies.createDb ?? createAiConfigDb)(resolvedPodContext.context)
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
    } finally {
      await closeAiPodWriteContext(resolvedPodContext)
    }
  }

  const providerArg = argv.provider?.trim()
  if (!providerArg) {
    throw new Error(action === 'disconnect'
      ? 'Usage: linx ai disconnect <provider>'
      : 'Usage: linx ai connect <provider> --api-key <key>')
  }

  if (action === 'disconnect') {
    const resolvedPodContext = await resolveAiPodWriteContext(dependencies, argv.url)
    try {
      const db = (dependencies.createDb ?? createAiConfigDb)(resolvedPodContext.context)
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
      await runAiConfigControlSync({
        action: 'ai.disconnect',
        kind: 'delete',
        providerId: plan.providerId,
      }, dependencies, async () => {
        for (const credentialId of plan.credentialDeleteIds) {
          await deleteIfExists(db, credentialResource, credentialId)
        }
      })

      write(`Disconnected AI provider: ${plan.providerId}\n`)
      return
    } finally {
      await closeAiPodWriteContext(resolvedPodContext)
    }
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
