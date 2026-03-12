import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { Bot, ChevronRight, PanelRightClose, PanelRightOpen, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ModelSelector } from '@/components/ui/model-selector'
import { useToast } from '@/components/ui/use-toast'
import { useChatStore } from '../store'
import { getPrimaryParticipantUri } from '../utils/chat-participants'
import { useChatList, useChatMutations } from '../collections'
import { useEntity } from '@/lib/data/use-entity'
import {
  DEFAULT_AGENT_PROVIDERS,
  resolveRowId,
  contactTable,
  agentTable,
  ContactType,
  getBuiltinProvider,
} from '@linx/models'

function resolvePersistedId(row?: Partial<Record<string, unknown>> | null): string | null {
  const record = row as Record<string, unknown> | null | undefined
  if (!record) return null
  const id = record.id
  if (typeof id === 'string' && id.length > 0) {
    return id
  }
  return resolveRowId(record)
}

function findProviderForModel(modelId: string): string | null {
  const matchedProvider = DEFAULT_AGENT_PROVIDERS.find((provider) =>
    provider.models.some((model) => model.id === modelId),
  )
  return matchedProvider?.slug ?? null
}

export function ChatHeader() {
  const { session } = useSession()
  const { toast } = useToast()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const showRightSidebar = useChatStore((state) => state.showRightSidebar)
  const toggleRightSidebar = useChatStore((state) => state.toggleRightSidebar)
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)
  const [agentNameDraft, setAgentNameDraft] = useState('')
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')

  const { data: chats } = useChatList()
  const mutations = useChatMutations()

  const chat = useMemo(
    () => chats?.find((c) => resolveRowId(c) === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const contactUri = getPrimaryParticipantUri(chat, session.info.webId)
  const { data: contact, refresh: refreshContact } = useEntity(contactTable, contactUri)
  const agentUri = contact?.contactType === ContactType.AGENT ? contact.entityUri : null
  const { data: agent, refresh: refreshAgent } = useEntity(agentTable, agentUri)
  const agentId = useMemo(() => resolvePersistedId(agent), [agent])
  const contactId = useMemo(() => resolvePersistedId(contact), [contact])

  const provider = (agent?.provider as string) || 'openai'
  const model = (agent?.model as string) || 'gpt-4o-mini'
  const providerInfo = useMemo(() => {
    if (!provider) return null
    return getBuiltinProvider(provider)
  }, [provider])
  const draftProvider = useMemo(() => {
    const providerSlug = findProviderForModel(modelDraft)
    return providerSlug ? getBuiltinProvider(providerSlug) : null
  }, [modelDraft])
  const isSavingAgentProfile = mutations.updateAgentProfile.isPending
  const isSavingModel = mutations.updateAgentModel.isPending

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

  useEffect(() => {
    if (!isAgentDialogOpen) return
    setAgentNameDraft((agent?.name as string) || chat?.title || '')
    setInstructionsDraft((agent?.instructions as string) || '')
  }, [agent?.instructions, agent?.name, chat?.title, isAgentDialogOpen])

  useEffect(() => {
    if (!isModelDialogOpen) return
    setModelDraft(model)
  }, [isModelDialogOpen, model])

  const handleOpenAgentDialog = useCallback(() => {
    if (!agentId || !selectedChatId) {
      toast({
        title: '当前聊天没有可编辑的助手',
        description: '请先创建 AI 聊天，再修改助手设置。',
      })
      return
    }
    setIsAgentDialogOpen(true)
  }, [agentId, selectedChatId, toast])

  const handleOpenModelDialog = useCallback(() => {
    if (!agentId || !selectedChatId) {
      toast({
        title: '当前聊天没有可编辑的模型',
        description: '请先创建 AI 聊天，再修改模型设置。',
      })
      return
    }
    setIsModelDialogOpen(true)
  }, [agentId, selectedChatId, toast])

  const handleSaveAgentProfile = useCallback(async () => {
    if (!agentId || !selectedChatId) return

    const normalizedName = agentNameDraft.trim()
    if (!normalizedName) {
      toast({
        title: '助手名称不能为空',
      })
      return
    }

    try {
      await mutations.updateAgentProfile.mutateAsync({
        agentId,
        name: normalizedName,
        instructions: instructionsDraft,
        chatId: selectedChatId,
        contactId: contactId ?? undefined,
      })
      await Promise.all([
        refreshAgent(),
        contactId ? refreshContact() : Promise.resolve(),
      ])
      setIsAgentDialogOpen(false)
    } catch (error) {
      toast({
        title: '保存助手设置失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }, [
    agentId,
    agentNameDraft,
    contactId,
    instructionsDraft,
    mutations.updateAgentProfile,
    refreshAgent,
    refreshContact,
    selectedChatId,
    toast,
  ])

  const handleSaveModel = useCallback(async () => {
    if (!agentId || !selectedChatId) return

    const normalizedModel = modelDraft.trim()
    if (!normalizedModel) {
      toast({
        title: '请先选择模型',
      })
      return
    }

    const nextProvider = findProviderForModel(normalizedModel)
    if (!nextProvider) {
      toast({
        title: '无法识别模型提供方',
        description: normalizedModel,
      })
      return
    }

    try {
      await mutations.updateAgentModel.mutateAsync({
        agentId,
        provider: nextProvider,
        model: normalizedModel,
        chatId: selectedChatId,
        contactId: contactId ?? undefined,
      })
      await Promise.all([
        refreshAgent(),
        contactId ? refreshContact() : Promise.resolve(),
      ])
      setIsModelDialogOpen(false)
    } catch (error) {
      toast({
        title: '保存模型设置失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }, [
    agentId,
    contactId,
    modelDraft,
    mutations.updateAgentModel,
    refreshAgent,
    refreshContact,
    selectedChatId,
    toast,
  ])

  return (
    <>
      <div className="flex h-full w-full items-center px-4">
        <div className="flex-1 flex items-center min-w-0">
          {chat ? (
            <>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 shrink-0"
                onClick={handleOpenAgentDialog}
              >
                <Avatar className="h-8 w-8 border border-border/50 !rounded-sm">
                  <AvatarImage src={agent?.avatarUrl} className="!rounded-sm object-cover" />
                  <AvatarFallback className="!rounded-sm bg-primary/10 text-primary text-xs">
                    {agent?.name?.slice(0, 2).toUpperCase() || <Bot className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[180px] truncate text-sm font-medium">
                  {agent?.name || 'Assistant'}
                </span>
              </button>

              <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-muted-foreground/40" />

              <button
                type="button"
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                onClick={handleOpenModelDialog}
              >
                <Avatar className="h-6 w-6 border border-border/50 !rounded-sm shrink-0">
                  <AvatarImage src={providerInfo?.logoUrl} className="!rounded-sm object-cover" />
                  <AvatarFallback className="!rounded-sm bg-muted text-[10px]">
                    {provider?.slice(0, 2).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm text-muted-foreground">
                  {model || 'Select Model'}
                </span>
              </button>
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

      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>助手设置</DialogTitle>
            <DialogDescription>
              修改助手名称和系统提示词，并同步更新聊天展示名称。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat-header-agent-name">助手名称</Label>
              <Input
                id="chat-header-agent-name"
                value={agentNameDraft}
                onChange={(event) => setAgentNameDraft(event.target.value)}
                placeholder="例如：代码助手"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-header-agent-instructions">系统提示词</Label>
              <Textarea
                id="chat-header-agent-instructions"
                value={instructionsDraft}
                onChange={(event) => setInstructionsDraft(event.target.value)}
                placeholder="输入系统提示词..."
                className="min-h-[160px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAgentDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSaveAgentProfile()} disabled={isSavingAgentProfile}>
              {isSavingAgentProfile ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>模型设置</DialogTitle>
            <DialogDescription>
              切换模型时会同步更新 provider 和聊天头像。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>选择模型</Label>
              <ModelSelector
                type="chat"
                value={modelDraft}
                onChange={setModelDraft}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
              />
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Provider</div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {draftProvider?.displayName || '未识别'}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModelDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSaveModel()} disabled={isSavingModel}>
              {isSavingModel ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
