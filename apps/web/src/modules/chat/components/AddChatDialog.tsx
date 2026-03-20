import { useEffect, useState } from 'react'
import { Loader2, Plus, Search, User, UserPlus } from 'lucide-react'
import { ModelSelector } from '@/components/ui/model-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DEFAULT_AGENT_PROVIDERS } from '@linx/models'
import { useChatStore } from '../store'
import { useChatMutations } from '../collections'
import { CreateGroupDialog } from '@/modules/contacts/components/CreateGroupDialog'
import { contactOps } from '@/modules/contacts/collections'
import {
  DEFAULT_RUNTIME_BASE_REF,
  DEFAULT_RUNTIME_TOOL,
  createAndStartRuntimeSession,
  isRuntimeSessionMode,
  resolveLocalWorkspaceUri,
  type RuntimeToolType,
} from '../runtime-client'

interface AddChatDialogProps {
  onCreated?: (id: string) => void
}

interface FriendSearchState {
  webId: string
  isSearching: boolean
  searchResult: {
    name: string
    webId: string
    avatarUrl?: string
  } | null
  error: string
}

export function AddChatDialog({ onCreated }: AddChatDialogProps) {
  const isOpen = useChatStore((state) => state.isAddDialogOpen)
  const dialogMode = useChatStore((state) => state.addDialogMode)
  const closeAddDialog = useChatStore((state) => state.closeAddDialog)
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const { toast } = useToast()

  const agentProviders = DEFAULT_AGENT_PROVIDERS
  const mutations = useChatMutations()
  const runtimeAvailable = isRuntimeSessionMode()

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
  const [friendSearch, setFriendSearch] = useState<FriendSearchState>({
    webId: '',
    isSearching: false,
    searchResult: null,
    error: '',
  })

  // Reset form when dialog opens
  useEffect(() => {
    if (!isOpen) return
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
    setFriendSearch({
      webId: '',
      isSearching: false,
      searchResult: null,
      error: '',
    })

    const defaultProvider = agentProviders[0]?.slug ?? 'openai'
    setProvider(defaultProvider)

    const models = agentProviders.find((item) => item.slug === defaultProvider)?.models
    if (models && models.length > 0) {
      setModel(models[0].id)
    } else {
      setModel('gpt-4o-mini')
    }
  }, [isOpen, agentProviders])

  const handleModelChange = (newModelId: string) => {
    setModel(newModelId)
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
        selectChat(id)
        let threadId: string | null = null

        try {
          const thread = await mutations.createThread.mutateAsync({
            chatId: id,
            title: '默认话题',
          })
          if (thread.id) {
            threadId = thread.id
            selectThread(thread.id)
          }
        } catch (threadError: any) {
          console.error('Create default thread failed:', threadError)
          closeAddDialog()
          onCreated?.(id)
          toast({
            title: '聊天已创建',
            description: '默认话题创建失败。进入会话后会自动补建，可继续使用。',
          })
          return
        }

        if (shouldCreateRuntime && threadId) {
          try {
            const requestedWorkspaceUri = await resolveLocalWorkspaceUri(normalizedFolderPath)
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
              workspaceUri,
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
              description: `聊天已创建，可在会话工具栏重试。${runtimeError?.message ? ` ${runtimeError.message}` : ''}`,
            })
          }
        }
        onCreated?.(id)
      }
      closeAddDialog()
    } catch (err: any) {
      const message =
        err?.message?.includes('401') || err?.message?.includes('403')
          ? '无权限写入，请确认已登录且拥有写权限。'
          : err?.message || '创建失败，请稍后再试。'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSearchWebId = async () => {
    const webId = friendSearch.webId.trim()
    if (!webId) {
      setFriendSearch((state) => ({ ...state, error: '请输入 WebID' }))
      return
    }

    setError(null)
    setFriendSearch((state) => ({
      ...state,
      isSearching: true,
      error: '',
      searchResult: null,
    }))

    try {
      const profile = await contactOps.fetchSolidProfile(webId)
      if (!profile) {
        setFriendSearch((state) => ({
          ...state,
          isSearching: false,
          error: '无法获取用户信息，请检查 WebID 是否正确',
        }))
        return
      }

      setFriendSearch((state) => ({
        ...state,
        isSearching: false,
        searchResult: {
          name: profile.name,
          webId: profile.webId,
          avatarUrl: profile.avatarUrl,
        },
      }))
    } catch (searchError) {
      console.error('Search WebID failed:', searchError)
      setFriendSearch((state) => ({
        ...state,
        isSearching: false,
        error: '搜索失败，请稍后再试。',
      }))
    }
  }

  const handleAddFriend = async () => {
    if (!friendSearch.searchResult || isSubmitting) return

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await contactOps.addFriend({
        name: friendSearch.searchResult.name,
        webId: friendSearch.searchResult.webId,
        avatarUrl: friendSearch.searchResult.avatarUrl,
      })
      selectChat(result.chatId)
      onCreated?.(result.chatId)
      closeAddDialog()
    } catch (friendError: any) {
      console.error('Add friend failed:', friendError)
      setError(friendError?.message || '添加好友失败，请稍后再试。')
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
      case 'ai': return '创建一个留档到 Pod 的聊天'
      case 'friend': return '添加 Solid 用户为好友'
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
          留空将使用 provider/model 作为名称
        </p>
      </div>

      <div className="space-y-2">
        <Label>默认模型</Label>
        <ModelSelector
          type="chat"
          value={model}
          onChange={handleModelChange}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">系统提示词（可选）</Label>
        <Textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="例如：你是一个专业的代码助手..."
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

  const friendForm = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="friend-webid">WebID</Label>
        <div className="flex gap-2">
          <Input
            id="friend-webid"
            value={friendSearch.webId}
            onChange={(event) => setFriendSearch((state) => ({
              ...state,
              webId: event.target.value,
              error: '',
            }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleSearchWebId()
              }
            }}
            placeholder="https://alice.solidcommunity.net/profile/card#me"
          />
          <Button type="button" variant="outline" onClick={() => void handleSearchWebId()} disabled={friendSearch.isSearching}>
            {friendSearch.isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
        {friendSearch.error && (
          <p className="text-xs text-destructive">{friendSearch.error}</p>
        )}
      </div>

      {friendSearch.searchResult ? (
        <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarImage src={friendSearch.searchResult.avatarUrl} />
              <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
                {friendSearch.searchResult.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{friendSearch.searchResult.name}</p>
              <p className="truncate text-xs text-muted-foreground">{friendSearch.searchResult.webId}</p>
            </div>
          </div>
          <Button type="button" className="w-full" onClick={() => void handleAddFriend()} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            添加为好友
          </Button>
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          <User className="mx-auto mb-2 h-10 w-10 opacity-30" />
          <p className="text-sm">输入对方 WebID 并搜索。</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" variant="outline" onClick={closeAddDialog} className="flex-1">
          取消
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => void (friendSearch.searchResult ? handleAddFriend() : handleSearchWebId())}
          disabled={friendSearch.isSearching || isSubmitting}
        >
          {friendSearch.searchResult ? '添加' : '搜索'}
        </Button>
      </div>
    </div>
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
        {dialogMode === 'friend' && friendForm}
      </DialogContent>
    </Dialog>
  )
}
