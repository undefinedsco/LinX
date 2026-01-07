import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { ModelSelector } from '@/components/ui/model-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

interface AddChatDialogProps {
  onCreated?: (id: string) => void
}

export function AddChatDialog({ onCreated }: AddChatDialogProps) {
  const isOpen = useChatStore((state) => state.isAddDialogOpen)
  const dialogMode = useChatStore((state) => state.addDialogMode)
  const closeAddDialog = useChatStore((state) => state.closeAddDialog)
  const enterChat = useChatStore((state) => state.enterChat)

  const agentProviders = DEFAULT_AGENT_PROVIDERS
  const mutations = useChatMutations()

  // AI Agent form state
  const [agentName, setAgentName] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (!isOpen) return
    setAgentName('')
    setInstructions('')
    setError(null)

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

    if (mutations.createAIChat.isPending) return

    try {
      const name = agentName.trim() || `${provider}/${model}`
      
      const chat = await mutations.createAIChat.mutateAsync({
        title: name,
        provider: provider.trim(),
        model: model.trim(),
        systemPrompt: instructions.trim() || undefined,
      })

      const id = chat.id
      if (id) {
        enterChat(id)
        onCreated?.(id)
      }
      closeAddDialog()
    } catch (err: any) {
      const message =
        err?.message?.includes('401') || err?.message?.includes('403')
          ? '无权限写入，请确认已登录且拥有写权限。'
          : err?.message || '创建失败，请稍后再试。'
      setError(message)
    }
  }

  const getTitle = () => {
    switch (dialogMode) {
      case 'ai': return '创建助手'
      case 'friend': return '添加朋友'
      case 'group': return '发起群聊'
      default: return '创建'
    }
  }

  const getDescription = () => {
    switch (dialogMode) {
      case 'ai': return '配置新的 AI 对话助手'
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
        <Label>聊天模型</Label>
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
          disabled={mutations.createAIChat.isPending}
        >
          <Plus className="w-4 h-4 mr-1" />
          创建
        </Button>
      </div>
    </form>
  )

  const friendForm = (
    <div className="text-center py-8 text-muted-foreground">
      添加朋友功能即将推出
    </div>
  )

  const groupForm = (
    <div className="text-center py-8 text-muted-foreground">
      群聊功能即将推出
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeAddDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {dialogMode === 'ai' && agentForm}
        {dialogMode === 'friend' && friendForm}
        {dialogMode === 'group' && groupForm}
      </DialogContent>
    </Dialog>
  )
}
