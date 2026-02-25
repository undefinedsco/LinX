/**
 * ChatContentPane - AI 聊天内容面板
 *
 * 使用 OpenAI ChatKit SDK 实现聊天界面。
 * ChatKit SDK 自动处理流式渲染、消息持久化、工具调用审批等。
 *
 * 架构:
 * - ChatKit SDK: 消息渲染、流式处理、工具调用
 * - Zustand: UI 状态管理（selectedChatId, selectedThreadId）
 * - Local fetch handler: 拦截 ChatKit 请求，在浏览器内处理 store + AI 调用
 *
 * @see docs/feature-plan/wave-a/03-xpod-client-core.md
 */

import { useEffect, useMemo, useRef } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { Bot } from 'lucide-react'
import { useChatKit, ChatKit as ChatKitComponent } from '@openai/chatkit-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { createLocalChatKitFetch } from '../services/chatkit-local/fetch-handler'
import { useChatStore } from '../store'
import { useChatList } from '../collections'

export interface ChatContentPaneProps extends MicroAppPaneProps {}

/**
 * 从 WebID 提取 Pod URL
 *
 * 示例:
 * - https://alice.example.org/profile/card#me → https://alice.example.org
 * - https://pod.example.org/alice/profile/card#me → https://pod.example.org/alice
 */
function extractPodUrl(webId: string): string {
  try {
    const url = new URL(webId)
    const pathParts = url.pathname.split('/')
    const profileIndex = pathParts.indexOf('profile')
    if (profileIndex > 0) {
      const podPath = pathParts.slice(0, profileIndex).join('/')
      return `${url.origin}${podPath}`
    }
    return url.origin
  } catch {
    return ''
  }
}

/**
 * 检测当前主题
 */
function useThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'

  // 检查 document.documentElement 的 class
  const isDark = document.documentElement.classList.contains('dark')
  return isDark ? 'dark' : 'light'
}

function ChatKitPanel({ session }: { session: any }) {
  const selectedThreadId = useChatStore((s) => s.selectedThreadId)
  const selectThread = useChatStore((s) => s.selectThread)
  const theme = useThemeMode()
  const chatkitRef = useRef<any>(null)
  const { db } = useSolidDatabase()

  // Local fetch handler: intercepts ChatKit requests and processes them
  // entirely in the browser using drizzle-solid db + direct AI API calls.
  const localFetch = useMemo(() => {
    if (!db || !session.info.webId || !session.fetch) return session.fetch
    return createLocalChatKitFetch({ db, webId: session.info.webId, authFetch: session.fetch })
  }, [db, session.info.webId, session.fetch])

  // ChatKit 配置
  const chatkit = useChatKit({
    api: {
      url: 'local://chatkit', // Not a real URL — intercepted by localFetch
      domainKey: 'local', // Required by CustomApiConfig; not used since fetch is intercepted
      fetch: localFetch,
    },
    theme: {
      colorScheme: theme,
      color: {
        accent: {
          primary: '#7C3AED', // LinX 品牌紫色
          level: 2,
        },
      },
    },
    header: { enabled: false }, // LinX 有自己的 ChatHeader
    history: { enabled: false }, // LinX ChatListPane 管理列表
    composer: { placeholder: '输入消息...' },
    threadItemActions: { feedback: true, retry: true },
    onThreadChange: ({ threadId }: { threadId: string | null }) => {
      if (threadId && threadId !== selectedThreadId) {
        selectThread(threadId)
      }
    },
    onError: ({ error }: { error: Error }) => {
      console.error('[ChatKit] Error:', error)
    },
  })

  // 同步 Zustand selectedThreadId → ChatKit
  useEffect(() => {
    if (selectedThreadId) {
      chatkit.setThreadId(selectedThreadId)
    }
  }, [selectedThreadId, chatkit])

  chatkitRef.current = chatkit

  return (
    <div className="flex-1 h-full overflow-hidden">
      <ChatKitComponent
        control={chatkit.control}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}


export function ChatContentPane(_props: ChatContentPaneProps) {
  const { session } = useSession()
  const selectedChatId = useChatStore((state) => state.selectedChatId)

  // Data
  const { data: chats } = useChatList()

  // Get Chat Detail (from List Cache)
  const chat = useMemo(
    () => chats?.find((c) => c.id === selectedChatId),
    [chats, selectedChatId]
  )

  // Extract Pod URL from WebID
  const podUrl = useMemo(() => {
    if (!session.info.webId) return ''
    return extractPodUrl(session.info.webId)
  }, [session.info.webId])

  // Empty state
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
          <p className="text-muted-foreground">选择或创建一个聊天</p>
        </div>
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  // 如果没有 podUrl 或 session.fetch，显示错误
  if (!podUrl || !session.fetch) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
          <p className="text-muted-foreground">
            {!podUrl ? '无法获取 Pod 地址' : '会话未就绪'}
          </p>
        </div>
      </div>
    )
  }

  // 渲染 ChatKit
  return (
    <div className="flex-1 flex h-full overflow-hidden bg-muted/30">
      <ChatKitPanel session={session} />
    </div>
  )
}
