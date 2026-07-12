import {
  Box,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ModelListProjection } from '../domain/model-services-projection'

export interface ModelServicesProviderView {
  id: string
  name: string
  description?: string
  homeUrl?: string
  apiKeyUrl?: string
  defaultApiKeyPlaceholder?: string
  defaultBaseUrl?: string
  avatar?: string
  enabled: boolean
  modelCount: number
  models: ModelListProjection[]
}

export interface ModelServicesDetailViewProps {
  provider: ModelServicesProviderView | null
  queryError: string | null
  mutationError: string | null
  localApiKey: string
  localBaseUrl: string
  showKey: boolean
  isVerifying: boolean
  modelSearch: string
  isPlatformProvider: boolean
  verificationRequiresApiKey: boolean
  onApiKeyChange: (value: string) => void
  onBaseUrlChange: (value: string) => void
  onSaveConnection: () => Promise<void>
  onToggleKeyVisibility: () => void
  onToggleEnable: (enabled: boolean) => Promise<void>
  onVerify: () => Promise<void>
  onModelSearchChange: (value: string) => void
  onAddModel: () => void
  onEditModel: (modelId: string) => void
  onDeleteModel: (modelId: string) => Promise<void>
  onCopyModelId: (modelId: string) => Promise<void>
}

function CapabilityIcon({ type }: { type: string }) {
  const capability = {
    vision: { icon: ImageIcon, label: '视觉识别', className: 'text-green-500' },
    web: { icon: Globe, label: '联网搜索', className: 'text-blue-500' },
    function_calling: { icon: Box, label: '函数调用', className: 'text-orange-500' },
  }[type]
  if (!capability) return null

  const Icon = capability.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={capability.label}
          className="flex cursor-help items-center justify-center rounded-sm opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon aria-hidden="true" className={cn('h-3.5 w-3.5', capability.className)} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{capability.label}</TooltipContent>
    </Tooltip>
  )
}

export function ModelServicesDetailView({
  provider,
  queryError,
  mutationError,
  localApiKey,
  localBaseUrl,
  showKey,
  isVerifying,
  modelSearch,
  isPlatformProvider,
  verificationRequiresApiKey,
  onApiKeyChange,
  onBaseUrlChange,
  onSaveConnection,
  onToggleKeyVisibility,
  onToggleEnable,
  onVerify,
  onModelSearchChange,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onCopyModelId,
}: ModelServicesDetailViewProps) {
  if (!provider) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background px-8 text-center">
        <h2 className="text-base font-medium">模型服务</h2>
        {queryError ? (
          <p role="alert" className="text-sm text-destructive">{queryError}</p>
        ) : (
          <p className="text-sm text-muted-foreground">请从左侧选择一个提供商进行配置</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <TooltipProvider>
        <div className="flex h-16 shrink-0 items-center border-b border-border/40 bg-background/50 px-8">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/50 p-0 shadow-sm">
                <Avatar className="h-full w-full rounded-lg">
                  <AvatarImage src={provider.avatar} className="object-cover" />
                  <AvatarFallback className="bg-transparent text-sm font-bold uppercase text-muted-foreground">
                    <Globe size={20} aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex flex-col justify-center gap-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold leading-none tracking-tight">{provider.name}</h2>
                  {provider.description ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="提供商说明"
                          className="cursor-help rounded-sm text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Info aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{provider.description}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                {provider.homeUrl ? (
                  <a
                    href={provider.homeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-[10px] leading-none text-muted-foreground transition-colors hover:text-primary"
                  >
                    访问官网 <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('text-xs font-medium transition-colors', provider.enabled ? 'text-foreground' : 'text-muted-foreground')}>
                {provider.enabled ? '已启用' : '未启用'}
              </span>
              <Switch
                checked={provider.enabled}
                onCheckedChange={(checked) => void onToggleEnable(checked)}
                className="scale-90 data-[state=checked]:bg-primary"
                aria-label="启用提供商"
              />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-8 py-8">
            <div className="mx-auto w-full max-w-5xl space-y-10">
              {queryError ? <p role="alert" className="text-sm text-destructive">{queryError}</p> : null}
              {mutationError ? <p role="alert" className="text-sm text-destructive">{mutationError}</p> : null}

              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground/90">连接配置</h3>
                </div>
                <div className="grid gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{isPlatformProvider ? '平台登录态' : 'API Key'}</Label>
                      {provider.apiKeyUrl ? (
                        <a href={provider.apiKeyUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                          获取 API Key
                        </a>
                      ) : null}
                    </div>
                    <div className="group relative">
                      <Input
                        type={showKey ? 'text' : 'password'}
                        value={localApiKey}
                        onChange={(event) => onApiKeyChange(event.target.value)}
                        onBlur={() => void onSaveConnection()}
                        disabled={isPlatformProvider}
                        placeholder={provider.defaultApiKeyPlaceholder || 'sk-...'}
                        className="border-border/60 bg-muted/20 pr-24 font-mono transition-colors focus:border-primary/50 focus:bg-background"
                        autoComplete="off"
                      />
                      <div className="absolute bottom-1 right-1 top-1 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-full w-8 rounded hover:bg-muted"
                          onClick={onToggleKeyVisibility}
                          aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                        >
                          {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void onVerify()}
                          disabled={isVerifying || (verificationRequiresApiKey && !localApiKey.trim())}
                          className="h-full rounded-sm bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          {isVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '验证'}
                        </Button>
                      </div>
                    </div>
                    <div className="ml-1 mt-1.5 flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-primary/70" />
                      <p className="text-[11px] text-muted-foreground">
                        {isPlatformProvider
                          ? '平台模型使用当前登录态，不需要在 Pod 中额外保存 API Key。'
                          : 'API Key 保存在您的私有 Solid Pod 设置中。'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      {isPlatformProvider ? '平台地址 (Base URL)' : 'API 代理地址 (Base URL)'}
                    </Label>
                    <Input
                      value={localBaseUrl}
                      onChange={(event) => onBaseUrlChange(event.target.value)}
                      onBlur={() => void onSaveConnection()}
                      disabled={isPlatformProvider}
                      placeholder={provider.defaultBaseUrl}
                      className="border-border/60 bg-muted/20 font-mono transition-colors focus:border-primary/50 focus:bg-background"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                    />
                    <div className="ml-1 mt-1.5 flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-blue-500/70" />
                      <p className="break-all font-mono text-[11px] text-muted-foreground opacity-80">
                        <span className="mr-1 select-none opacity-50">预览:</span>
                        {(localBaseUrl || provider.defaultBaseUrl || '').replace(/\/$/, '')}/chat/completions
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-4 border-b border-border/40 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-medium text-foreground/90">可用模型</h3>
                      <Badge variant="secondary" className="ml-2 text-xs font-normal">{provider.modelCount}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={modelSearch}
                          onChange={(event) => onModelSearchChange(event.target.value)}
                          placeholder="搜索模型..."
                          className="h-8 w-[180px] bg-muted/20 pl-8 text-xs"
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore
                        />
                      </div>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-md text-xs" onClick={onAddModel}>
                        <Plus className="h-3.5 w-3.5" /> 添加模型
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  {provider.models.map((model) => (
                    <div
                      key={model.id}
                      className="group flex items-center justify-between rounded-lg border border-border/40 bg-card p-3 transition-all duration-200 hover:border-border/60 hover:bg-accent/30"
                    >
                      <div className="flex flex-1 items-center gap-3 overflow-hidden">
                        <div className="shrink-0 rounded bg-muted/50 p-2 text-muted-foreground transition-colors group-hover:text-primary">
                          <Box className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground/90">{model.name}</span>
                            <div className="flex items-center gap-1">
                              {model.capabilities.map((capability) => <CapabilityIcon key={capability} type={capability} />)}
                            </div>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <code className="max-w-[300px] truncate font-mono text-[10px] text-muted-foreground opacity-70">{model.id}</code>
                            <button
                              type="button"
                              onClick={() => void onCopyModelId(model.id)}
                              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                              aria-label={`复制 ${model.name} ID`}
                              title="复制 ID"
                            >
                              <Copy aria-hidden="true" className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pl-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditModel(model.id)} aria-label={`编辑 ${model.name}`}>
                          <Pencil aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void onDeleteModel(model.id)}
                          aria-label={`删除 ${model.name}`}
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {provider.models.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/50 bg-muted/5 py-12 text-center text-sm text-muted-foreground">
                      {modelSearch ? '未找到匹配的模型' : '暂无可用模型'}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  )
}
