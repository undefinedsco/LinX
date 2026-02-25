/**
 * Solid Session Provider Wrapper
 * 
 * 包装 @inrupt/solid-ui-react 的 SessionProvider，
 * 在渲染前检查 localStorage 是否有存储的 sessionId，有的话传入。
 * 
 * 这样可以确保页面刷新后，SessionProvider 使用之前的 sessionId，
 * 而不是每次生成新的，从而正确恢复 session。
 */

import { SessionProvider } from '@inrupt/solid-ui-react'
import type { ReactNode } from 'react'

// Inrupt 存储 session 的 key
const CURRENT_SESSION_KEY = 'solidClientAuthn:currentSession'

interface SolidSessionProviderProps {
  children: ReactNode
  restorePreviousSession?: boolean
  onError?: (error: Error) => void
  onSessionRestore?: (url: string) => void
  skipLoadingProfile?: boolean
}

// 获取存储的 sessionId（同步，在渲染前执行）
function getStoredSessionId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  
  const storedSessionId = window.localStorage.getItem(CURRENT_SESSION_KEY)
  
  if (storedSessionId) {
    console.log('🔑 检测到存储的 sessionId:', storedSessionId)
    return storedSessionId
  }
  
  console.log('🆕 未检测到存储的 sessionId，将创建新的')
  return undefined
}

export function SolidSessionProvider({
  children,
  restorePreviousSession = true,
  onError,
  onSessionRestore,
  skipLoadingProfile,
}: SolidSessionProviderProps) {
  // 在组件初次渲染时获取存储的 sessionId
  const sessionId = getStoredSessionId()

  return (
    <SessionProvider
      sessionId={sessionId}
      restorePreviousSession={restorePreviousSession}
      onError={onError}
      onSessionRestore={onSessionRestore}
      skipLoadingProfile={skipLoadingProfile}
    >
      {children}
    </SessionProvider>
  )
}

// 重新导出 useSession，这样其他文件可以从这里统一导入
export { useSession } from '@inrupt/solid-ui-react'
