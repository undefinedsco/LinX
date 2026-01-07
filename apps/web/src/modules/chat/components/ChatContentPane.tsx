/**
 * ChatContentPane - AI 聊天内容面板
 * 
 * 对齐:
 * - 品牌色: LinX 自有
 * - 交互样式: Cherry Studio + Lobe Chat
 * 
 * 架构: Collections + Zustand + useEntity
 * - Chat/Thread/Message 使用 chatOps (TanStack DB Collections)
 * - Contact/Agent 详情使用 useEntity (支持订阅)
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MicroAppPaneProps, MicroAppId } from '@/modules/layout/micro-app-registry'
import { useChatStore } from '../store'
import { useChatList, useThreadList, useMessageList, useChatMutations } from '../collections'
import { useChatHandler } from '../hooks/useChatHandler'
import { useModelServices } from '@/modules/model-services/hooks/useModelServices'
import { 
  resolveRowId, 
  MessageBlockType, 
  MessageBlockStatus, 
  serializeMessageBlocks, 
  contactTable,
  agentTable,
  ContactType,
  getBuiltinProvider,
  type MessageBlock, 
  type MainTextMessageBlock, 
  type ThinkingMessageBlock, 
  type ToolMessageBlock 
} from '@linx/models'
import { useEntity } from '@/lib/data/use-entity'
import { TooltipProvider } from '@/components/ui/tooltip'

// 新的对齐组件
import { MessageList, type MessageData } from './Messages'
import { Inputbar, type InputbarRef } from './Inputbar'

export interface ChatContentPaneProps extends MicroAppPaneProps {}

export function ChatContentPane(_props: ChatContentPaneProps) {
  const navigate = useNavigate()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectThread = useChatStore((state) => state.selectThread)
  const inputbarRef = useRef<InputbarRef>(null)

  // Local state
  const [composerValue, setComposerValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deepThinkingActive, setDeepThinkingActive] = useState(false)
  const [webSearchActive, setWebSearchActive] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null)
  const [showKeyCard, setShowKeyCard] = useState(false)
  const [localHasApiKey, setLocalHasApiKey] = useState(false)

  // Data - using new collection-based hooks
  const { data: chats } = useChatList()
  const { providers, updateProvider } = useModelServices()
  const mutations = useChatMutations()

  // 1. Get Chat Detail (from List Cache)
  const chat = useMemo(() =>
    chats?.find(c => resolveRowId(c) === selectedChatId),
  [chats, selectedChatId])

  // 2. 使用 useEntity 获取 Contact（统一架构）
  const contactUri = (chat as any)?.contact
  const { 
    data: contact, 
    isLoading: contactLoading 
  } = useEntity(contactTable, contactUri)

  // 3. 使用 useEntity 获取 Agent（当 contactType 是 agent 时）
  const agentUri = contact?.contactType === ContactType.AGENT ? contact.entityUri : null
  const { 
    data: agent, 
    isLoading: agentLoading 
  } = useEntity(agentTable, agentUri)

  // Extract provider and model from agent
  const provider = (agent?.provider as string) || 'openai'
  const model = (agent?.model as string) || 'gpt-4o-mini'

  // Get provider info for display
  const providerInfo = useMemo(() => {
    if (!provider) return null
    return getBuiltinProvider(provider)
  }, [provider])

  // Check if API key exists for this provider (from model-services)
  const providerConfig = providers[provider]
  const hasApiKey = localHasApiKey || !!providerConfig?.apiKey
  const apiKeyLoading = false // model-services loads synchronously

  useEffect(() => {
    setLocalHasApiKey(!!providerConfig?.apiKey)
  }, [providerConfig?.apiKey, provider])

  useEffect(() => {
    if (!selectedChatId) return
    setPendingMessage(null)
    setPendingThreadId(null)
    setShowKeyCard(false)
    setApiKeyInput('')
  }, [selectedChatId])

  // 4. Get Threads (using collection hooks)
  const { data: threads } = useThreadList(selectedChatId ?? '')

  // Auto-select first thread or create one
  useEffect(() => {
    if (!selectedChatId || !threads) return
    if (threads.length > 0) {
      if (!selectedThreadId) {
        const firstId = resolveRowId(threads[0])
        if (firstId) selectThread(firstId)
      }
    }
  }, [selectedChatId, threads, selectedThreadId, selectThread])

  // 5. Get Messages (using collection hooks)
  const { data: rawMessages, isLoading: msgsLoading } = useMessageList(selectedThreadId)

  // 6. Chat Handler for streaming (unified handler pattern)
  const { 
    sendMessage: handlerSendMessage, 
    stop, 
    isStreaming: isAILoading, 
    streamingContent, 
    streamingThought,
  } = useChatHandler({
    chatId: selectedChatId,
  })
  
  // Wrap sendMessage to match expected signature
  const sendMessage = useCallback(async (content: string, _history?: any[]) => {
    await handlerSendMessage(content)
  }, [handlerSendMessage])
  
  // Tool invocations placeholder (not yet in useChatHandler)
  const streamingToolInvocations: any[] = []

  // Transform messages for new Message component (block-based)
  const messages: MessageData[] = useMemo(() => {
    if (!rawMessages) return []
    return rawMessages.map(m => {
      const date = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as string)
      
      // 构建 richContent (block-based)
      let richContent: string | undefined = m.richContent
      
      // 如果没有 richContent，从旧格式转换
      if (!richContent && m.content) {
        const blocks: MessageBlock[] = []
        
        // 尝试解析旧的 thought/toolInvocations
        let thought: string | undefined
        let toolInvocations: any[] | undefined
        
        if (m.richContent) {
          try {
            const rich = JSON.parse(m.richContent)
            thought = rich.thought
            toolInvocations = rich.toolInvocations
          } catch (e) {
            // ignore
          }
        }
        
        // 添加 thinking block
        if (thought) {
          blocks.push({
            id: `${resolveRowId(m)}-thinking`,
            messageId: resolveRowId(m) ?? '',
            type: MessageBlockType.THINKING,
            status: MessageBlockStatus.SUCCESS,
            createdAt: date.toISOString(),
            content: thought,
          } as ThinkingMessageBlock)
        }
        
        // 添加 tool blocks
        if (toolInvocations) {
          toolInvocations.forEach((inv: any, idx: number) => {
            blocks.push({
              id: `${resolveRowId(m)}-tool-${idx}`,
              messageId: resolveRowId(m) ?? '',
              type: MessageBlockType.TOOL,
              status: inv.isLoading ? MessageBlockStatus.PROCESSING : MessageBlockStatus.SUCCESS,
              createdAt: date.toISOString(),
              toolId: `tool-${idx}`,
              toolName: inv.toolName ?? 'unknown',
              arguments: inv.input ? JSON.parse(inv.input) : undefined,
              content: inv.output ?? inv.error,
            } as ToolMessageBlock)
          })
        }
        
        // 添加 main text block
        if (m.content) {
          blocks.push({
            id: `${resolveRowId(m)}-text`,
            messageId: resolveRowId(m) ?? '',
            type: MessageBlockType.MAIN_TEXT,
            status: MessageBlockStatus.SUCCESS,
            createdAt: date.toISOString(),
            content: m.content,
          } as MainTextMessageBlock)
        }
        
        if (blocks.length > 0) {
          richContent = serializeMessageBlocks(blocks)
        }
      }

      return {
        id: resolveRowId(m) ?? 'unknown',
        role: (m.role ?? 'user') as 'user' | 'assistant' | 'system',
        content: m.content ?? undefined,
        richContent,
        status: m.status === 'error' ? 'error' : 'sent',
        createdAt: date,
        model: model ? {
          id: model,
          name: model,
          provider: provider ?? 'unknown',
        } : undefined,
        modelLogoUrl: providerInfo?.logoUrl,
      }
    })
  }, [rawMessages, model, provider, providerInfo])

  const sendWithContent = useCallback(async (content: string, overrideThreadId?: string | null) => {
    if (!chat || !content.trim()) return

    setError(null)

    let targetThreadId = overrideThreadId ?? selectedThreadId

    if (!targetThreadId) {
      try {
        const thread = await mutations.createThread.mutateAsync({
          chatId: chat.id,
          title: '新话题',
        })
        targetThreadId = thread.id ?? resolveRowId(thread)
        if (targetThreadId) selectThread(targetThreadId)
      } catch (e) {
        console.error('Create thread failed', e)
        setComposerValue(content)
        return
      }
    }

    if (!targetThreadId) return

    try {
      const oldMessages = messages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content ?? '',
      }))
      await sendMessage(content, oldMessages)
    } catch (e) {
      console.error('Send failed', e)
      setComposerValue(content)
    }
  }, [chat, selectedThreadId, messages, sendMessage, mutations, selectThread])

  const handleSaveApiKey = useCallback(async () => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      setError('请输入 API 密钥')
      return
    }
    setIsSavingKey(true)
    try {
      await updateProvider(provider, { apiKey: trimmed, enabled: true })
      setLocalHasApiKey(true)
      setApiKeyInput('')

      if (pendingMessage) {
        const content = pendingMessage
        const threadId = pendingThreadId
        setPendingMessage(null)
        setPendingThreadId(null)
        setShowKeyCard(false)
        await sendWithContent(content, threadId)
      } else {
        setShowKeyCard(false)
      }
    } finally {
      setIsSavingKey(false)
    }
  }, [apiKeyInput, pendingMessage, pendingThreadId, provider, sendWithContent, updateProvider])

  // Combine messages with streaming content
  const displayMessages: MessageData[] = useMemo(() => {
    const result = [...messages]
    
    // Show streaming message if there is ANY content
    if (streamingContent || streamingThought || (streamingToolInvocations && streamingToolInvocations.length > 0)) {
      const streamBlocks: MessageBlock[] = []
      
      // Thinking block
      if (streamingThought) {
        streamBlocks.push({
          id: 'streaming-thinking',
          messageId: 'streaming',
          type: MessageBlockType.THINKING,
          status: MessageBlockStatus.STREAMING,
          createdAt: new Date().toISOString(),
          content: streamingThought,
        } as ThinkingMessageBlock)
      }
      
      // Tool blocks
      if (streamingToolInvocations) {
        streamingToolInvocations.forEach((inv, idx) => {
          streamBlocks.push({
            id: `streaming-tool-${idx}`,
            messageId: 'streaming',
            type: MessageBlockType.TOOL,
            status: inv.isLoading ? MessageBlockStatus.PROCESSING : MessageBlockStatus.SUCCESS,
            createdAt: new Date().toISOString(),
            toolId: `tool-${idx}`,
            toolName: inv.toolName ?? 'unknown',
            arguments: inv.input ? JSON.parse(inv.input) : undefined,
            content: inv.output ?? inv.error,
          } as ToolMessageBlock)
        })
      }
      
      // Main text block
      if (streamingContent) {
        streamBlocks.push({
          id: 'streaming-text',
          messageId: 'streaming',
          type: MessageBlockType.MAIN_TEXT,
          status: MessageBlockStatus.STREAMING,
          createdAt: new Date().toISOString(),
          content: streamingContent,
        } as MainTextMessageBlock)
      }
      
      result.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingContent,
        richContent: serializeMessageBlocks(streamBlocks),
        status: 'sending',
        createdAt: new Date(),
        model: model ? {
          id: model,
          name: model,
          provider: provider ?? 'unknown',
        } : undefined,
        modelLogoUrl: providerInfo?.logoUrl,
      })
    }
    
    return result
  }, [messages, streamingContent, streamingThought, streamingToolInvocations, model, provider, providerInfo])

  const finalMessages: MessageData[] = useMemo(() => {
    const result = [...displayMessages]

    if (pendingMessage && !hasApiKey) {
      result.push({
        id: 'pending-user-message',
        role: 'user',
        content: pendingMessage,
        status: 'sending',
        createdAt: new Date(),
      })
    }

    if (showKeyCard && !hasApiKey) {
      result.push({
        id: 'missing-api-key',
        role: 'assistant',
        content: `需要配置 ${provider?.toUpperCase() || 'AI'} 的 API 密钥才能开始聊天。\\n请在「设置 → 模型服务」中完成配置。`,
        createdAt: new Date(),
        card: {
          title: '配置 API 密钥',
          description: `为 ${provider?.toUpperCase() || 'AI'} 添加密钥后即可开始聊天。`,
          content: (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="输入 API 密钥"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
              />
              <Button
                size="sm"
                onClick={handleSaveApiKey}
                disabled={isSavingKey || apiKeyInput.trim().length === 0}
              >
                {isSavingKey ? '保存中...' : '保存'}
              </Button>
            </div>
          ),
          actionLabel: '前往模型服务',
          actionOnClick: () => {
            navigate({
              to: '/$microAppId',
              params: { microAppId: 'model-services' as MicroAppId },
            })
          },
        },
        model: model ? {
          id: model,
          name: model,
          provider: provider ?? 'unknown',
        } : undefined,
        modelLogoUrl: providerInfo?.logoUrl,
      })
    }

    return result
  }, [
    apiKeyInput,
    displayMessages,
    handleSaveApiKey,
    hasApiKey,
    isSavingKey,
    model,
    navigate,
    pendingMessage,
    provider,
    providerInfo,
    showKeyCard,
  ])

  const handleSend = useCallback(async () => {
    const content = composerValue
    if (!chat || !content.trim()) return

    setComposerValue('')

    if (!hasApiKey) {
      setPendingMessage(content)
      setPendingThreadId(selectedThreadId ?? null)
      setShowKeyCard(true)
      return
    }

    await sendWithContent(content, selectedThreadId ?? null)
  }, [composerValue, chat, hasApiKey, selectedThreadId, sendWithContent])


  const handleStop = useCallback(() => {
    stop()
  }, [stop])

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
  }, [])

  const handleRetry = useCallback(async (messageId: string) => {
    // Find the message to retry
    const message = rawMessages?.find(m => resolveRowId(m) === messageId)
    if (!message || message.role !== 'user') return
    
    // Re-send the user message content
    const content = message.content
    if (!content || !selectedThreadId) return
    
    try {
      // Transform to old format for sendMessage
      const oldMessages = messages
        .filter(m => m.id !== messageId) // Exclude the message being retried
        .map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content ?? '',
        }))
      await sendMessage(content, oldMessages)
    } catch (e) {
      console.error('Retry failed:', e)
    }
  }, [rawMessages, messages, selectedThreadId, sendMessage])

  const handleDelete = useCallback(async (messageId: string) => {
    if (!selectedThreadId) return
    if (!confirm('确定要删除这条消息吗？')) return
    
    try {
      await mutations.deleteMessage.mutateAsync({
        id: messageId,
        threadId: selectedThreadId,
      })
    } catch (e) {
      console.error('Delete message failed:', e)
    }
  }, [selectedThreadId, mutations])

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

  if (!chat) return null

  // 是否正在加载实体数据
  const isEntityLoading = contactLoading || agentLoading

  return (
    <TooltipProvider>
      <div className="flex-1 flex h-full overflow-hidden bg-muted/30">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          {/* Error Toast */}
          {error && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-destructive/90 text-destructive-foreground text-sm rounded-lg shadow-lg">
              {error}
              <button
                className="ml-2 underline"
                onClick={() => setError(null)}
              >
                关闭
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
            {msgsLoading || apiKeyLoading || isEntityLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <MessageList
                messages={finalMessages}
                isEmpty={finalMessages.length === 0}
                isLoading={msgsLoading}
                variant="docs"
                displayMode="assistant"
                showAvatar={true}
                showTitle={true}
                streamingMessageId={isAILoading ? 'streaming' : undefined}
                onCopy={handleCopy}
                onRetry={handleRetry}
                onDelete={handleDelete}
                emptyState={
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">开始和 {agent?.name || provider} 聊天吧</p>
                    </div>
                  </div>
                }
              />
            )}
          </div>

          {/* Inputbar (Cherry Studio + Lobe Chat 对齐) */}
          <Inputbar
            ref={inputbarRef}
            value={composerValue}
            onChange={setComposerValue}
            onSend={handleSend}
            onStop={handleStop}
            disabled={false}
            isGenerating={isAILoading}
            placeholder="输入消息..."
            toolsProps={{
              onDeepThinkingClick: () => setDeepThinkingActive(!deepThinkingActive),
              onWebSearchClick: () => setWebSearchActive(!webSearchActive),
              deepThinkingActive,
              webSearchActive,
            }}
          />
        </div>

      </div>
    </TooltipProvider>
  )
}
