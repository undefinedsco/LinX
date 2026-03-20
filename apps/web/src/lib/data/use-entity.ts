/**
 * useEntity Hook
 * 
 * 查询和订阅单个实体（支持本地和远程 IRI）。
 * 
 * 查询使用 drizzle-solid 的 findByIri。
 * 订阅暂未启用。
 * 
 * - 进入页面时自动 fetch
 * - 自动订阅变更（待实现）
 * - 离开页面时自动取消订阅
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { PodTable, InferTableData } from '@undefineds.co/drizzle-solid'

export interface UseEntityOptions<T> {
  /** 数据更新时的回调（除了更新内部 state，还可以做额外操作如更新缓存） */
  onUpdate?: (data: T) => void
  /** 实体被删除时的回调 */
  onDelete?: () => void
  /** 发生错误时的回调 */
  onError?: (error: Error) => void
  /** 是否启用（默认 true，设为 false 可暂停查询/订阅） */
  enabled?: boolean
}

export interface UseEntityResult<T> {
  /** 实体数据 */
  data: T | null
  /** 是否正在加载 */
  isLoading: boolean
  /** 错误信息 */
  error: Error | null
  /** 手动刷新 */
  refresh: () => Promise<void>
}

/**
 * 查询和订阅单个实体
 * 
 * @param table - 表定义（用于解析 schema）
 * @param iri - 实体的完整 IRI（本地或远程），为 null 时不查询
 * @param options - 可选配置
 * 
 * @example
 * ```typescript
 * // 查询联系人的 Profile（可能是远程的）
 * const { data: profile, isLoading, refresh } = useEntity(
 *   solidProfileTable,
 *   contact.entityUri
 * )
 * 
 * // 查询 Agent（可能是本地或远程的）
 * const { data: agent } = useEntity(
 *   agentTable,
 *   contact.entityUri,
 *   {
 *     onUpdate: (data) => {
 *       // 同步更新本地缓存
 *       contactOps.updateContact(contactId, {
 *         name: data.name,
 *         avatarUrl: data.avatarUrl,
 *         lastSyncedAt: new Date(),
 *       })
 *     }
 *   }
 * )
 * ```
 */
export function useEntity<TTable extends PodTable<any>>(
  table: TTable,
  iri: string | null | undefined,
  options: UseEntityOptions<InferTableData<TTable>> = {}
): UseEntityResult<InferTableData<TTable>> {
  const { db } = useSolidDatabase()
  const { onUpdate, onDelete, onError, enabled = true } = options
  
  // 用 ref 保存 callbacks，避免 effect 依赖变化导致重复请求
  const callbacksRef = useRef({ onUpdate, onDelete, onError })
  callbacksRef.current = { onUpdate, onDelete, onError }
  
  const [data, setData] = useState<InferTableData<TTable> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Fetch 数据
  const fetchData = useCallback(async () => {
    if (!db || !iri || !enabled) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const result = typeof (db as any).findByIri === 'function'
        ? await (db as any).findByIri(table as any, iri)
        : await (db as any).findFirst?.(table as any, { '@id': iri } as any)
      setData(result)
      if (result) {
        callbacksRef.current.onUpdate?.(result)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      callbacksRef.current.onError?.(error)
    } finally {
      setIsLoading(false)
    }
  }, [db, table, iri, enabled])

  // 手动刷新
  const refresh = useCallback(async () => {
    await fetchData()
  }, [fetchData])

  // 自动 fetch + 订阅
  useEffect(() => {
    if (!db || !iri || !enabled) {
      setData(null)
      setError(null)
      return
    }

    // 首次 fetch
    fetchData()

    // TODO: 等 drizzle-solid 支持后启用订阅
    // const unsubscribe = db.subscribeByIri(table, iri, {
    //   onUpdate: (newData) => {
    //     setData(newData)
    //     callbacksRef.current.onUpdate?.(newData)
    //   },
    //   onDelete: () => {
    //     setData(null)
    //     callbacksRef.current.onDelete?.()
    //   },
    //   onError: (err) => {
    //     setError(err)
    //     callbacksRef.current.onError?.(err)
    //   },
    // })
    // return () => unsubscribe()
    
    return () => {
      // cleanup placeholder
    }
  }, [db, table, iri, enabled, fetchData])

  return { data, isLoading, error, refresh }
}
