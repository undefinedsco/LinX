import { useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { providerCollection, initializeModelCollections } from '../collections'
import { MODEL_PROVIDERS } from '../constants'
import type { AIProvider, AIModel } from '../types'

export function useModelServices() {
  const { db } = useSolidDatabase()

  // 1. Initialize DB context & Subscribe
  useEffect(() => {
    if (!db) return
    
    initializeModelCollections(db)
    providerCollection.startSyncImmediate()
    
    let unsubscribe: (() => void) | undefined
    
    // Temporarily disable subscription to avoid backend lock contention
    // providerCollection.subscribeToPod(db).then(unsub => {
    //   unsubscribe = unsub
    // })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [db])

  // 2. Live Query: Get all user configurations from TanStack DB
  // This automatically syncs with the collection store
  const { data: rawRows } = useLiveQuery(q => q.from({ p: providerCollection }))
  
  // Extract rows from the query result structure
  const dbRows = useMemo(() => rawRows?.map(r => r.p).filter(Boolean) || [], [rawRows])

  // 3. Merge Strategy: Static Config + User DB Data (Overlay Pattern)
  const providers = useMemo(() => {
    const merged: Record<string, AIProvider> = {}
    
    // Create a map for fast lookup of user configs
    // Handle both URI IDs and simple IDs
    const dbMap = new Map<string, typeof dbRows[0]>();
    
    (dbRows || []).forEach(row => {
      if (!row || !row.id) return
      // 1. Raw ID (URI)
      dbMap.set(row.id, row)
      
      // 2. Extracted ID (from URI)
      try {
        const parts = row.id.split('/')
        const lastPart = parts[parts.length - 1]
        if (lastPart && lastPart !== row.id) {
          dbMap.set(lastPart, row)
          // Handle .ttl extension if present
          if (lastPart.endsWith('.ttl')) {
            dbMap.set(lastPart.replace('.ttl', ''), row)
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    })

    MODEL_PROVIDERS.forEach(staticDef => {
      // Skip 'custom' provider placeholder if not needed, or handle it specifically
      if (staticDef.id === 'custom') return

      const userConfig = dbMap.get(staticDef.id)
      
      const customModels: AIModel[] = Array.isArray(userConfig?.models) ? userConfig.models : []

      // Merge Logic:
      // 1. Start with Static Definition (Icons, Default BaseURL, Default Models)
      // 2. Override with User Config (API Key, Enabled, Custom BaseURL)
      // 3. Models: defaults only when no persisted config exists
      
      // Map static model IDs to AIModel objects
      const defaultModels: AIModel[] = (staticDef.defaultModels || []).map(m => ({
        id: m,
        name: m,
        enabled: true, // Default models are enabled by default
        capabilities: [] // TODO: Map capabilities from static metadata
      }))

      const models = userConfig ? customModels : defaultModels

      merged[staticDef.id] = {
        ...staticDef,
        
        // Dynamic overrides
        enabled: userConfig?.enabled ?? false, // Default to disabled if not in DB
        apiKey: userConfig?.apiKey ?? '',
        baseUrl: userConfig?.baseUrl || staticDef.defaultBaseUrl, // Use static default if user hasn't overridden
        
        models,
        
        updatedAt: userConfig?.updatedAt ? new Date(userConfig.updatedAt).getTime() : undefined,
      }
    })

    return merged
  }, [dbRows])

  // 4. Actions (Mutations)
  
  // Update Provider Configuration
  const updateProvider = useCallback(async (id: string, updates: Partial<AIProvider>) => {
    // We only persist the "User Config" parts, not the static parts
    const payload: any = {}
    
    if (updates.enabled !== undefined) payload.enabled = updates.enabled
    if (updates.apiKey !== undefined) payload.apiKey = updates.apiKey
    if (updates.baseUrl !== undefined) payload.baseUrl = updates.baseUrl
    if (updates.models !== undefined) payload.models = updates.models
    
    // Always update timestamp
    payload.updatedAt = new Date()

    // Check if row exists to decide Insert vs Update
    // Since useLiveQuery gives us the current state, we can just check `providers[id].updatedAt` 
    // or we can use collection.update which usually requires an ID. 
    // TanStack DB's update needs the item to exist. 
    // Upsert logic:
    
    const existingRow = (dbRows || []).find(r => r.id === id)

    let tx
    if (existingRow) {
      tx = providerCollection.update(id, (draft) => {
        Object.assign(draft, payload)
      })
    } else {
      // First time saving this provider config
      tx = providerCollection.insert({
        id,
        ...payload
      })
    }

    if (tx?.isPersisted?.promise) {
      await tx.isPersisted.promise
    }
  }, [dbRows])
  return {
    providers,
    updateProvider
  }
}
