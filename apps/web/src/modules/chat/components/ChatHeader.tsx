import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { Bot, ChevronLeft } from 'lucide-react'
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
import { useOpenAgentMethod } from '@/modules/my-ai/app/open-method'
import { ModelSelector } from '@/components/ui/model-selector'
import type { ModelOption } from '@/components/ui/model-selector'
import { useModelServices } from '@/modules/model-services/data/use-model-services'
import type { AIProvider } from '@/modules/model-services/domain/types'
import { useToast } from '@/components/ui/use-toast'
import { useChatStore } from '../store'
import { getPrimaryParticipantUri } from '../utils/chat-participants'
import { useThreadSchedule } from '../features/schedule/useThreadSchedule'
import { describeScheduleRepeat } from '../domain/schedule-label'
import { toStringArray } from '@/lib/utils'
import {
  LINX_DEFAULT_SECRETARY,
  isLinxDefaultSecretaryChat,
  useChatList,
  useChatMutations,
} from '../collections'
import { agentCollection } from '../contacts-port'
import { useEntity } from '@/lib/data/use-entity'
import { avatarTextFor, displayAssistantName } from '../domain/chat-list-model'
import {
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  contactResource,
  agentResource,
  isAgentContact,
} from '@undefineds.co/models'
import { DEFAULT_LINX_PLATFORM_MODEL_ID, LINX_PLATFORM_PROVIDER_ID, findAgentProviderForModel, getAgentProviderInfo, normalizeChatModelId } from '@/lib/agent-providers'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import {
  describeAgentWorkspaceAccess,
  readAgentAiRuntimeLocation,
  type AgentAiRuntimeLocation,
} from '../agent-runtime-location'

export function buildChatModelOptions(
  configuredProviders: Record<string, AIProvider>,
  activeProvider: string,
  activeModel: string,
): ModelOption[] {
  const options = Object.values(configuredProviders).flatMap((configuredProvider) =>
    configuredProvider.enabled ? configuredProvider.models
      .filter((configuredModel) => configuredModel.enabled)
      .map((configuredModel) => ({
        id: `${configuredProvider.id}/${configuredModel.id}`,
        name: configuredModel.name,
        providerId: configuredProvider.id,
        providerName: configuredProvider.name,
        capabilities: configuredModel.capabilities as ModelOption['capabilities'],
      }))
      : []
  )

  const normalizedProvider = activeProvider.trim()
  const normalizedModel = activeModel.trim()
  const activeId = normalizedProvider && normalizedModel
    ? `${normalizedProvider}/${normalizedModel}`
    : ''
  if (!activeId || options.some((option) => option.id === activeId)) return options

  const configuredProvider = configuredProviders[normalizedProvider]
  const configuredModel = configuredProvider?.models.find((candidate) => candidate.id === normalizedModel)
  const providerInfo = getAgentProviderInfo(normalizedProvider)
  return [
    ...options,
    {
      id: activeId,
      name: configuredModel?.name || normalizedModel,
      providerId: normalizedProvider,
      providerName: configuredProvider?.name || providerInfo?.displayName || normalizedProvider,
      capabilities: (configuredModel?.capabilities ?? []) as ModelOption['capabilities'],
    },
  ]
}

export function ChatHeader() {
  const { session } = useSession()
  const { toast } = useToast()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectChat = useChatStore((state) => state.selectChat)
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)
  const [agentNameDraft, setAgentNameDraft] = useState('')
  const [aiRuntimeLocationDraft, setAiRuntimeLocationDraft] = useState<AgentAiRuntimeLocation>('client')
  const openAgentMethod = useOpenAgentMethod()
  const [modelDraft, setModelDraft] = useState('')

  const { data: chats } = useChatList()
  const mutations = useChatMutations()
  const { providers: configuredProviders } = useModelServices()

  const chat = useMemo(
    () => chats?.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const participantList = useMemo(
    () => Array.from(new Set(toStringArray(chat?.participants))),
    [chat?.participants],
  )
  const counterparts = participantList.filter((participant) => participant !== session.info.webId)
  const isGroup = counterparts.length > 1
  const memberCount = Math.max(participantList.length, counterparts.length + 1)
  const contactUri = getPrimaryParticipantUri(chat, session.info.webId)
  const { data: contact, refresh: refreshContact } = useEntity(contactResource, contactUri)
  const agentUri = contact && isAgentContact(contact) ? contact.about : null
  const { data: agent, refresh: refreshAgent } = useEntity(agentResource, agentUri)
  const stagedSecretaryAgent = isLinxDefaultSecretaryChat(chat)
    ? agentCollection.get(LINX_DEFAULT_SECRETARY.agentId)
    : null
  const resolvedAgent = agent ?? stagedSecretaryAgent ?? null
  // While the agent row is still loading, fall back to the chat's own title rather than a placeholder.
  const isAssistant = !isGroup && Boolean(resolvedAgent || isLinxDefaultSecretaryChat(chat))
  const storedName = (typeof resolvedAgent?.name === 'string' && resolvedAgent.name) || chat?.title || '助手'
  // Same naming as the chat list: legacy default names show as “LinX 助手”.
  const displayName = isAssistant ? displayAssistantName(storedName) : storedName
  const threadSchedule = useThreadSchedule(isAssistant ? selectedThreadId : null)
  const scheduleLabel = useMemo(
    () => describeScheduleRepeat(threadSchedule.schedule)?.label ?? null,
    [threadSchedule.schedule],
  )
  const agentId = typeof resolvedAgent?.id === 'string' && resolvedAgent.id.length > 0
    ? resolvedAgent.id
    : null
  const contactId = typeof contact?.id === 'string' && contact.id.length > 0
    ? contact.id
    : isLinxDefaultSecretaryChat(chat)
      ? LINX_DEFAULT_SECRETARY.contactId
      : null

  const provider = normalizeAIConfigProviderId(typeof resolvedAgent?.provider === 'string' ? resolvedAgent.provider : '') || LINX_PLATFORM_PROVIDER_ID
  const model = normalizeChatModelId(normalizeAIConfigResourceId(typeof resolvedAgent?.model === 'string' ? resolvedAgent.model : '') || DEFAULT_LINX_PLATFORM_MODEL_ID)
  const agentAiRuntimeLocation = readAgentAiRuntimeLocation((resolvedAgent as Record<string, unknown> | null | undefined)?.metadata)
  const configuredModelOptions = useMemo(
    () => buildChatModelOptions(configuredProviders, provider, model),
    [configuredProviders, model, provider],
  )
  const selectedDraftProviderId = useMemo(() => {
    const separator = modelDraft.indexOf('/')
    if (separator > 0) {
      const candidate = modelDraft.slice(0, separator)
      if (configuredProviders[candidate] || getAgentProviderInfo(candidate)) return candidate
    }
    return findAgentProviderForModel(modelDraft)
  }, [configuredProviders, modelDraft])
  const draftProviderName = selectedDraftProviderId
    ? configuredProviders[selectedDraftProviderId]?.name || getAgentProviderInfo(selectedDraftProviderId)?.displayName
    : null
  const isSavingAgentProfile = mutations.updateAgentProfile.isPending
  const isSavingModel = mutations.updateAgentModel.isPending

  useEffect(() => {
    if (!isAgentDialogOpen) return
    setAgentNameDraft((resolvedAgent?.name as string) || chat?.title || '')
    setAiRuntimeLocationDraft(agentAiRuntimeLocation)
  }, [resolvedAgent?.name, agentAiRuntimeLocation, chat?.title, isAgentDialogOpen])

  useEffect(() => {
    if (!isModelDialogOpen) return
    setModelDraft(`${provider}/${model}`)
    setAiRuntimeLocationDraft(agentAiRuntimeLocation)
  }, [agentAiRuntimeLocation, isModelDialogOpen, model, provider])

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

  const executionConditionsRequest = useChatStore((state) => state.executionConditionsRequest)
  const lastExecutionConditionsRequest = useRef(executionConditionsRequest)
  useEffect(() => {
    if (executionConditionsRequest === lastExecutionConditionsRequest.current) return
    lastExecutionConditionsRequest.current = executionConditionsRequest
    handleOpenModelDialog()
  }, [executionConditionsRequest, handleOpenModelDialog])

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
        currentAgent: resolvedAgent ?? undefined,
        name: normalizedName,
        aiRuntimeLocation: agentAiRuntimeLocation,
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
        description: formatLoginErrorForUser(error, '请稍后重试。'),
      })
    }
  }, [
    resolvedAgent,
    agentId,
    agentNameDraft,
    agentAiRuntimeLocation,
    contactId,
    mutations.updateAgentProfile,
    refreshAgent,
    refreshContact,
    selectedChatId,
    toast,
  ])

  const handleSaveModel = useCallback(async () => {
    if (!agentId || !selectedChatId) return

    const selectedModel = modelDraft.trim()
    if (!selectedModel) {
      toast({
        title: '请先选择模型',
      })
      return
    }

    const separator = selectedModel.indexOf('/')
    const explicitProvider = separator > 0 ? selectedModel.slice(0, separator) : ''
    const knownProvider = explicitProvider && (configuredProviders[explicitProvider] || getAgentProviderInfo(explicitProvider))
    const normalizedModel = knownProvider
      ? selectedModel.slice(separator + 1)
      : selectedModel
    const nextProvider = knownProvider
      ? explicitProvider
      : findAgentProviderForModel(normalizedModel)
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
        currentAgent: resolvedAgent ?? undefined,
        provider: nextProvider,
        model: normalizedModel,
      })
      if (aiRuntimeLocationDraft !== agentAiRuntimeLocation) {
        await mutations.updateAgentProfile.mutateAsync({
          agentId,
          currentAgent: resolvedAgent ?? undefined,
          name: displayName,
          aiRuntimeLocation: aiRuntimeLocationDraft,
          chatId: selectedChatId,
          contactId: contactId ?? undefined,
        })
      }
      await Promise.all([
        refreshAgent(),
        contactId ? refreshContact() : Promise.resolve(),
      ])
      setIsModelDialogOpen(false)
    } catch (error) {
      toast({
        title: '保存模型设置失败',
        description: formatLoginErrorForUser(error, '请稍后重试。'),
      })
    }
  }, [
    resolvedAgent,
    agentId,
    contactId,
    configuredProviders,
    modelDraft,
    aiRuntimeLocationDraft,
    agentAiRuntimeLocation,
    displayName,
    mutations.updateAgentProfile,
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
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 h-8 w-8 shrink-0 md:hidden"
              aria-label="返回聊天列表"
              onClick={() => selectChat(null)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
          {chat ? (
            <>
              <button
                type="button"
                title={isAssistant ? `编辑助手设置：${displayName}` : displayName}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 shrink-0"
                onClick={isAssistant ? handleOpenAgentDialog : undefined}
              >
                <Avatar className="h-8 w-8 border border-border/50 !rounded-sm">
                  <AvatarImage src={resolvedAgent?.avatarUrl} className="!rounded-sm object-cover" />
                  <AvatarFallback className={isAssistant ? '!rounded-sm bg-primary text-primary-foreground text-xs font-semibold' : '!rounded-sm bg-primary/10 text-primary text-xs'}>
                    {avatarTextFor(isAssistant ? 'assistant' : 'person', displayName) || <Bot className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[180px] truncate text-sm font-medium">
                  {displayName}
                </span>
              </button>

              {isGroup ? (
                <span className="ml-1 shrink-0 text-xs text-muted-foreground">{memberCount} 人</span>
              ) : null}
              {isAssistant && scheduleLabel ? (
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{scheduleLabel}</span>
              ) : null}
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">聊天</span>
          )}
        </div>
      </div>

      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>助手资料</DialogTitle>
            <DialogDescription>
              名称会同步到联系人和会话。做事的方法在“我的 AI”里统一编辑，模型和运行位置在“执行条件”里。
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
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium">做事的方法</span>
              <button
                type="button"
                className="text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  if (!agentId) return
                  setIsAgentDialogOpen(false)
                  openAgentMethod(agentId)
                }}
              >
                在“我的 AI”里编辑
              </button>
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
            <DialogTitle>执行条件</DialogTitle>
            <DialogDescription>
              用哪个模型、在哪里运行。换模型不会改变助手的名字、头像和聊天记录。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>模型</Label>
              <ModelSelector
                type="chat"
                value={modelDraft}
                onChange={setModelDraft}
                models={configuredModelOptions}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
              />
            </div>
            {draftProviderName ? (
              <p className="text-xs text-muted-foreground">来自：{draftProviderName}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="chat-header-ai-runtime-location">在哪里运行</Label>
              <select
                id="chat-header-ai-runtime-location"
                aria-label="在哪里运行"
                value={aiRuntimeLocationDraft}
                onChange={(event) => setAiRuntimeLocationDraft(event.target.value === 'server' ? 'server' : 'client')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="client">这台设备（默认）</option>
                <option value="server">你的空间服务</option>
              </select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {describeAgentWorkspaceAccess(aiRuntimeLocationDraft)}
              </p>
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
