import { useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  credentialCollection,
  providerCollection,
  modelCollection,
  initializeModelCollections,
} from '../collections'
import { MODEL_PROVIDERS } from '../constants'
import type { AIProvider, AIModel } from '../types'

type AnyRow = Record<string, any>

const PROVIDER_DOC_BASE = '/settings/ai/providers.ttl'

function normalizeId(raw?: string | null): string {
  if (!raw) return ''
  if (raw.includes('#')) return raw.split('#').pop() || raw
  const clean = raw.replace(/\/$/, '')
  const tail = clean.split('/').pop() || clean
  return tail.endsWith('.ttl') ? tail.slice(0, -4) : tail
}

function providerUri(providerId: string): string {
  return `${PROVIDER_DOC_BASE}#${providerId}`
}

function rowKey(row: AnyRow): string {
  return (row?.['@id'] as string) || (row?.id as string)
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

    initializeModelCollections(db)
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

  const providers = useMemo(() => {
    const merged: Record<string, AIProvider> = {}

    const providerMap = new Map<string, AnyRow>()
    providerRows.forEach((row) => {
      const key = normalizeId(row?.id)
      if (key) providerMap.set(key, row)
    })

    const credentialMap = new Map<string, AnyRow>()
    credentialRows.forEach((row) => {
      const linkedProvider = normalizeId(row?.provider || row?.id)
      if (linkedProvider) credentialMap.set(linkedProvider, row)
    })

    const modelMap = new Map<string, AnyRow[]>()
    modelRows.forEach((row) => {
      const linkedProvider = normalizeId(row?.isProvidedBy)
      if (!linkedProvider) return
      const list = modelMap.get(linkedProvider) || []
      list.push(row)
      modelMap.set(linkedProvider, list)
    })

    MODEL_PROVIDERS.forEach((staticDef) => {
      if (staticDef.id === 'custom') return

      const providerRow = providerMap.get(staticDef.id)
      const credentialRow = credentialMap.get(staticDef.id)
      const providerModelRows = modelMap.get(staticDef.id) || []

      const persistedModels: AIModel[] = providerModelRows
        .map((row) => {
          const modelId = normalizeId(row.id)
          if (!modelId) return null
          return {
            id: modelId,
            name: row.displayName || modelId,
            enabled: (row.status || 'active') === 'active',
            capabilities: [],
            isCustom: !(staticDef.defaultModels || []).includes(modelId),
          } as AIModel
        })
        .filter(Boolean) as AIModel[]

      const defaultModels: AIModel[] = (staticDef.defaultModels || []).map((id) => ({
        id,
        name: id,
        enabled: true,
        capabilities: [],
      }))

      merged[staticDef.id] = {
        ...staticDef,
        enabled: (credentialRow?.status || 'inactive') === 'active',
        apiKey: credentialRow?.apiKey || '',
        baseUrl: credentialRow?.baseUrl || providerRow?.baseUrl || staticDef.defaultBaseUrl,
        models: persistedModels.length > 0 ? persistedModels : defaultModels,
        updatedAt: undefined,
      }
    })

    return merged
  }, [credentialRows, modelRows, providerRows])

  const updateProvider = useCallback(async (id: string, updates: Partial<AIProvider>) => {
    const staticDef = MODEL_PROVIDERS.find((item) => item.id === id)
    const existingProvider = providerRows.find((row) => normalizeId(row.id) === id)
    const existingCredential = credentialRows.find((row) => normalizeId(row.provider || row.id) === id)
    const existingModels = modelRows.filter((row) => normalizeId(row.isProvidedBy) === id)

    const hasConfigUpdate = updates.enabled !== undefined || updates.apiKey !== undefined || updates.baseUrl !== undefined

    if (hasConfigUpdate || updates.models !== undefined) {
      const providerPayload: AnyRow = {
        id,
        baseUrl: updates.baseUrl ?? existingProvider?.baseUrl ?? staticDef?.defaultBaseUrl,
      }

      if (updates.models && updates.models.length > 0) {
        providerPayload.hasModel = `/settings/ai/models.ttl#${updates.models[0].id}`
      } else if (existingProvider?.hasModel) {
        providerPayload.hasModel = existingProvider.hasModel
      }

      const providerTx = existingProvider
        ? providerCollection.update(rowKey(existingProvider), (draft: AnyRow) => {
            Object.assign(draft, providerPayload)
          })
        : providerCollection.insert(providerPayload as any)

      await waitPersist(providerTx)
    }

    if (hasConfigUpdate) {
      const credentialPayload: AnyRow = {
        id: existingCredential?.id || `${id}-default`,
        provider: providerUri(id),
        service: existingCredential?.service || 'ai',
        status:
          updates.enabled !== undefined
            ? updates.enabled
              ? 'active'
              : 'inactive'
            : existingCredential?.status || 'active',
        apiKey: updates.apiKey ?? existingCredential?.apiKey,
        baseUrl: updates.baseUrl ?? existingCredential?.baseUrl,
        label: existingCredential?.label || `${staticDef?.name || id} Key`,
      }

      const credentialTx = existingCredential
        ? credentialCollection.update(rowKey(existingCredential), (draft: AnyRow) => {
            Object.assign(draft, credentialPayload)
          })
        : credentialCollection.insert(credentialPayload as any)

      await waitPersist(credentialTx)
    }

    if (updates.models !== undefined) {
      const nextIds = new Set(updates.models.map((item) => item.id))
      const existingById = new Map(existingModels.map((row) => [normalizeId(row.id), row]))

      for (const model of updates.models) {
        const existing = existingById.get(model.id)
        const now = new Date()
        const modelPayload: AnyRow = {
          id: model.id,
          displayName: model.name || model.id,
          modelType: 'chat',
          isProvidedBy: providerUri(id),
          status: model.enabled ? 'active' : 'inactive',
          updatedAt: now,
          createdAt: existing?.createdAt || now,
        }

        const modelTx = existing
          ? modelCollection.update(rowKey(existing), (draft: AnyRow) => {
              Object.assign(draft, modelPayload)
            })
          : modelCollection.insert(modelPayload as any)

        await waitPersist(modelTx)
      }

      for (const row of existingModels) {
        const modelId = normalizeId(row.id)
        if (nextIds.has(modelId)) continue
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
