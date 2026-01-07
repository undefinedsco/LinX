/**
 * ChatRightSidebar - 右侧边栏组件
 * 
 * 包含两个可折叠区块:
 * 1. 角色设定 (System Prompt)
 * 2. 话题列表 (Threads)
 * 
 * WeChat Desktop 风格: 紧凑布局, 小圆角, 简洁
 */

import { useState, useMemo, type FC } from 'react'
import { 
  User, 
  MessageCircle, 
  Star, 
  Pencil, 
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useChatStore } from '../store'
import { useChatList, useThreadList, useChatMutations, chatOps } from '../collections'
import { resolveRowId, contactTable, agentTable, ContactType } from '@linx/models'
import { useEntity } from '@/lib/data/use-entity'

// ============================================================================
// 角色设定卡片
// ============================================================================

interface RoleSettingsCardProps {
  systemPrompt: string
  onEdit: (newPrompt: string) => void
}

const RoleSettingsCard: FC<RoleSettingsCardProps> = ({ systemPrompt, onEdit }) => {
  const [isOpen, setIsOpen] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(systemPrompt)

  const handleSave = () => {
    onEdit(editingPrompt)
    setIsEditDialogOpen(false)
  }

  const handleOpenEdit = () => {
    setEditingPrompt(systemPrompt)
    setIsEditDialogOpen(true)
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-border/50 shadow-none rounded-lg">
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  系统提示词
                </CardTitle>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 px-4 pb-3">
              <div className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-2">
                {systemPrompt || '未设置角色提示词'}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary hover:text-primary"
                onClick={handleOpenEdit}
              >
                <Pencil className="w-3 h-3 mr-1" />
                编辑
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑系统提示词</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            设置 AI 助手的角色和行为提示词
          </p>
          <Textarea
            value={editingPrompt}
            onChange={(e) => setEditingPrompt(e.target.value)}
            placeholder="输入系统提示词..."
            className="min-h-[120px] text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================================
// 话题列表卡片
// ============================================================================

interface Thread {
  id: string
  title: string
  starred?: boolean
  updatedAt?: string
}

interface ThreadListCardProps {
  threads: Thread[]
  selectedThreadId: string | null
  onSelectThread: (id: string) => void
  onStarThread: (id: string) => void
  onCreateThread: () => void
}

const ThreadListCard: FC<ThreadListCardProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onStarThread,
  onCreateThread,
}) => {
  const [isOpen, setIsOpen] = useState(true)
  const [search, setSearch] = useState('')

  // 排序并过滤
  const filteredThreads = useMemo(() => {
    let result = [...threads]
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(t => t.title.toLowerCase().includes(s))
    }
    return result.sort((a, b) => {
      if (a.starred && !b.starred) return -1
      if (!a.starred && b.starred) return 1
      return 0
    })
  }, [threads, search])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-border/50 shadow-none rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                话题列表
                <span className="text-xs text-muted-foreground font-normal">
                  ({threads.length})
                </span>
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreateThread()
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-2 pb-2">
            {/* Search Input */}
            <div className="px-2 mb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索话题..."
                  className="w-full pl-7 pr-2 py-1 text-xs bg-muted/50 border-none rounded focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <ScrollArea className="max-h-[300px]">
              {filteredThreads.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  {search ? '未找到相关话题' : '暂无话题'}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredThreads.map((thread) => (
                    <ThreadItem
                      key={thread.id}
                      thread={thread}
                      isSelected={thread.id === selectedThreadId}
                      onSelect={() => onSelectThread(thread.id)}
                      onStar={() => onStarThread(thread.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

interface ThreadItemProps {
  thread: Thread
  isSelected: boolean
  onSelect: () => void
  onStar: () => void
}

const ThreadItem: FC<ThreadItemProps> = ({
  thread,
  isSelected,
  onSelect,
  onStar,
}) => {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
      )}
    >
      {/* 收藏图标 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onStar()
        }}
        className="shrink-0"
      >
        <Star
          className={cn(
            'w-3.5 h-3.5',
            thread.starred
              ? 'text-amber-500 fill-amber-500'
              : 'text-muted-foreground/50 hover:text-amber-500'
          )}
        />
      </button>

      {/* 标题 */}
      <span className="flex-1 text-sm truncate">{thread.title}</span>
    </div>
  )
}

// ============================================================================
// 主组件
// ============================================================================

export interface ChatRightSidebarProps {}

export const ChatRightSidebar: FC<ChatRightSidebarProps> = () => {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectThread = useChatStore((state) => state.selectThread)

  // Use new collection-based hooks
  const { data: chats } = useChatList()
  const { data: rawThreads } = useThreadList(selectedChatId ?? '', { enabled: !!selectedChatId })
  const mutations = useChatMutations()

  // 当前选中的 Chat
  const currentChat = useMemo(() => {
    if (!chats || !selectedChatId) return null
    return chats.find((c) => resolveRowId(c) === selectedChatId)
  }, [chats, selectedChatId])

  // 获取 Contact
  const contactUri = (currentChat as any)?.contact
  const { data: contact } = useEntity(contactTable, contactUri)

  // 获取 Agent（当 contactType 是 agent 时）
  const agentUri = contact?.contactType === ContactType.AGENT ? contact.entityUri : null
  const { data: agent } = useEntity(agentTable, agentUri)

  // 格式化话题列表
  const threads: Thread[] = useMemo(() => {
    if (!rawThreads) return []
    return rawThreads.map((t) => ({
      id: resolveRowId(t) ?? 'unknown',
      title: t.title ?? '新话题',
      starred: t.starred ?? false,
      updatedAt: t.updatedAt ? String(t.updatedAt) : undefined,
    }))
  }, [rawThreads])

  // 处理编辑系统提示词 - 更新 Agent.instructions
  const handleEditSystemPrompt = async (newPrompt: string) => {
    if (!agentUri) {
      console.warn('No agent to update')
      return
    }
    try {
      await chatOps.updateAgentInstructions(agentUri, newPrompt)
    } catch (e) {
      console.error('Update system prompt failed:', e)
    }
  }

  // 处理收藏话题 - 使用 chatOps
  const handleStarThread = async (threadId: string) => {
    if (!selectedChatId) return
    const thread = threads.find(t => t.id === threadId)
    if (!thread) return
    try {
      await mutations.updateThread.mutateAsync({
        id: threadId,
        chatId: selectedChatId,
        starred: !thread.starred,
      })
    } catch (e) {
      console.error('Star thread failed:', e)
    }
  }

  // 处理新建话题 - 使用 chatOps
  const handleCreateThread = async () => {
    if (!selectedChatId) return
    try {
      const newThread = await mutations.createThread.mutateAsync({
        chatId: selectedChatId,
        title: `话题 ${new Date().toLocaleTimeString()}`,
      })
      // chatOps.createThread returns ThreadRow with id directly
      const threadId = newThread.id ?? resolveRowId(newThread)
      if (threadId) selectThread(threadId)
    } catch (e) {
      console.error('Create thread failed:', e)
    }
  }

  if (!selectedChatId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        选择一个聊天
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-card/50">
      {/* Header - WeChat Style Height (64px) */}
      <div className="h-16 px-4 flex items-center border-b border-border/50 shrink-0">
        <h3 className="text-sm font-medium">设置</h3>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {/* 角色设定 */}
          <RoleSettingsCard
            systemPrompt={(agent?.instructions as string) || ''}
            onEdit={handleEditSystemPrompt}
          />

          {/* 话题列表 */}
          <ThreadListCard
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectThread={selectThread}
            onStarThread={handleStarThread}
            onCreateThread={handleCreateThread}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

export default ChatRightSidebar
