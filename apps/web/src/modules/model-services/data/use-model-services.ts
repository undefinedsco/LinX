import { useCallback, useEffect, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
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
} from './collections'
import { MODEL_PROVIDERS } from '../domain/provider-catalog'
import type { AIProvider, AIModel } from '../domain/types'

type AnyRow = Record<string, any>

function rowKey(row: AnyRow): string {
  if (typeof row?.id === 'string' && row.id.length > 0) {
    return row.id
  }
  throw new Error('AI config row is missing row.id.')
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

function restoreRow(draft: AnyRow, snapshot: AnyRow) {
  for (const key of Object.keys(draft)) {
    if (!(key in snapshot)) delete draft[key]
  }
  Object.assign(draft, snapshot)
}

async function compensatePersistedWrites(compensations: Array<() => Promise<void>>) {
  for (const compensate of compensations.reverse()) {
    try {
      await compensate()
    } catch {
      // Continue restoring independent resources; the original persistence error remains authoritative.
    }
  }
}

export function useModelServices() {
  const { db } = useSolidDatabase()

  useEffect(() => {
    if (!db) return

    credentialCollection.startSyncImmediate()
    providerCollection.startSyncImmediate()
    modelCollection.startSyncImmediate()
  }, [db])

  const credentialQuery = useLiveQuery((q) => q.from({ c: credentialCollection }))
  const providerQuery = useLiveQuery((q) => q.from({ p: providerCollection }))
  const modelQuery = useLiveQuery((q) => q.from({ m: modelCollection }))

  const queryError = credentialQuery.isError || providerQuery.isError || modelQuery.isError
    ? '模型服务配置读取失败，请重试。'
    : null

  const credentialRows = useMemo(
    () => credentialQuery.data?.map((r) => (r as any).c).filter(Boolean) ?? [],
    [credentialQuery.data],
  )
  const providerRows = useMemo(
    () => providerQuery.data?.map((r) => (r as any).p).filter(Boolean) ?? [],
    [providerQuery.data],
  )
  const modelRows = useMemo(
    () => modelQuery.data?.map((r) => (r as any).m).filter(Boolean) ?? [],
    [modelQuery.data],
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
    if (queryError) return {}
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
  }, [providerStates, queryError])

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
    const compensations: Array<() => Promise<void>> = []

    try {
      if (plan.providerPayload) {
        const providerSnapshot = existingProvider ? { ...existingProvider } : null
        const providerTx = existingProvider
          ? providerCollection.update(rowKey(existingProvider), (draft: AnyRow) => {
              applyPayload(draft, plan.providerPayload as AnyRow)
            })
          : providerCollection.insert(plan.providerPayload as any)

        await waitPersist(providerTx)
        compensations.push(async () => {
          const tx = providerSnapshot
            ? providerCollection.update(rowKey(providerSnapshot), (draft: AnyRow) => {
                restoreRow(draft, providerSnapshot)
              })
            : providerCollection.delete(rowKey(plan.providerPayload as AnyRow))
          await waitPersist(tx)
        })
      }

      if (plan.credentialPayload) {
        const credentialSnapshot = credentialTarget ? { ...credentialTarget } : null
        const credentialTx = credentialTarget
          ? credentialCollection.update(rowKey(credentialTarget), (draft: AnyRow) => {
              applyPayload(draft, plan.credentialPayload as AnyRow)
            })
          : credentialCollection.insert(plan.credentialPayload as any)

        await waitPersist(credentialTx)
        compensations.push(async () => {
          const tx = credentialSnapshot
            ? credentialCollection.update(rowKey(credentialSnapshot), (draft: AnyRow) => {
                restoreRow(draft, credentialSnapshot)
              })
            : credentialCollection.delete(rowKey(plan.credentialPayload as AnyRow))
          await waitPersist(tx)
        })
      }

      if (plan.modelUpserts.length > 0 || plan.modelDeleteIds.length > 0) {
        const existingById = new Map(
          existingModels
            .filter((row) => typeof row.id === 'string' && row.id.length > 0)
            .map((row) => [normalizeAIConfigModelId(row.id as string, plan.providerId), row] as const),
        )

        for (const modelPayload of plan.modelUpserts) {
          if (!modelPayload.id) continue
          const existing = existingById.get(modelPayload.id)
          const modelSnapshot = existing ? { ...existing } : null
          const modelTx = existing
            ? modelCollection.update(rowKey(existing), (draft: AnyRow) => {
                applyPayload(draft, modelPayload as AnyRow)
              })
            : modelCollection.insert(modelPayload as any)

          await waitPersist(modelTx)
          compensations.push(async () => {
            const tx = modelSnapshot
              ? modelCollection.update(rowKey(modelSnapshot), (draft: AnyRow) => {
                  restoreRow(draft, modelSnapshot)
                })
              : modelCollection.delete(rowKey(modelPayload as AnyRow))
            await waitPersist(tx)
          })
        }

        for (const row of existingModels) {
          const modelId = typeof row.id === 'string' ? row.id : ''
          const normalizedModelId = normalizeAIConfigModelId(modelId, plan.providerId)
          if (!plan.modelDeleteIds.includes(normalizedModelId)) continue
          const modelSnapshot = { ...row }
          const deleteTx = modelCollection.delete(rowKey(row))
          await waitPersist(deleteTx)
          compensations.push(async () => {
            await waitPersist(modelCollection.insert(modelSnapshot as any))
          })
        }
      }
    } catch (error) {
      await compensatePersistedWrites(compensations)
      throw error
    }
  }, [credentialRows, modelRows, providerRows])

  return {
    providers,
    updateProvider,
    error: queryError,
  }
}
