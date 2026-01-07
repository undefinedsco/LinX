import * as React from "react"
import { Check, Search, Box, Globe, Image as ImageIcon, Zap, Brain } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

import { DEFAULT_AGENT_PROVIDERS } from "@linx/models"

// Capability Types
export type ModelCapability = 'vision' | 'function_calling' | 'web_search' | 'reasoning' | 'embedding' | 'rerank' | 'free'

export interface ModelOption {
  id: string
  name: string
  providerId: string
  providerName: string
  capabilities: ModelCapability[]
  description?: string
}

interface ModelSelectorProps {
  value?: string
  onChange?: (value: string) => void
  type?: 'chat' | 'voice' | 'video'
  placeholder?: string
  className?: string
}

// Generate Chat Models from DEFAULT_AGENT_PROVIDERS
const CHAT_MODELS: ModelOption[] = DEFAULT_AGENT_PROVIDERS.flatMap(provider => 
  provider.models.map(model => ({
    id: model.id,
    name: model.displayName,
    providerId: provider.slug,
    providerName: provider.displayName,
    // Simple capability inference based on model ID
    capabilities: [
      model.id.includes('4o') || model.id.includes('claude-3') || model.id.includes('gemini') ? 'vision' : null,
      'function_calling',
      model.id.includes('free') ? 'free' : null,
      model.id.includes('reasoning') || model.id.includes('o1') ? 'reasoning' : null
    ].filter(Boolean) as ModelCapability[],
    description: undefined
  }))
)

// Mock Data for other types
const MOCK_MODELS: Record<string, ModelOption[]> = {
  chat: CHAT_MODELS,
  voice: [
    { id: 'tts-1', name: 'TTS-1', providerId: 'openai', providerName: 'OpenAI', capabilities: ['free'] },
    { id: 'eleven-turbo-v2', name: 'Turbo v2', providerId: 'elevenlabs', providerName: 'ElevenLabs', capabilities: [] },
  ],
  video: [
    { id: 'heygen-v2', name: 'Avatar v2', providerId: 'heygen', providerName: 'HeyGen', capabilities: ['vision'] },
  ]
}

// Capability Icon Helper
const CapabilityIcon = ({ type, showLabel }: { type: ModelCapability, showLabel?: boolean }) => {
  let icon = null
  let label = ''
  let color = ''

  switch (type) {
    case 'vision': icon = <ImageIcon className="w-3 h-3" />; label = '视觉'; color = 'text-green-500 bg-green-500/10'; break
    case 'function_calling': icon = <Box className="w-3 h-3" />; label = '工具'; color = 'text-orange-500 bg-orange-500/10'; break
    case 'web_search': icon = <Globe className="w-3 h-3" />; label = '联网'; color = 'text-blue-500 bg-blue-500/10'; break
    case 'reasoning': icon = <Brain className="w-3 h-3" />; label = '推理'; color = 'text-purple-500 bg-purple-500/10'; break
    case 'free': icon = <Zap className="w-3 h-3" />; label = '免费'; color = 'text-yellow-500 bg-yellow-500/10'; break
    default: return null
  }

  if (showLabel) {
    return (
      <Badge variant="outline" className={cn("gap-1 font-normal py-0 px-2 h-5 text-[10px] border-transparent", color)}>
        {icon}
        <span>{label}</span>
      </Badge>
    )
  }
  return <div className={cn("p-1 rounded-sm", color)}>{icon}</div>
}

// Provider Icon
const ProviderIcon = ({ name }: { name: string }) => {
  const colors: Record<string, string> = {
    O: 'bg-green-600', A: 'bg-orange-400', G: 'bg-blue-500', D: 'bg-indigo-600', E: 'bg-slate-800', H: 'bg-purple-600',
  }
  return (
    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0", colors[name[0]] || 'bg-slate-500')}>
      {name.slice(0, 1)}
    </div>
  )
}

export function ModelSelector({ value, onChange, type = 'chat', placeholder, className }: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [selectedTags, setSelectedTags] = React.useState<ModelCapability[]>([])
  
  const models = React.useMemo(() => MOCK_MODELS[type] || [], [type])
  const selectedModel = React.useMemo(() => models.find(m => m.id === value), [models, value])

  const availableTags = React.useMemo(() => {
    const set = new Set<ModelCapability>()
    models.forEach(m => m.capabilities.forEach(c => set.add(c)))
    return Array.from(set)
  }, [models])

  const filteredModels = React.useMemo(() => {
    let result = models
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(lower) || m.id.toLowerCase().includes(lower))
    }
    if (selectedTags.length > 0) {
      result = result.filter(m => selectedTags.every(tag => m.capabilities.includes(tag)))
    }
    return result
  }, [models, search, selectedTags])

  // Group by Provider
  const groups = React.useMemo(() => {
    const g: Record<string, ModelOption[]> = {}
    filteredModels.forEach(m => {
      if (!g[m.providerName]) g[m.providerName] = []
      g[m.providerName].push(m)
    })
    return g
  }, [filteredModels])

  const toggleTag = (tag: ModelCapability) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={cn("h-full w-full justify-between hover:bg-muted/50 p-0 font-normal", className)}>
          <div className="flex items-center gap-2 truncate">
            {selectedModel ? (
              <>
                <ProviderIcon name={selectedModel.providerName} />
                <span className="truncate text-sm font-medium">{selectedModel.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground/50 text-sm">{placeholder || "选择模型..."}</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[400px] p-0 overflow-hidden flex flex-col max-h-[500px]" align="start">
        {/* Header: Search + Tags */}
        <div className="p-3 pb-2 border-b border-border/40 space-y-2 bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="搜索模型..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-transparent focus:bg-background focus:border-primary/20 transition-all"
              autoFocus
            />
          </div>
          
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map(tag => (
                <div 
                  key={tag} 
                  onClick={() => toggleTag(tag)} 
                  className={cn(
                    "cursor-pointer transition-all active:scale-95",
                    selectedTags.includes(tag) ? "opacity-100" : "opacity-50 hover:opacity-80"
                  )}
                >
                  <CapabilityIcon type={tag} showLabel />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <ScrollArea className="flex-1 max-h-[350px]">
          <div className="p-2 space-y-3">
            {Object.keys(groups).length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Box className="w-8 h-8 opacity-20" />
                <span>没有找到模型</span>
              </div>
            ) : (
              Object.entries(groups).map(([provider, items]) => (
                <div key={provider} className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    {provider}
                  </div>
                  {items.map((model) => (
                    <div
                      key={model.id}
                      onClick={() => { onChange?.(model.id); setOpen(false); }}
                      className={cn(
                        "relative flex items-center justify-between px-2 py-2 rounded-lg border border-transparent transition-all cursor-pointer group",
                        value === model.id 
                          ? "bg-primary/5 border-primary/10" 
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ProviderIcon name={model.providerName} />
                        <div className="flex flex-col min-w-0 gap-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("font-medium text-sm", value === model.id ? "text-primary" : "text-foreground")}>
                              {model.name}
                            </span>
                            <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              {model.capabilities.map(cap => <CapabilityIcon key={cap} type={cap} />)}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 font-mono truncate">
                            {model.id}
                          </span>
                        </div>
                      </div>
                      {value === model.id && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}