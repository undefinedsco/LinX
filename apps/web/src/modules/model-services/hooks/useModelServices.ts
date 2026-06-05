import { useCallback, useEffect, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { createLinxPodSyncScope, type LinxSyncRunResult } from '@linx/agent-runtime/sync'
import {
  aiConfigModelUri,
  aiConfigProviderRef,
  aiModelResource,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  normalizeAIConfigModelId,
  sameAIConfigProviderFamily,
  selectAIConfigCredential,
} from '@undefineds.co/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  credentialCollection,
  providerCollection,
  modelCollection,
} from '../collections'
import { MODEL_PROVIDERS } from '../constants'
import type { AIProvider, AIModel } from '../types'

type AnyRow = Record<string, any>

const modelServicesSyncResults: LinxSyncRunResult[] = []
let modelServicesSyncSeq = 0

export function getModelServicesSyncResults(): LinxSyncRunResult[] {
  return [...modelServicesSyncResults]
}

export function clearModelServicesSyncResults(): void {
  modelServicesSyncResults.length = 0
  modelServicesSyncSeq = 0
}

function rowKey(row: AnyRow): string {
  return (row?.id as string) || (row?.['@id'] as string)
}

function applyPayload(draft: AnyRow, payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      delete draft[key]
      continue
    }
    draft[key] = value
  }
}

async function waitPersist(tx: any) {
  if (tx?.isPersisted?.promise) {
    await tx.isPersisted.promise
  }
}

async function runModelServicesControlSync<T>(
  input: {
    action: string
    providerId: string
    providerPayload: boolean
    credentialPayload: boolean
    modelUpsertCount: number
    modelDeleteCount: number
    updateKeys: string[]
    modelIds?: string[]
  },
  operation: () => T | Promise<T>,
): Promise<T> {
  const sync = createLinxPodSyncScope({
    source: 'app-model-services',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'control-plane',
    authority: 'core',
    onResult(result) {
      modelServicesSyncResults.push(result)
    },
  })
  const primaryModelId = input.modelIds?.[0]

  return await sync.run({
    action: input.action,
    operationId: nextModelServicesSyncOperationId(input),
    kind: 'upsert',
    description: `model-services:${input.action}`,
    subject: primaryModelId ?? input.providerId,
    resourceBindings: {
      provider: { uri: aiConfigProviderRef(input.providerId), local: input.providerId },
      model: primaryModelId ? { uri: aiConfigModelUri(primaryModelId, input.providerId), local: primaryModelId } : undefined,
    },
    metadata: {
      providerPayload: input.providerPayload,
      credentialPayload: input.credentialPayload,
      modelUpsertCount: input.modelUpsertCount,
      modelDeleteCount: input.modelDeleteCount,
      updateKeys: input.updateKeys,
      modelIds: input.modelIds,
    },
    task: operation,
  })
}

function nextModelServicesSyncOperationId(input: { action: string; providerId: string }): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `model-services:${input.action}:${input.providerId}:${timestamp}:${++modelServicesSyncSeq}`
}

function publicUpdateKeys(updates: Partial<AIProvider>): string[] {
  return Object.keys(updates).filter((key) => key !== 'apiKey' && key !== 'credentialId')
}

export function useModelServices() {
  const { db } = useSolidDatabase()

  useEffect(() => {
    if (!db) return

    credentialCollection.startSyncImmediate()
    providerCollection.startSyncImmediate()
    modelCollection.startSyncImmediate()
  }, [db])

  const { data: rawCredentialRows } = useLiveQuery((q) => q.from({ c: credentialCollection }))
  const { data: rawProviderRows } = useLiveQuery((q) => q.from({ p: providerCollection }))
  const { data: rawModelRows } = useLiveQuery((q) => q.from({ m: modelCollection }))

  const credentialRows = useMemo(
    () => rawCredentialRows?.map((r) => (r as any).c).filter(Boolean) || [],
    [rawCredentialRows],
  )
  const providerRows = useMemo(
    () => rawProviderRows?.map((r) => (r as any).p).filter(Boolean) || [],
    [rawProviderRows],
  )
  const modelRows = useMemo(
    () => rawModelRows?.map((r) => (r as any).m).filter(Boolean) || [],
    [rawModelRows],
  )

  const providerCatalog = useMemo(
    () =>
      MODEL_PROVIDERS
        .filter((item) => item.id !== 'custom')
        .map((item) => ({
          id: item.id,
          displayName: item.name,
          defaultBaseUrl: item.defaultBaseUrl,
          defaultModels: item.defaultModels,
        })),
    [],
  )

  const providerStates = useMemo(
    () =>
      buildAIConfigProviderStateMap({
        catalog: providerCatalog,
        providerRows,
        credentialRows,
        modelRows,
      }),
    [credentialRows, modelRows, providerCatalog, providerRows],
  )

  const providers = useMemo(() => {
    const merged: Record<string, AIProvider> = {}

    MODEL_PROVIDERS.forEach((staticDef) => {
      if (staticDef.id === 'custom') return
      const providerState = providerStates[staticDef.id]
      const defaultModels: AIModel[] = (staticDef.defaultModels || []).map((modelId) => ({
        id: modelId,
        name: modelId,
        enabled: true,
        capabilities: [],
      }))

      merged[staticDef.id] = {
        ...staticDef,
        ...(providerState ?? {
          id: staticDef.id,
          enabled: false,
          apiKey: '',
          baseUrl: staticDef.defaultBaseUrl,
          models: defaultModels,
        }),
        apiKey: providerState?.apiKey || '',
        baseUrl: providerState?.baseUrl || staticDef.defaultBaseUrl,
        models: providerState?.models?.length ? providerState.models : defaultModels,
      }
    })

    return merged
  }, [providerStates])

  const updateProvider = useCallback(async (id: string, updates: Partial<AIProvider>) => {
    const plan = buildAIConfigMutationPlan({
      providerId: id,
      currentProviderRows: providerRows,
      currentCredentialRows: credentialRows,
      currentModelRows: modelRows,
      updates,
    })

    const existingProvider = providerRows.find((row) =>
      sameAIConfigProviderFamily(typeof row.id === 'string' ? row.id : '', plan.providerId),
    )
    const existingCredential = credentialRows.find((row) =>
      sameAIConfigProviderFamily(typeof row.provider === 'string' ? row.provider : '', plan.providerId),
    )
    const selectedCredential = selectAIConfigCredential(plan.providerId, credentialRows, providerRows)?.credential
    const credentialTarget = selectedCredential ?? existingCredential
    const existingModels = modelRows.filter((row) =>
      sameAIConfigProviderFamily(typeof row.isProvidedBy === 'string' ? row.isProvidedBy : '', plan.providerId),
    )

    await runModelServicesControlSync({
      action: 'provider.update',
      providerId: plan.providerId,
      providerPayload: Boolean(plan.providerPayload),
      credentialPayload: Boolean(plan.credentialPayload),
      modelUpsertCount: plan.modelUpserts.length,
      modelDeleteCount: plan.modelDeleteIds.length,
      updateKeys: publicUpdateKeys(updates),
      modelIds: [
        ...plan.modelUpserts.map((model) => model.id),
        ...plan.modelDeleteIds,
      ].filter((modelId): modelId is string => typeof modelId === 'string' && modelId.length > 0),
    }, async () => {
      if (plan.providerPayload) {
        const providerTx = existingProvider
          ? providerCollection.update(rowKey(existingProvider), (draft: AnyRow) => {
              applyPayload(draft, plan.providerPayload as AnyRow)
            })
          : providerCollection.insert(plan.providerPayload as any)

        await waitPersist(providerTx)
      }

      if (plan.credentialPayload) {
        const credentialTx = credentialTarget
          ? credentialCollection.update(rowKey(credentialTarget), (draft: AnyRow) => {
              applyPayload(draft, plan.credentialPayload as AnyRow)
            })
          : credentialCollection.insert(plan.credentialPayload as any)

        await waitPersist(credentialTx)
      }

      if (plan.modelUpserts.length > 0 || plan.modelDeleteIds.length > 0) {
        const existingById = new Map(
          existingModels
            .filter((row) => typeof row.id === 'string' && row.id.length > 0)
            .map((row) => [normalizeAIConfigModelId(row.id as string, plan.providerId), row] as const),
        )

        for (const modelPayload of plan.modelUpserts) {
          if (!modelPayload.id) continue
          const modelResourceId = aiModelResource.buildId({
            id: modelPayload.id,
            isProvidedBy: modelPayload.isProvidedBy,
          })
          const modelRowPayload = {
            ...modelPayload,
            id: modelResourceId,
          }
          const existing = existingById.get(modelPayload.id)
          const modelTx = existing
            ? modelCollection.update(rowKey(existing), (draft: AnyRow) => {
                applyPayload(draft, modelRowPayload as AnyRow)
              })
            : modelCollection.insert(modelRowPayload as any)

          await waitPersist(modelTx)
        }

        for (const row of existingModels) {
          const modelId = typeof row.id === 'string' ? row.id : ''
          const normalizedModelId = normalizeAIConfigModelId(modelId, plan.providerId)
          if (!plan.modelDeleteIds.includes(normalizedModelId)) continue
          const deleteTx = modelCollection.delete(rowKey(row))
          await waitPersist(deleteTx)
        }
      }
    })
  }, [credentialRows, modelRows, providerRows])

  return {
    providers,
    updateProvider,
  }
}
