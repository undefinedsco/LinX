import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { drizzle } from 'drizzle-solid'
import type { SolidDatabase } from '@linx/models'
import {
  chatTable,
  threadTable,
  messageTable,
  contactTable,
  agentTable,
  modelProviderTable,
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
  const { session } = useSession()
  const initializedSessionId = useRef<string | null>(null)
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
      hasFetch: !!session.fetch
    })
    console.log('ℹ️ Solid session.info snapshot:', session.info)

    if (!session.info.isLoggedIn) {
      console.log('⭕ 用户未登录，数据库状态设为 idle')
      setValue({ db: null, status: 'idle', error: null })
      return
    }

    if (!session.info.webId) {
      console.log('⭕ 没有 WebID，数据库状态设为 idle')
      setValue((prev) => ({ ...prev, db: null, status: 'idle', error: null }))
      return
    }

    try {
      console.log('🔨 创建 drizzle-solid 实例...')
      const instance = drizzle(session, {
        logger: false,
        disableInteropDiscovery: true,
        schema: linxSchema,
      }) as unknown as SolidDatabase
      console.log('✅ drizzle-solid 实例创建成功，状态设为 ready')
      setValue({ db: instance, status: 'ready', error: null })
      
      // 暴露到全局方便调试
      if (typeof window !== 'undefined') {
        (window as any).__SOLID_DB__ = instance
      }

      // Initialize required containers/resources once per session
      if (initializedSessionId.current !== session.info.sessionId) {
        initializedSessionId.current = session.info.sessionId ?? null
        void (async () => {
          try {
            console.log('🔧 初始化 Pod 资源与容器...')
            await instance.init([
              chatTable,
              threadTable,
              messageTable,
              contactTable,
              agentTable,
              modelProviderTable,
            ])
            console.log('✅ Pod 资源初始化完成（已跳过 TypeIndex 创建）')
          } catch (initError) {
            console.warn('⚠️ Pod 资源初始化失败（仍可继续使用已存在的容器）:', initError)
          }
        })()
      }
    } catch (error) {
      console.error('❌ drizzle-solid 实例创建失败:', error)
      setValue({
        db: null,
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }, [session.info.isLoggedIn, session.info.sessionId, session.info.webId, session.fetch])

  const memoValue = useMemo(() => value, [value])

  return <SolidDatabaseContext.Provider value={memoValue}>{children}</SolidDatabaseContext.Provider>
}

export const useSolidDatabase = () => useContext(SolidDatabaseContext)
