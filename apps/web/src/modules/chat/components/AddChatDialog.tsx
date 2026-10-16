import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { ModelSelector } from '@/components/ui/model-selector'
import type { ModelOption } from '@/components/ui/model-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CHAT_AGENT_PROVIDERS } from '@/lib/agent-providers'
import { useChatStore } from '../store'
import { useChatMutations } from '../collections'
import { AddFriendForm, CreateGroupDialog } from '@/modules/contacts'
import {
  DEFAULT_RUNTIME_BASE_REF,
  DEFAULT_RUNTIME_TOOL,
  createAndStartRuntimeSession,
  isRuntimeSessionMode,
  resolveLocalContainer,
  type RuntimeToolType,
} from '../runtime-client'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { useModelServices } from '@/modules/model-services/data/use-model-services'

interface AddChatDialogProps {
  onCreated?: (id: string) => void
}

export function AddChatDialog({ onCreated }: AddChatDialogProps) {
  const wasOpenRef = useRef(false)
  const isOpen = useChatStore((state) => state.isAddDialogOpen)
  const dialogMode = useChatStore((state) => state.addDialogMode)
  const closeAddDialog = useChatStore((state) => state.closeAddDialog)
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const { toast } = useToast()

  const agentProviders = CHAT_AGENT_PROVIDERS
  const { providers: configuredProviders } = useModelServices()
  const mutations = useChatMutations()
  const runtimeAvailable = isRuntimeSessionMode()
  const configuredModelOptions = useMemo<ModelOption[]>(() =>
    Object.values(configuredProviders).flatMap((configuredProvider) =>
      configuredProvider.enabled
        ? configuredProvider.models
          .filter((configuredModel) => configuredModel.enabled)
          .map((configuredModel) => ({
            id: `${configuredProvider.id}/${configuredModel.id}`,
            name: configuredModel.name,
            providerId: configuredProvider.id,
            providerName: configuredProvider.name,
            capabilities: configuredModel.capabilities as ModelOption['capabilities'],
          }))
        : []
    ), [configuredProviders])

  // AI Agent form state
  const [agentName, setAgentName] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [createRuntime, setCreateRuntime] = useState(false)
  const [runtimeRepoPath, setRuntimeRepoPath] = useState('')
  const [runtimeFolderPath, setRuntimeFolderPath] = useState('')
  const [runtimeTool, setRuntimeTool] = useState<RuntimeToolType>(DEFAULT_RUNTIME_TOOL)
  const [runtimeBaseRef, setRuntimeBaseRef] = useState(DEFAULT_RUNTIME_BASE_REF)
  const [runtimeBranch, setRuntimeBranch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setAgentName('')
    setInstructions('')
    setCreateRuntime(false)
    setRuntimeRepoPath('')
    setRuntimeFolderPath('')
    setRuntimeTool(DEFAULT_RUNTIME_TOOL)
    setRuntimeBaseRef(DEFAULT_RUNTIME_BASE_REF)
    setRuntimeBranch('')
    setIsSubmitting(false)
    setError(null)

    const configuredDefault = configuredModelOptions[0]
    if (configuredDefault) {
      setProvider(configuredDefault.providerId)
      setModel(configuredDefault.id)
    } else {
      const defaultProvider = agentProviders[0]?.slug ?? 'openai'
      setProvider(defaultProvider)
      const models = agentProviders.find((item) => item.slug === defaultProvider)?.models
      setModel(models?.[0]?.id ?? 'gpt-4o-mini')
    }
  }, [isOpen, agentProviders, configuredModelOptions])

  const handleModelChange = (newModelId: string) => {
    setModel(newModelId)
    const configuredProvider = configuredModelOptions.find((item) => item.id === newModelId)?.providerId
    if (configuredProvider) {
      setProvider(configuredProvider)
      return
    }
    const foundProvider = agentProviders.find(p => p.models.some(m => m.id === newModelId))
    if (foundProvider) {
      setProvider(foundProvider.slug)
    }
  }

  const handleCreateAgent = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (mutations.createAIChat.isPending || isSubmitting) return

    const shouldCreateRuntime = runtimeAvailable && createRuntime
    const normalizedRepoPath = runtimeRepoPath.trim()
    const normalizedFolderPath = runtimeFolderPath.trim() || normalizedRepoPath
    const normalizedBaseRef = runtimeBaseRef.trim() || DEFAULT_RUNTIME_BASE_REF
    const normalizedBranch = runtimeBranch.trim()

    if (shouldCreateRuntime && !normalizedRepoPath) {
      setError('启用运行时会话时请先填写仓库路径。')
      return
    }

    try {
      setIsSubmitting(true)
      const name = agentName.trim() || `${provider}/${model}`
      
      const chat = await mutations.createAIChat.mutateAsync({
        title: name,
        provider: provider.trim(),
        model: model.trim(),
        systemPrompt: instructions.trim() || undefined,
      })

      const id = chat.id
      if (id) {
        let threadId: string | null = null

        try {
          const thread = await mutations.createThread.mutateAsync({
            chatId: id,
            title: '默认话题',
          })
          if (thread.id) {
            threadId = thread.id
          }
        } catch (threadError: any) {
          console.error('Create default thread failed:', threadError)
          selectChat(id)
          closeAddDialog()
          onCreated?.(id)
          toast({
            title: '聊天已创建',
            description: '会话还没准备好，进入后会自动补好，可以继续使用。',
          })
          return
        }

        if (shouldCreateRuntime && threadId) {
          try {
            const requestedWorkspaceUri = await resolveLocalContainer(normalizedFolderPath)
            const workspaceUri = await mutations.ensureThreadWorkspace.mutateAsync({
              threadId,
              workspaceUri: requestedWorkspaceUri,
              title: '默认话题',
              repoPath: normalizedRepoPath,
              folderPath: normalizedFolderPath,
              baseRef: normalizedBaseRef,
              branch: normalizedBranch || undefined,
            })
            await createAndStartRuntimeSession({
              threadId,
              container: workspaceUri,
              title: '默认话题',
              repoPath: normalizedRepoPath,
              folderPath: normalizedFolderPath,
              tool: runtimeTool,
              baseRef: normalizedBaseRef,
              branch: normalizedBranch || undefined,
            })
          } catch (runtimeError: any) {
            console.error('Create runtime session failed:', runtimeError)
            toast({
              title: '运行时会话创建失败',
              description: formatErrorForUser(
                runtimeError,
                '聊天已创建，可在会话工具栏重试运行时会话。',
              ),
            })
          }
        } else if (threadId) {
          try {
            await mutations.ensureThreadWorkspace.mutateAsync({
              threadId,
              title: '默认话题',
            })
          } catch (workspaceError: any) {
            console.error('Bind default Pod workspace failed:', workspaceError)
            toast({
              title: '默认空间绑定失败',
              description: formatErrorForUser(
                workspaceError,
                '聊天已创建，但默认空间暂未绑定。进入会话后可继续使用。',
              ),
            })
          }
        }
        selectChat(id)
        if (threadId) {
          selectThread(threadId)
        }
        onCreated?.(id)
      }
      closeAddDialog()
    } catch (err: any) {
      setError(formatErrorForUser(err, '创建失败。请确认当前空间可写后再试。'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const getTitle = () => {
    switch (dialogMode) {
      case 'ai': return '创建聊天'
      case 'friend': return '添加朋友'
      case 'group': return '发起群聊'
      default: return '创建'
    }
  }

  const getDescription = () => {
    switch (dialogMode) {
      case 'ai': return '创建一个会保存到当前空间的聊天'
      case 'friend': return '粘贴对方的账号，找到后添加为朋友。'
      case 'group': return '创建多人聊天群组'
      default: return ''
    }
  }

  // AI Agent creation form
  const agentForm = (
    <form onSubmit={handleCreateAgent} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="agent-name">助手名称</Label>
        <Input
          id="agent-name"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="例如：代码助手、翻译助手"
        />
        <p className="text-xs text-muted-foreground">
          留空将使用当前模型服务作为名称
        </p>
      </div>

      <div className="space-y-2">
        <Label>默认模型</Label>
        <ModelSelector
          type="chat"
          value={model}
          onChange={handleModelChange}
          models={configuredModelOptions.length > 0 ? configuredModelOptions : undefined}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">做事的方法（可选）</Label>
        <Textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="例如：先给结论，再列出处；拿不准的先问我。"
          rows={3}
        />
      </div>

      {runtimeAvailable && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="create-runtime" className="text-sm">同时创建运行时会话</Label>
              <p className="text-xs text-muted-foreground">
                为默认话题直接绑定文件夹，创建后即可远程继续聊天。
              </p>
            </div>
            <Switch
              id="create-runtime"
              checked={createRuntime}
              onCheckedChange={setCreateRuntime}
            />
          </div>

          {createRuntime && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="runtime-repo-path">仓库路径</Label>
                <Input
                  id="runtime-repo-path"
                  value={runtimeRepoPath}
                  onChange={(event) => setRuntimeRepoPath(event.target.value)}
                  placeholder="例如：/Users/ganlu/develop/linx"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="runtime-folder-path">文件夹路径</Label>
                <Input
                  id="runtime-folder-path"
                  value={runtimeFolderPath}
                  onChange={(event) => setRuntimeFolderPath(event.target.value)}
                  placeholder="留空则默认使用仓库路径"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="runtime-tool">工具</Label>
                  <Input
                    id="runtime-tool"
                    value={runtimeTool}
                    onChange={(event) => setRuntimeTool(event.target.value as RuntimeToolType)}
                    placeholder={DEFAULT_RUNTIME_TOOL}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="runtime-base-ref">Base Ref</Label>
                  <Input
                    id="runtime-base-ref"
                    value={runtimeBaseRef}
                    onChange={(event) => setRuntimeBaseRef(event.target.value)}
                    placeholder={DEFAULT_RUNTIME_BASE_REF}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="runtime-branch">Branch</Label>
                  <Input
                    id="runtime-branch"
                    value={runtimeBranch}
                    onChange={(event) => setRuntimeBranch(event.target.value)}
                    placeholder="留空则自动生成"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={closeAddDialog}
          className="flex-1"
        >
          取消
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={mutations.createAIChat.isPending || isSubmitting}
        >
          <Plus className="w-4 h-4 mr-1" />
          {isSubmitting ? '创建中...' : '创建'}
        </Button>
      </div>
    </form>
  )

  if (dialogMode === 'group') {
    return (
      <CreateGroupDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeAddDialog()
          }
        }}
        onCreated={(_contactId, chatId) => {
          selectChat(chatId)
          onCreated?.(chatId)
          closeAddDialog()
        }}
      />
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeAddDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {dialogMode === 'ai' && agentForm}
        {dialogMode === 'friend' && (
          <AddFriendForm
            onAdded={({ chatId }) => {
              selectChat(chatId)
              onCreated?.(chatId)
              closeAddDialog()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
