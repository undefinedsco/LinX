import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
  aiModelResource,
  aiProviderResource,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  credentialResource,
  getAIConfigProviderMetadata,
  normalizeAIConfigModelId,
  normalizeAIConfigProviderId,
  sameAIConfigProviderFamily,
  selectAIConfigCredential,
} from '@undefineds.co/models'
import { deleteExactRecord, updateExactRecord } from '@linx/stores/exact-records'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  credentialCollection,
  providerCollection,
  modelCollection,
} from '../collections'
import { getModelProviderTemplate } from '../constants'
import type { AIProvider, AIModel } from '../types'

type AnyRow = Record<string, any>
const COLLECTION_READY_TIMEOUT_MS = 10_000
const PERSIST_OPERATION_TIMEOUT_MS = 15_000
const COLLECTION_REFETCH_TIMEOUT_MS = 5_000

export function buildModelServiceInsertRows(plan: ReturnType<typeof buildAIConfigMutationPlan>) {
  const providerPayload = plan.providerPayload
    ? {
        ...plan.providerPayload,
        id: aiProviderResource.buildId({ id: plan.providerId }),
      }
    : undefined
  const credentialPayload = plan.credentialPayload?.id
    ? {
        ...plan.credentialPayload,
        id: credentialResource.buildId({ id: plan.credentialPayload.id }),
        // Keep the credential relation inside the owning user's Pod. Passing
        // the shared plan's canonical `/settings/...` reference directly to
        // drizzle-solid resolves it against the xpod server root instead.
        provider: plan.providerId,
      }
    : undefined
  const modelPayloads = plan.modelUpserts.map((model) => ({
    ...model,
    id: aiModelResource.buildId({
      id: model.id,
      isProvidedBy: model.isProvidedBy,
    }),
    // drizzle-solid resolves linked resource IDs against the owning Pod.
    // The shared mutation plan exposes a canonical `/settings/...` reference,
    // which would resolve against the server root and place the relation
    // outside a user's Pod when passed directly to an insert.
    isProvidedBy: plan.providerId,
  }))

  return { providerPayload, credentialPayload, modelPayloads }
}

export function normalizeLiveQueryRows<T extends AnyRow>(rows: T[] | undefined): T[] {
  return rows?.filter(Boolean) ?? []
}

export function mergeModelServiceCredentialRows(
  queriedRows: AnyRow[],
  exactRows: AnyRow[],
): AnyRow[] {
  const merged = [...queriedRows]
  for (const exactRow of exactRows) {
    const exactId = String(exactRow.id ?? '')
    const exactFragment = exactId.split('#').pop()?.replace(/\.ttl$/, '') ?? exactId
    const index = merged.findIndex((row) => {
      const rowId = String(row.id ?? '')
      const rowFragment = rowId.split('#').pop()?.replace(/\.ttl$/, '') ?? rowId
      if (rowFragment === exactFragment) return true
      const rowProvider = String(row.provider ?? '')
      const exactProvider = String(exactRow.provider ?? '')
      return Boolean(rowProvider && exactProvider && sameAIConfigProviderFamily(rowProvider, exactProvider))
    })
    if (index >= 0) merged[index] = { ...merged[index], ...exactRow }
    else merged.push(exactRow)
  }
  return merged
}

export function mergeModelServiceProviderRows(
  queriedRows: AnyRow[],
  exactRows: AnyRow[],
): AnyRow[] {
  const merged = [...queriedRows]
  for (const exactRow of exactRows) {
    const exactId = String(exactRow.id ?? '')
    const index = merged.findIndex((row) =>
      sameAIConfigProviderFamily(String(row.id ?? ''), exactId),
    )
    if (index >= 0) merged[index] = { ...merged[index], ...exactRow }
    else merged.push(exactRow)
  }
  return merged
}

export function buildCredentialVerificationUpdate(
  credential: AnyRow,
  error?: unknown,
): AnyRow {
  const currentFailCount = typeof credential.failCount === 'number' ? credential.failCount : 0

  // xpod's exact-record update rewrites the RDF subject from the supplied
  // values. Keep the credential fields in the payload so recording health
  // does not erase its key, provider relation, label, or enabled state.
  return {
    ...credential,
    ...(error
      ? { failCount: currentFailCount + 1 }
      : { failCount: 0, lastUsedAt: new Date() }),
  }
}

export function buildModelServiceExactUpdate(
  current: AnyRow,
  updates: AnyRow,
): AnyRow {
  // xpod currently materializes updateById as a subject replacement. Mutation
  // plans intentionally contain only changed fields, so sending a plan payload
  // directly would erase every unchanged RDF predicate on that subject.
  return { ...current, ...updates }
}

export function collectKnownModelServiceProviderIds(
  providerRows: AnyRow[],
  credentialRows: AnyRow[],
  modelRows: AnyRow[],
): string[] {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    const id = normalizeAIConfigProviderId(String(value ?? ''))
    if (id) ids.add(id)
  }
  providerRows.forEach((row) => add(row.id))
  modelRows.forEach((row) => add(row.isProvidedBy))
  credentialRows.forEach((row) => {
    if (row.provider) add(row.provider)
    const fragment = String(row.id ?? '').split('#').pop()?.replace(/\.ttl$/, '') ?? ''
    if (fragment.endsWith('-default')) add(fragment.slice(0, -'-default'.length))
  })
  return [...ids]
}

export function recoverModelServiceProviderRows(
  providerRows: AnyRow[],
  credentialRows: AnyRow[],
  modelRows: AnyRow[],
): AnyRow[] {
  const recovered = [...providerRows]
  const known = new Set(
    providerRows
      .map((row) => normalizeAIConfigProviderId(String(row.id ?? '')))
      .filter(Boolean),
  )

  const candidates = new Map<string, AnyRow>()
  for (const credential of credentialRows) {
    const id = normalizeAIConfigProviderId(String(credential.provider ?? ''))
    if (!id || known.has(id)) continue
    candidates.set(id, {
      id,
      displayName: typeof credential.label === 'string' ? credential.label : id,
      baseUrl: credential.baseUrl,
      proxyUrl: credential.proxyUrl,
    })
  }
  for (const model of modelRows) {
    const id = normalizeAIConfigProviderId(String(model.isProvidedBy ?? ''))
    if (!id || known.has(id) || candidates.has(id)) continue
    candidates.set(id, { id })
  }

  recovered.push(...candidates.values())
  return recovered
}

function logModelServicesPersist(event: string, detail?: Record<string, unknown>) {
  console.info(`[ModelServices:Persist] ${event}`, detail ?? {})
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function ensureCollectionReady(collection: any, label: string) {
  if (typeof collection?.isReady === 'function' && collection.isReady()) {
    logModelServicesPersist('collection_already_ready', { collection: label })
    return
  }

  if (typeof collection?.preload !== 'function') {
    logModelServicesPersist('collection_preload_unavailable', { collection: label })
    return
  }

  logModelServicesPersist('collection_preload_started', { collection: label })
  await withTimeout(
    collection.preload(),
    COLLECTION_READY_TIMEOUT_MS,
    `${label} 数据准备超时，请回到模型服务页面后重试。`,
  )
  logModelServicesPersist('collection_preload_succeeded', { collection: label })
}

async function ensureModelServiceCollectionsReady() {
  await Promise.all([
    ensureCollectionReady(credentialCollection, 'ai-credentials'),
    ensureCollectionReady(providerCollection, 'ai-providers'),
    ensureCollectionReady(modelCollection, 'ai-models'),
  ])
}

function collectionRows(collection: any, fallback: AnyRow[]): AnyRow[] {
  return Array.isArray(collection?.toArray) ? collection.toArray : fallback
}

async function refetchCollection(collection: any, label: string) {
  const refetch = collection?.utils?.refetch
  if (typeof refetch !== 'function') return
  try {
    await withTimeout(
      Promise.resolve(refetch.call(collection.utils)),
      COLLECTION_REFETCH_TIMEOUT_MS,
      `${label} 刷新超时`,
    )
    logModelServicesPersist('collection_refetch_succeeded', { collection: label })
  } catch (error) {
    logModelServicesPersist('collection_refetch_failed', {
      collection: label,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function refetchModelServiceCollections() {
  await Promise.all([
    refetchCollection(credentialCollection, 'ai-credentials'),
    refetchCollection(providerCollection, 'ai-providers'),
    refetchCollection(modelCollection, 'ai-models'),
  ])
}

export function useModelServices() {
  const { db } = useSolidDatabase()
  const [exactCredentialRows, setExactCredentialRows] = useState<AnyRow[]>([])
  const [exactProviderRows, setExactProviderRows] = useState<AnyRow[]>([])

  useEffect(() => {
    if (!db) return

    credentialCollection.startSyncImmediate()
    providerCollection.startSyncImmediate()
    modelCollection.startSyncImmediate()

    // These collections are module-level singletons and may already be ready
    // with an empty snapshot from the logged-out phase. Starting sync does not
    // refetch an already-ready query, so refresh explicitly whenever the active
    // Solid database becomes available or changes.
    void refetchModelServiceCollections()
  }, [db])

  const { data: rawCredentialRows } = useLiveQuery((q) => q.from({ c: credentialCollection }))
  const { data: rawProviderRows } = useLiveQuery((q) => q.from({ p: providerCollection }))
  const { data: rawModelRows } = useLiveQuery((q) => q.from({ m: modelCollection }))

  const credentialRows = useMemo(
    () => normalizeLiveQueryRows(rawCredentialRows as AnyRow[] | undefined),
    [rawCredentialRows],
  )
  const providerRows = useMemo(
    () => normalizeLiveQueryRows(rawProviderRows as AnyRow[] | undefined),
    [rawProviderRows],
  )
  const modelRows = useMemo(
    () => normalizeLiveQueryRows(rawModelRows as AnyRow[] | undefined),
    [rawModelRows],
  )

  const knownProviderIds = useMemo(() => {
    return collectKnownModelServiceProviderIds(providerRows, credentialRows, modelRows)
  }, [credentialRows, modelRows, providerRows])

  useEffect(() => {
    if (!db || knownProviderIds.length === 0) {
      setExactCredentialRows([])
      return
    }

    let cancelled = false
    void Promise.all(knownProviderIds.map(async (providerId) => {
      const resourceId = credentialResource.buildId({ id: `${providerId}-default` })
      try {
        return await (db as any).findById(credentialResource, resourceId)
      } catch {
        return null
      }
    })).then((rows) => {
      if (!cancelled) setExactCredentialRows(rows.filter(Boolean) as AnyRow[])
    })

    return () => { cancelled = true }
  }, [db, knownProviderIds])

  useEffect(() => {
    if (!db || knownProviderIds.length === 0) {
      setExactProviderRows([])
      return
    }

    let cancelled = false
    void Promise.all(knownProviderIds.map(async (providerId) => {
      const resourceId = aiProviderResource.buildId({ id: providerId })
      try {
        return await (db as any).findById(aiProviderResource, resourceId)
      } catch {
        return null
      }
    })).then((rows) => {
      if (!cancelled) setExactProviderRows(rows.filter(Boolean) as AnyRow[])
    })

    return () => { cancelled = true }
  }, [db, knownProviderIds])

  const effectiveCredentialRows = useMemo(
    () => mergeModelServiceCredentialRows(credentialRows, exactCredentialRows),
    [credentialRows, exactCredentialRows],
  )

  const mergedProviderRows = useMemo(
    () => mergeModelServiceProviderRows(providerRows, exactProviderRows),
    [exactProviderRows, providerRows],
  )

  const effectiveProviderRows = useMemo(
    () => recoverModelServiceProviderRows(mergedProviderRows, effectiveCredentialRows, modelRows),
    [effectiveCredentialRows, mergedProviderRows, modelRows],
  )

  const providerStates = useMemo(
    () =>
      buildAIConfigProviderStateMap({
        catalog: [],
        fallbackToCatalogModels: false,
        providerRows: effectiveProviderRows,
        credentialRows: effectiveCredentialRows,
        modelRows,
      }),
    [effectiveCredentialRows, effectiveProviderRows, modelRows],
  )

  const providers = useMemo(() => {
    const merged: Record<string, AIProvider> = {}

    Object.values(providerStates).forEach((providerState) => {
      const providerRow = effectiveProviderRows.find((row) =>
        sameAIConfigProviderFamily(typeof row.id === 'string' ? row.id : '', providerState.id),
      )
      const template = getModelProviderTemplate(providerState.id)
      const metadata = getAIConfigProviderMetadata(providerState.id)
      const credential = selectAIConfigCredential(
        providerState.id,
        effectiveCredentialRows,
        mergedProviderRows,
      )?.credential
      const failCount = typeof credential?.failCount === 'number' ? credential.failCount : 0
      const verificationStatus = failCount > 0
        ? 'failed'
        : credential?.lastUsedAt
          ? 'available'
          : 'unverified'
      const providerName =
        (typeof providerRow?.displayName === 'string' && providerRow.displayName.trim())
          ? providerRow.displayName.trim()
          : template?.name || metadata.displayName || providerState.id
      const defaultModels: AIModel[] = (template?.defaultModels || metadata.defaultModels || []).map((modelId) => ({
        id: modelId,
        name: modelId,
        enabled: true,
        capabilities: [],
      }))

      merged[providerState.id] = {
        ...providerState,
        id: providerState.id,
        name: providerName,
        description: template?.description,
        avatar: template?.avatar,
        icon: template?.icon,
        homeUrl: template?.homeUrl,
        docsUrl: template?.docsUrl,
        apiKeyUrl: template?.apiKeyUrl,
        modelsUrl: template?.modelsUrl,
        modelsApi: template?.modelsApi,
        defaultBaseUrl: template?.defaultBaseUrl || metadata.defaultBaseUrl,
        defaultApiKeyPlaceholder: template?.defaultApiKeyPlaceholder,
        defaultModels: template?.defaultModels || metadata.defaultModels,
        apiKey: providerState?.apiKey || '',
        baseUrl:
          (typeof providerRow?.baseUrl === 'string' && providerRow.baseUrl.trim()
            ? providerRow.baseUrl.trim()
            : providerState?.baseUrl) || template?.defaultBaseUrl || metadata.defaultBaseUrl,
        models: providerState?.models?.length ? providerState.models : defaultModels,
        verificationStatus,
      }
    })

    return merged
  }, [effectiveCredentialRows, effectiveProviderRows, mergedProviderRows, providerStates])

  const updateProvider = useCallback(async (id: string, updates: Partial<AIProvider>) => {
    if (!db) throw new Error('Solid database is not ready.')

    logModelServicesPersist('update_provider_called', {
      providerId: id,
      hasApiKey: typeof updates.apiKey === 'string' && updates.apiKey.length > 0,
      apiKeyLength: typeof updates.apiKey === 'string' ? updates.apiKey.length : 0,
      baseUrl: updates.baseUrl,
      enabled: updates.enabled,
      modelCount: updates.models?.length ?? 0,
    })

    let currentProviderRows = mergeModelServiceProviderRows(
      collectionRows(providerCollection, mergedProviderRows),
      exactProviderRows,
    )
    let currentCredentialRows = mergeModelServiceCredentialRows(
      collectionRows(credentialCollection, effectiveCredentialRows),
      exactCredentialRows,
    )
    let currentModelRows = collectionRows(modelCollection, modelRows)
    const isNewProvider = !currentProviderRows.some((row) =>
      sameAIConfigProviderFamily(typeof row.id === 'string' ? row.id : '', id),
    )

    // A unique new provider cannot collide with existing rows, so waiting for
    // every collection preload only delays the first save and can deadlock on
    // an unrelated collection. Existing providers still require fresh rows.
    if (!isNewProvider) {
      await ensureModelServiceCollectionsReady()
      currentProviderRows = mergeModelServiceProviderRows(
        collectionRows(providerCollection, mergedProviderRows),
        exactProviderRows,
      )
      currentCredentialRows = mergeModelServiceCredentialRows(
        collectionRows(credentialCollection, effectiveCredentialRows),
        exactCredentialRows,
      )
      currentModelRows = collectionRows(modelCollection, modelRows)
    } else {
      logModelServicesPersist('collection_preload_skipped_for_new_provider', { providerId: id })
    }

    logModelServicesPersist('collection_rows_ready', {
      providerCount: currentProviderRows.length,
      credentialCount: currentCredentialRows.length,
      modelCount: currentModelRows.length,
    })

    const plan = buildAIConfigMutationPlan({
      providerId: id,
      currentProviderRows,
      currentCredentialRows,
      currentModelRows,
      updates,
    })
    const displayName = typeof updates.name === 'string' ? updates.name.trim() : ''
    if (displayName && plan.providerPayload) {
      ;(plan.providerPayload as AnyRow).displayName = displayName
    }
    const credentialLabel = typeof updates.credentialLabel === 'string' ? updates.credentialLabel.trim() : ''
    if (plan.credentialPayload && (credentialLabel || displayName)) {
      ;(plan.credentialPayload as AnyRow).label = credentialLabel || displayName
    }

    const existingProvider = currentProviderRows.find((row) =>
      sameAIConfigProviderFamily(typeof row.id === 'string' ? row.id : '', plan.providerId),
    )
    const existingCredential = currentCredentialRows.find((row) =>
      sameAIConfigProviderFamily(typeof row.provider === 'string' ? row.provider : '', plan.providerId),
    )
    const selectedCredential = selectAIConfigCredential(plan.providerId, currentCredentialRows, currentProviderRows)?.credential
    const credentialTarget = selectedCredential ?? existingCredential
    const existingModels = currentModelRows.filter((row) =>
      sameAIConfigProviderFamily(typeof row.isProvidedBy === 'string' ? row.isProvidedBy : '', plan.providerId),
    )
    const insertRows = buildModelServiceInsertRows(plan)

    logModelServicesPersist('mutation_plan_built', {
      providerId: plan.providerId,
      hasProviderPayload: Boolean(plan.providerPayload),
      hasCredentialPayload: Boolean(plan.credentialPayload),
      modelUpsertCount: plan.modelUpserts.length,
      modelDeleteCount: plan.modelDeleteIds.length,
      existingModelCount: existingModels.length,
    })

    if (plan.providerPayload) {
      logModelServicesPersist('provider_persist_started', {
        providerId: plan.providerId,
        mode: existingProvider ? 'update' : 'insert',
      })
      if (existingProvider) {
        await withTimeout(
          updateExactRecord(
            db as any,
            aiProviderResource as any,
            existingProvider,
            buildModelServiceExactUpdate(existingProvider, plan.providerPayload as AnyRow),
          ),
          PERSIST_OPERATION_TIMEOUT_MS,
          '供应商配置保存超时，请重试。',
        )
      } else {
        await withTimeout(
          (db as any).insert(aiProviderResource).values(insertRows.providerPayload).execute(),
          PERSIST_OPERATION_TIMEOUT_MS,
          '供应商配置保存超时，请重试。',
        )
      }
      logModelServicesPersist('provider_persist_succeeded', {
        providerId: plan.providerId,
        mode: existingProvider ? 'update' : 'insert',
      })
    }

    if (plan.credentialPayload) {
      logModelServicesPersist('credential_persist_started', {
        providerId: plan.providerId,
        mode: credentialTarget ? 'update' : 'insert',
      })
      if (credentialTarget) {
        await withTimeout(
          updateExactRecord(
            db as any,
            credentialResource as any,
            credentialTarget,
            buildModelServiceExactUpdate(credentialTarget, insertRows.credentialPayload as AnyRow),
          ),
          PERSIST_OPERATION_TIMEOUT_MS,
          '访问密钥保存超时，请重试。',
        )
      } else {
        await withTimeout(
          (db as any).insert(credentialResource).values(insertRows.credentialPayload).execute(),
          PERSIST_OPERATION_TIMEOUT_MS,
          '访问密钥保存超时，请重试。',
        )
      }
      logModelServicesPersist('credential_persist_succeeded', {
        providerId: plan.providerId,
        mode: credentialTarget ? 'update' : 'insert',
      })
    }

    if (plan.modelUpserts.length > 0 || plan.modelDeleteIds.length > 0) {
      const existingById = new Map(
        existingModels
          .filter((row) => typeof row.id === 'string' && row.id.length > 0)
          .map((row) => [normalizeAIConfigModelId(row.id as string, plan.providerId), row] as const),
      )

      if (existingModels.length === 0 && insertRows.modelPayloads.length > 0) {
        logModelServicesPersist('models_batch_persist_started', {
          providerId: plan.providerId,
          modelCount: insertRows.modelPayloads.length,
        })
        await withTimeout(
          (db as any).insert(aiModelResource).values(insertRows.modelPayloads).execute(),
          PERSIST_OPERATION_TIMEOUT_MS,
          '模型列表保存超时，请重试。',
        )
        logModelServicesPersist('models_batch_persist_succeeded', {
          providerId: plan.providerId,
          modelCount: insertRows.modelPayloads.length,
        })
      } else for (const [index, modelPayload] of plan.modelUpserts.entries()) {
        if (!modelPayload.id) continue
        const existing = existingById.get(modelPayload.id)
        logModelServicesPersist('model_persist_started', {
          providerId: plan.providerId,
          modelId: modelPayload.id,
          mode: existing ? 'update' : 'insert',
        })
        if (existing) {
          await withTimeout(
            updateExactRecord(
              db as any,
              aiModelResource as any,
              existing,
              buildModelServiceExactUpdate(existing, modelPayload as AnyRow),
            ),
            PERSIST_OPERATION_TIMEOUT_MS,
            `模型 ${modelPayload.id} 保存超时，请重试。`,
          )
        } else {
          await withTimeout(
            (db as any).insert(aiModelResource).values(insertRows.modelPayloads[index]).execute(),
            PERSIST_OPERATION_TIMEOUT_MS,
            `模型 ${modelPayload.id} 保存超时，请重试。`,
          )
        }
        logModelServicesPersist('model_persist_succeeded', {
          providerId: plan.providerId,
          modelId: modelPayload.id,
          mode: existing ? 'update' : 'insert',
        })
      }

      for (const row of existingModels) {
        const modelId = typeof row.id === 'string' ? row.id : ''
        const normalizedModelId = normalizeAIConfigModelId(modelId, plan.providerId)
        if (!plan.modelDeleteIds.includes(normalizedModelId)) continue
        logModelServicesPersist('model_delete_started', {
          providerId: plan.providerId,
          modelId: normalizedModelId,
        })
        await deleteExactRecord(db as any, aiModelResource as any, row)
        logModelServicesPersist('model_delete_succeeded', {
          providerId: plan.providerId,
          modelId: normalizedModelId,
        })
      }
    }

    await refetchModelServiceCollections()

    logModelServicesPersist('update_provider_succeeded', {
      providerId: plan.providerId,
    })
  }, [db, effectiveCredentialRows, exactCredentialRows, exactProviderRows, mergedProviderRows, modelRows])

  const deleteProvider = useCallback(async (id: string) => {
    if (!db) throw new Error('Solid database is not ready.')
    await ensureModelServiceCollectionsReady()

    const currentProviderRows = mergeModelServiceProviderRows(
      collectionRows(providerCollection, mergedProviderRows),
      exactProviderRows,
    )
    const currentCredentialRows = mergeModelServiceCredentialRows(
      collectionRows(credentialCollection, effectiveCredentialRows),
      exactCredentialRows,
    )
    const currentModelRows = collectionRows(modelCollection, modelRows)
    const provider = currentProviderRows.find((row) =>
      sameAIConfigProviderFamily(typeof row.id === 'string' ? row.id : '', id),
    )
    const credentials = currentCredentialRows.filter((row) =>
      sameAIConfigProviderFamily(typeof row.provider === 'string' ? row.provider : '', id),
    )
    const models = currentModelRows.filter((row) =>
      sameAIConfigProviderFamily(typeof row.isProvidedBy === 'string' ? row.isProvidedBy : '', id),
    )

    for (const model of models) {
      await deleteExactRecord(db as any, aiModelResource as any, model)
    }
    for (const credential of credentials) {
      await deleteExactRecord(db as any, credentialResource as any, credential)
    }
    if (provider) {
      await deleteExactRecord(db as any, aiProviderResource as any, provider)
    }

    await refetchModelServiceCollections()
  }, [db, effectiveCredentialRows, exactCredentialRows, exactProviderRows, mergedProviderRows, modelRows])

  const recordVerificationResult = useCallback(async (id: string, error?: unknown) => {
    if (!db) throw new Error('Solid database is not ready.')
    await ensureModelServiceCollectionsReady()
    const currentProviderRows = mergeModelServiceProviderRows(
      collectionRows(providerCollection, mergedProviderRows),
      exactProviderRows,
    )
    const currentCredentialRows = mergeModelServiceCredentialRows(
      collectionRows(credentialCollection, effectiveCredentialRows),
      exactCredentialRows,
    )
    const credential = selectAIConfigCredential(id, currentCredentialRows, currentProviderRows)?.credential
    if (!credential) return

    const update = buildCredentialVerificationUpdate(credential, error)
    await updateExactRecord(db as any, credentialResource as any, credential, update as AnyRow)
    await refetchCollection(credentialCollection, 'ai-credentials')
  }, [db, effectiveCredentialRows, exactCredentialRows, exactProviderRows, mergedProviderRows])

  return {
    providers,
    updateProvider,
    deleteProvider,
    recordVerificationResult,
  }
}
