// 主应用组件 - 演示数据管线
import { useState, useEffect } from 'react'
import { login, logout, getDefaultSession, handleIncomingRedirect } from '@inrupt/solid-client-authn-browser'
import { db } from '@/lib/drizzle-solid-client'
import { useChatPage } from '@/hooks/useChatPage'
import { useCreateChat } from '@/hooks/useChats'
import { ChatList } from '@/components/ChatList'
import { ChatDetail } from '@/components/ChatDetail'
import { ChatFilters } from '@/components/ChatFilters'

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [webId, setWebId] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  
  // 处理 Solid 登录
  useEffect(() => {
    handleIncomingRedirect({ restorePreviousSession: true }).then(() => {
      const session = getDefaultSession()
      
      if (session.info.isLoggedIn && session.info.webId) {
        setIsLoggedIn(true)
        setWebId(session.info.webId)
        // 设置 drizzle-solid 会话
        db.setSession(session, session.info.webId)
        console.log('✅ Solid 登录成功:', session.info.webId)
      }
    })
  }, [])
  
  const handleLogin = async () => {
    setIsLoggingIn(true)
    try {
      await login({
        oidcIssuer: 'https://login.inrupt.com', // 或其他 Solid Provider
        redirectUrl: window.location.href,
        clientName: 'LinX 数据管线演示'
      })
    } catch (error) {
      console.error('登录失败:', error)
      setIsLoggingIn(false)
    }
  }
  
  const handleLogout = async () => {
    await logout()
    setIsLoggedIn(false)
    setWebId(null)
  }
  
  // 如果未登录，显示登录界面
  if (!isLoggedIn) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">LinX 数据管线演示</h1>
          <p className="text-gray-600 mb-6">需要登录 Solid Pod 查看真实数据</p>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
          >
            {isLoggingIn ? '正在登录...' : '登录 Solid Pod'}
          </button>
        </div>
      </div>
    )
  }
  
  // 登录后显示聊天界面
  return <ChatInterface webId={webId!} onLogout={handleLogout} />
}

function ChatInterface({ webId, onLogout }: { webId: string, onLogout: () => void }) {
  // 组合的数据和状态
  const {
    chats,
    selectedChat,
    isLoading,
    isSelectedChatLoading,
    searchQuery,
    statusFilter,
    typeFilter,
    // totalChats,
    searchStats,
    setSelectedChat,
    setSearchQuery,
    setStatusFilter,
    setTypeFilter,
    clearFilters,
  } = useChatPage()
  
  // 创建聊天
  const createChatMutation = useCreateChat()
  const [isCreating, setIsCreating] = useState(false)
  
  const handleCreateChat = async () => {
    const title = prompt('输入聊天标题:')
    if (!title) return
    
    setIsCreating(true)
    try {
      await createChatMutation.mutateAsync({
        title,
        conversationType: 'direct',
        participants: [webId],
        creator: webId,
      })
    } catch (error) {
      alert('创建失败: ' + error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="h-screen flex">
      {/* 左侧: 聊天列表 */}
      <div className="w-1/3 border-r flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-lg font-bold">LinX 数据管线演示</h1>
            <button
              onClick={onLogout}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
            >
              登出
            </button>
          </div>
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-500 truncate">
              WebID: {webId}
            </div>
            <button
              onClick={handleCreateChat}
              disabled={isCreating}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
            >
              {isCreating ? '创建中...' : '新建聊天'}
            </button>
          </div>
        </div>
        
        {/* 过滤器 */}
        <ChatFilters
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          onSearchChange={setSearchQuery}
          onStatusChange={setStatusFilter}
          onTypeChange={setTypeFilter}
          onClear={clearFilters}
          resultCount={searchStats.filtered}
          totalCount={searchStats.total}
        />
        
        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          <ChatList
            chats={chats}
            selectedChatId={selectedChat?.id || null}
            onSelectChat={setSelectedChat}
            isLoading={isLoading}
          />
        </div>
      </div>
      
      {/* 右侧: 聊天详情 */}
      <div className="flex-1">
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold">聊天详情</h2>
        </div>
        
        <div className="p-4">
          <ChatDetail
            chat={selectedChat}
            isLoading={isSelectedChatLoading}
          />
        </div>
      </div>
    </div>
  )
}