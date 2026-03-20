import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { drizzle } from '@undefineds.co/drizzle-solid'
import { resolvePodUrl } from '@/lib/pod-url'
import type { SolidDatabase } from '@linx/models'
import {
  chatTable,
  threadTable,
  workspaceTable,
  messageTable,
  contactTable,
  agentTable,
  credentialTable,
  aiProviderTable,
  aiModelTable,
  approvalTable,
  auditTable,
  inboxNotificationTable,
  linxSchema,
} from '@linx/models'

interface SolidDatabaseContextValue {
  db: SolidDatabase | null
  status: 'idle' | 'ready' | 'error'
  error: Error | null
}

const SolidDatabaseContext = createContext<SolidDatabaseContextValue>({
  db: null,
  status: 'idle',
  error: null,
})

export function SolidDatabaseProvider({ children }: { children: ReactNode }) {
  const { session, sessionRequestInProgress } = useSession()
  
  // 缓存 drizzle 实例，避免重复创建
  const dbInstanceRef = useRef<SolidDatabase | null>(null)
  const initializedSessionIdRef = useRef<string | null>(null)
  const initializingRef = useRef<boolean>(false)
  
  const [value, setValue] = useState<SolidDatabaseContextValue>({
    db: null,
    status: 'idle',
    error: null,
  })

  useEffect(() => {
    console.log('🔍 SolidDatabaseProvider 状态检查:', {
      isLoggedIn: session.info.isLoggedIn,
      sessionId: session.info.sessionId,
      webId: session.info.webId,
      hasFetch: !!session.fetch,
      sessionRequestInProgress,
      hasExistingDb: !!dbInstanceRef.current,
      initializedSessionId: initializedSessionIdRef.current,
    })

    // 等待 session 请求完成
    if (sessionRequestInProgress) {
      console.log('⏳ Session 请求进行中，等待...')
      return
    }

    if (!session.info.isLoggedIn) {
      console.log('⭕ 用户未登录，数据库状态设为 idle')
      dbInstanceRef.current = null
      initializedSessionIdRef.current = null
      setValue({ db: null, status: 'idle', error: null })
      return
    }

    if (!session.info.webId) {
      console.log('⭕ 没有 WebID，数据库状态设为 idle')
      setValue({ db: null, status: 'idle', error: null })
      return
    }

    // 如果已经为这个 session 创建过实例，直接复用
    if (dbInstanceRef.current && initializedSessionIdRef.current === session.info.sessionId) {
      console.log('♻️ 复用已存在的 drizzle 实例')
      if (value.status !== 'ready' || value.db !== dbInstanceRef.current) {
        setValue({ db: dbInstanceRef.current, status: 'ready', error: null })
      }
      return
    }

    // 防止并发初始化
    if (initializingRef.current) {
      console.log('⏳ 已经在初始化中，跳过')
      return
    }

    // 异步初始化
    let cancelled = false
    const initDatabase = async () => {
      initializingRef.current = true
      
      try {
        const podUrl = await resolvePodUrl(session.info.webId!)
        console.log('🔍 验证 session.fetch 可用性，请求:', podUrl)
        
        // 先验证 fetch 是否真的可用（能发起认证请求）
        try {
          const testResponse = await session.fetch(podUrl, { method: 'HEAD' })
          console.log('✅ fetch 验证成功，状态码:', testResponse.status)
        } catch (fetchError) {
          console.error('❌ fetch 验证失败:', fetchError)
          // fetch 不可用，可能 session 还没完全初始化，稍后重试
          throw new Error(`Session fetch 不可用: ${fetchError}`)
        }
        
        if (cancelled) {
          initializingRef.current = false
          return
        }
        
        console.log('🔨 创建 drizzle-solid 实例...')
        const instance = drizzle(session as any, {
          disableInteropDiscovery: true,
          schema: linxSchema,
        }) as unknown as SolidDatabase
        
        // 缓存实例
        dbInstanceRef.current = instance
        initializedSessionIdRef.current = session.info.sessionId ?? null
        
        console.log('✅ drizzle-solid 实例创建成功，状态设为 ready')
        setValue({ db: instance, status: 'ready', error: null })
        
        // 暴露到全局方便调试
        if (typeof window !== 'undefined') {
          (window as any).__SOLID_DB__ = instance
        }

        // Initialize required containers/resources
        try {
          console.log('🔧 初始化 Pod 资源与容器...')
          await (instance as any).init([
            chatTable,
            threadTable,
            workspaceTable,
            messageTable,
            contactTable,
            agentTable,
            credentialTable,
            aiProviderTable,
            aiModelTable,
            approvalTable,
            auditTable,
            inboxNotificationTable,
          ])
          console.log('✅ Pod 资源初始化完成（已跳过 TypeIndex 创建）')
        } catch (initError) {
          console.warn('⚠️ Pod 资源初始化失败（仍可继续使用已存在的容器）:', initError)
        }
      } catch (error) {
        if (cancelled) {
          initializingRef.current = false
          return
        }
        console.error('❌ drizzle-solid 实例创建失败:', error)
        setValue({
          db: null,
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      } finally {
        initializingRef.current = false
      }
    }
    
    initDatabase()
    
    return () => {
      cancelled = true
    }
  }, [session.info.isLoggedIn, session.info.sessionId, session.info.webId, session.fetch, sessionRequestInProgress, value.status, value.db])

  const memoValue = useMemo(() => value, [value])

  return <SolidDatabaseContext.Provider value={memoValue}>{children}</SolidDatabaseContext.Provider>
}

export const useSolidDatabase = () => useContext(SolidDatabaseContext)
