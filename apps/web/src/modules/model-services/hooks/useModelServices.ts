import { useCallback, useEffect, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
} from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  credentialCollection,
  providerCollection,
  modelCollection,
} from '../collections'
import { MODEL_PROVIDERS } from '../constants'
import type { AIProvider, AIModel } from '../types'

type AnyRow = Record<string, any>

function rowKey(row: AnyRow): string {
  return (row?.['@id'] as string) || (row?.id as string)
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
      sameAIConfigProviderFamily(String(row.id ?? row['@id'] ?? ''), plan.providerId),
    )
    const existingCredential = credentialRows.find((row) =>
      sameAIConfigProviderFamily(String(row.provider ?? row.id ?? ''), plan.providerId),
    )
    const existingModels = modelRows.filter((row) =>
      sameAIConfigProviderFamily(String(row.isProvidedBy ?? ''), plan.providerId),
    )

    if (plan.providerPayload) {
      const providerTx = existingProvider
        ? providerCollection.update(rowKey(existingProvider), (draft: AnyRow) => {
            applyPayload(draft, plan.providerPayload as AnyRow)
          })
        : providerCollection.insert(plan.providerPayload as any)

      await waitPersist(providerTx)
    }

    if (plan.credentialPayload) {
      const credentialTx = existingCredential
        ? credentialCollection.update(rowKey(existingCredential), (draft: AnyRow) => {
            applyPayload(draft, plan.credentialPayload as AnyRow)
          })
        : credentialCollection.insert(plan.credentialPayload as any)

      await waitPersist(credentialTx)
    }

    if (plan.modelUpserts.length > 0 || plan.modelDeleteIds.length > 0) {
      const existingById = new Map(
        existingModels.map((row) => [normalizeAIConfigResourceId(String(row.id ?? row['@id'] ?? '')), row] as const),
      )

      for (const modelPayload of plan.modelUpserts) {
        if (!modelPayload.id) continue
        const existing = existingById.get(modelPayload.id)
        const modelTx = existing
          ? modelCollection.update(rowKey(existing), (draft: AnyRow) => {
              applyPayload(draft, modelPayload as AnyRow)
            })
          : modelCollection.insert(modelPayload as any)

        await waitPersist(modelTx)
      }

      for (const row of existingModels) {
        const modelId = normalizeAIConfigResourceId(String(row.id ?? row['@id'] ?? ''))
        if (!plan.modelDeleteIds.includes(modelId)) continue
        const deleteTx = modelCollection.delete(rowKey(row))
        await waitPersist(deleteTx)
      }
    }
  }, [credentialRows, modelRows, providerRows])

  return {
    providers,
    updateProvider,
  }
}
