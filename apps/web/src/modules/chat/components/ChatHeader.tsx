import { useCallback, useMemo } from 'react'
import { Bot, ChevronRight, PanelRightClose, PanelRightOpen, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useChatStore } from '../store'
import { useChatList, useChatMutations } from '../collections'
import { useEntity } from '@/lib/data/use-entity'
import {
  resolveRowId,
  contactTable,
  agentTable,
  ContactType,
  getBuiltinProvider,
} from '@linx/models'

export function ChatHeader() {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const showRightSidebar = useChatStore((state) => state.showRightSidebar)
  const toggleRightSidebar = useChatStore((state) => state.toggleRightSidebar)

  const { data: chats } = useChatList()
  const mutations = useChatMutations()

  const chat = useMemo(
    () => chats?.find((c) => resolveRowId(c) === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const contactUri = (chat as any)?.contact
  const { data: contact } = useEntity(contactTable, contactUri)
  const agentUri = contact?.contactType === ContactType.AGENT ? contact.entityUri : null
  const { data: agent } = useEntity(agentTable, agentUri)

  const provider = (agent?.provider as string) || 'openai'
  const model = (agent?.model as string) || 'gpt-4o-mini'
  const providerInfo = useMemo(() => {
    if (!provider) return null
    return getBuiltinProvider(provider)
  }, [provider])

  const handleToggleStar = useCallback(async () => {
    if (!chat || !selectedChatId) return
    const currentStarred = (chat as any).starred ?? false
    try {
      await mutations.updateChat.mutateAsync({
        id: selectedChatId,
        starred: !currentStarred,
      })
    } catch (e) {
      console.error('Toggle star failed', e)
    }
  }, [chat, selectedChatId, mutations])

  return (
    <div className="flex h-full w-full items-center px-4">
      <div className="flex-1 flex items-center min-w-0">
        {chat ? (
          <>
            <div
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 px-2 py-1.5 rounded-md transition-colors shrink-0"
              onClick={() => {
                // TODO: Show Agent Settings Dialog
              }}
            >
              <Avatar className="h-8 w-8 border border-border/50 !rounded-sm">
                <AvatarImage src={agent?.avatarUrl} className="!rounded-sm object-cover" />
                <AvatarFallback className="!rounded-sm bg-primary/10 text-primary text-xs">
                  {agent?.name?.slice(0, 2).toUpperCase() || <Bot className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate max-w-[180px]">
                {agent?.name || 'Assistant'}
              </span>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mx-1" />

            <div
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 px-2 py-1.5 rounded-md transition-colors min-w-0"
              onClick={() => {
                // TODO: Show Model Selector Dialog
              }}
            >
              <Avatar className="h-6 w-6 border border-border/50 !rounded-sm shrink-0">
                <AvatarImage src={providerInfo?.logoUrl} className="!rounded-sm object-cover" />
                <AvatarFallback className="!rounded-sm bg-muted text-[10px]">
                  {provider?.slice(0, 2).toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground truncate">
                {model || 'Select Model'}
              </span>
            </div>
          </>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">聊天</span>
        )}
      </div>

      {chat && (
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={handleToggleStar}
            title={(chat as any).starred ? '取消收藏' : '收藏'}
          >
            <Star className={`w-5 h-5 ${(chat as any).starred ? 'text-amber-500 fill-amber-500' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={toggleRightSidebar}
            title={showRightSidebar ? '隐藏设置' : '显示设置'}
          >
            {showRightSidebar ? (
              <PanelRightClose className="w-5 h-5" />
            ) : (
              <PanelRightOpen className="w-5 h-5" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
