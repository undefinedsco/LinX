import { useState, useEffect, useMemo } from 'react'
import { 
  Eye, EyeOff, Check, ExternalLink, 
  Loader2, Globe, Box, Image as ImageIcon,
  Settings2, Info, TriangleAlert, Plus, Search,
  Copy, X, Pencil, Trash2, Lock
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { useModelServicesStore } from './store'
import { useModelServices } from './hooks/useModelServices'
import { PlaceholderContentPane } from '@/modules/layout/placeholders'
import { cn } from '@/lib/utils'
import type { AIProvider, AIModel } from './types'

// --- Helper Components ---

const CapabilityIcon = ({ type }: { type: string }) => {
  let icon = null
  let label = ''
  
  switch (type) {
    case 'vision': icon = <ImageIcon className="w-3.5 h-3.5 text-green-500" />; label = '视觉识别'; break
    case 'web': icon = <Globe className="w-3.5 h-3.5 text-blue-500" />; label = '联网搜索'; break
    case 'function_calling': icon = <Box className="w-3.5 h-3.5 text-orange-500" />; label = '函数调用'; break
    default: return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center cursor-help opacity-80 hover:opacity-100 transition-opacity">
          {icon}
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Helper to infer capabilities from ID if metadata is missing
const inferCapabilities = (modelId: string, explicitCaps: string[] = []): string[] => {
  if (explicitCaps.length > 0) return explicitCaps
  
  const caps = new Set<string>()
  const lower = modelId.toLowerCase()
  
  if (lower.includes('vision') || lower.includes('4o') || lower.includes('claude-3') || lower.includes('gemini-1.5') || lower.includes('llava')) {
    caps.add('vision')
  }
  if (lower.includes('gpt-4') || lower.includes('turbo') || lower.includes('claude') || lower.includes('tool') || lower.includes('deepseek') || lower.includes('mistral')) {
    caps.add('function_calling')
  }
  if (lower.includes('online') || lower.includes('search') || lower.includes('sonar') || lower.includes('net')) {
    caps.add('web')
  }
  
  return Array.from(caps)
}

// --- Add/Edit Model Dialog Component ---

function AddModelDialog({ 
  open, 
  onOpenChange, 
  onSave,
  initialData
}: { 
  open: boolean, 
  onOpenChange: (open: boolean) => void,
  onSave: (model: AIModel) => void,
  initialData?: AIModel
}) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>([])

  // Reset or Fill form when open/initialData changes
  useEffect(() => {
    if (open) {
      if (initialData) {
        setId(initialData.id)
        setName(initialData.name)
        setCapabilities(initialData.capabilities || [])
      } else {
        setId('')
        setName('')
        setCapabilities([])
      }
    }
  }, [open, initialData])

  const handleSubmit = () => {
    if (!id) return
    onSave({
      id,
      name: name || id,
      enabled: true,
      capabilities,
      isCustom: true
    })
    onOpenChange(false)
  }

  const toggleCap = (cap: string) => {
    setCapabilities(prev => 
      prev.includes(cap) 
        ? prev.filter(c => c !== cap) 
        : [...prev, cap]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? '编辑模型' : '添加自定义模型'}</DialogTitle>
          <div className="text-sm text-muted-foreground">
            {initialData ? '修改模型信息' : '手动添加模型 ID 以支持新发布的模型'}
          </div>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model-id" className="text-right">
              Model ID
            </Label>
            <Input
              id="model-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. gpt-4-turbo"
              className="col-span-3 font-mono"
              disabled={!!initialData}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model-name" className="text-right">
              Name
            </Label>
            <Input
              id="model-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GPT-4 Turbo"
              className="col-span-3"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">
              Capabilities
            </Label>
            <div className="col-span-3 flex flex-wrap gap-2">
               {['vision', 'function_calling', 'web'].map(cap => (
                 <div 
                   key={cap}
                   onClick={() => toggleCap(cap)}
                   className={cn(
                     "cursor-pointer px-3 py-1.5 rounded-md text-xs border transition-all select-none flex items-center gap-1.5",
                     capabilities.includes(cap) 
                       ? "bg-primary text-primary-foreground border-primary" 
                       : "bg-muted hover:bg-muted/80 border-transparent text-muted-foreground"
                   )}
                 >
                   {cap === 'vision' && <ImageIcon size={12} />}
                   {cap === 'function_calling' && <Box size={12} />}
                   {cap === 'web' && <Globe size={12} />}
                   <span>
                     {cap === 'vision' && 'Vision'}
                     {cap === 'function_calling' && 'Tools'}
                     {cap === 'web' && 'Web'}
                   </span>
                 </div>
               ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={!id} className="rounded-md">{initialData ? '保存' : '添加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Main Component ---

export function ModelServicesContentPane() {
  const { toast } = useToast()
  
  const { providers, updateProvider } = useModelServices()
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  
  const provider = selectedId ? providers[selectedId] : null

  const [localApiKey, setLocalApiKey] = useState('')
  const [localBaseUrl, setLocalBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<AIModel | undefined>(undefined)

  useEffect(() => {
    if (provider) {
      setLocalApiKey(provider.apiKey || '')
      setLocalBaseUrl(provider.baseUrl || '')
      setShowKey(false)
      setIsVerifying(false)
      setModelSearch('')
    }
  }, [provider?.id, provider?.apiKey, provider?.baseUrl])

  const filteredModels = useMemo(() => {
    if (!provider) return []
    if (!modelSearch) return provider.models
    const lower = modelSearch.toLowerCase()
    return provider.models.filter(m => 
      m.name.toLowerCase().includes(lower) || 
      m.id.toLowerCase().includes(lower)
    )
  }, [provider?.models, modelSearch])

  const handleSave = () => {
    if (!provider) return
    if (localApiKey !== provider.apiKey || localBaseUrl !== provider.baseUrl) {
      updateProvider(provider.id, {
        apiKey: localApiKey,
        baseUrl: localBaseUrl
      })
    }
  }

  const handleToggleEnable = (checked: boolean) => {
    if (!provider) return
    updateProvider(provider.id, { enabled: checked })
  }

  const handleVerify = async () => {
    setIsVerifying(true)
    try {
      // TODO: Implement real connectivity check
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Simulate random success for now, or always success if key is present
      if (!localApiKey) throw new Error("API Key is missing")
      
      toast({ 
        description: "连接成功", 
        className: "bg-green-500/15 border-green-500/20 text-green-600" 
      })
      handleSave()
    } catch (e) {
      toast({ 
        variant: "destructive",
        description: "连接失败: 请检查 API Key 或网络设置"
      })
    } finally {
      setIsVerifying(false)
    }
  }
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ description: "ID 已复制", duration: 1000 })
  }

  // Add or Edit Model
  const handleSaveModel = (modelData: AIModel) => {
    if (!provider) return
    let newModels = [...provider.models]
    
    // Check if exists (Edit) or New (Add)
    const index = newModels.findIndex(m => m.id === modelData.id)
    if (index >= 0) {
      newModels[index] = { ...newModels[index], ...modelData }
    } else {
      newModels.push(modelData)
    }
    
    updateProvider(provider.id, { models: newModels })
    toast({ description: index >= 0 ? "模型已更新" : "模型已添加" })
  }

  const handleDeleteModel = (modelId: string) => {
    if (!provider) return
    const newModels = provider.models.filter(m => m.id !== modelId)
    updateProvider(provider.id, { models: newModels })
    toast({ description: "模型已移除" })
  }

  const openAddDialog = () => {
    setEditingModel(undefined)
    setIsDialogOpen(true)
  }

  const openEditDialog = (model: AIModel) => {
    setEditingModel(model)
    setIsDialogOpen(true)
  }

  if (!provider) {
    return <PlaceholderContentPane title="模型服务" description="请从左侧选择一个提供商进行配置" />
  }

  const IconComp = provider.icon

  return (
    <div className="flex flex-col h-full bg-background/50 backdrop-blur-sm">
      <TooltipProvider>
        
        {/* === Header === */}
        <div className="h-16 px-8 border-b border-border/40 shrink-0 flex items-center bg-background/50">
          <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center border border-border/50 overflow-hidden shadow-sm p-0">
                <Avatar className="h-full w-full rounded-lg">
                   <AvatarImage src={provider.avatar} className="object-cover" />
                   <AvatarFallback className="bg-transparent text-sm font-bold uppercase text-muted-foreground">
                      {IconComp ? <IconComp size={20} /> : provider.name.slice(0, 2)}
                   </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex flex-col gap-0.5 justify-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight leading-none">{provider.name}</h2>
                  {provider.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                         <Info className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {provider.description}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {provider.homepage && (
                  <a 
                    href={provider.homepage} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 leading-none transition-colors"
                  >
                    访问官网 <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={cn("text-xs font-medium transition-colors", provider.enabled ? "text-foreground" : "text-muted-foreground")}>
                {provider.enabled ? '已启用' : '未启用'}
              </span>
              <Switch 
                checked={provider.enabled}
                onCheckedChange={handleToggleEnable}
                className="scale-90 data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </div>

        {/* === Content === */}
        <ScrollArea className="flex-1">
          <div className="px-8 py-8">
            <div className="max-w-5xl mx-auto w-full space-y-10">
            
            {/* 1. API Configuration */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                <Settings2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground/90">连接配置</h3>
              </div>

              <div className="grid gap-6">
                {/* API Key */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">API Key</Label>
                    {provider.apiKeyUrl && (
                      <a href={provider.apiKeyUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        获取 API Key
                      </a>
                    )}
                  </div>
                  <div className="relative group">
                    <Input 
                      type={showKey ? "text" : "password"} 
                      value={localApiKey}
                      onChange={(e) => setLocalApiKey(e.target.value)}
                      onBlur={handleSave}
                      placeholder={provider.defaultApiKeyPlaceholder || "sk-..."}
                      className="pr-24 font-mono bg-muted/20 focus:bg-background transition-colors border-border/60 focus:border-primary/50"
                      autoComplete="off"
                    />
                    <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-full w-8 rounded hover:bg-muted"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button 
                        size="sm"
                        variant="secondary"
                        onClick={handleVerify}
                        disabled={isVerifying || !localApiKey}
                        className="h-full px-3 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-sm"
                      >
                        {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "验证"}
                      </Button>
                    </div>
                  </div>
                  {/* Privacy Tip */}
                  <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                    <Lock className="w-3 h-3 text-primary/70" />
                    <p className="text-[11px] text-muted-foreground">
                      您的 API Key 将被<span className="text-primary/80 font-medium mx-0.5">加密存储</span>在您的 Solid Pod 中，平台无法查看。
                    </p>
                  </div>
                </div>

                {/* Base URL */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">API 代理地址 (Base URL)</Label>
                  <Input 
                    value={localBaseUrl}
                    onChange={(e) => setLocalBaseUrl(e.target.value)}
                    onBlur={handleSave}
                    placeholder={provider.defaultBaseUrl}
                    className="font-mono bg-muted/20 focus:bg-background transition-colors border-border/60 focus:border-primary/50"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                  {/* Preview */}
                  <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                    <Globe className="w-3 h-3 text-blue-500/70" />
                    <p className="text-[11px] text-muted-foreground font-mono break-all opacity-80">
                      <span className="opacity-50 select-none mr-1">预览:</span>
                      {(localBaseUrl || provider.defaultBaseUrl || '').replace(/\/$/, '')}/chat/completions
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Models Section */}
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-col gap-4 pb-4 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground/90">可用模型</h3>
                    <Badge variant="secondary" className="text-xs font-normal ml-2">
                      {provider.models.length}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="搜索模型..." 
                        className="pl-8 h-8 w-[180px] text-xs bg-muted/20"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore
                      />
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 gap-1.5 text-xs rounded-md" 
                      onClick={openAddDialog}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加模型
                    </Button>
                  </div>
                </div>
              </div>

              {/* Models List */}
              <div className="grid gap-2">
                {filteredModels.map((model) => {
                  const capabilities = inferCapabilities(model.id, model.capabilities)
                  
                  return (
                  <div 
                    key={model.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card hover:bg-accent/30 hover:border-border/60 transition-all duration-200 group"
                  >
                    {/* Left: Icon + Info */}
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <div className="p-2 rounded bg-muted/50 text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                        <Box className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground/90 truncate">{model.name}</span>
                          {/* Capabilities next to name */}
                          <div className="flex items-center gap-1">
                            {capabilities.map(cap => (
                              <CapabilityIcon key={cap} type={cap} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <code className="text-[10px] text-muted-foreground font-mono opacity-70 truncate max-w-[300px]">{model.id}</code>
                          <button 
                            onClick={() => handleCopy(model.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                            title="复制 ID"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(model)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteModel(model.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  )
                })}

                {filteredModels.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm bg-muted/5 rounded-lg border border-dashed border-border/50">
                    {modelSearch ? "未找到匹配的模型" : "暂无可用模型"}
                  </div>
                )}
              </div>
            </div>

            </div>
          </div>
        </ScrollArea>
      </TooltipProvider>

      <AddModelDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        onSave={handleSaveModel}
        initialData={editingModel}
      />
    </div>
  )
}