import { useMemo, useState } from 'react'
import {
  ChevronDown,
  KeyRound,
  Link,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  CircleAlert,
  CircleCheck,
  CircleDashed,
} from 'lucide-react'
import { useModelServicesStore } from './store'
import { useModelServices } from './hooks/useModelServices'
import { MODEL_PROVIDER_TEMPLATES, getModelProviderTemplate, type ProviderDef } from './constants'
import { searchProviderModels } from './services/model-fetcher'
import { resolveSelectedProviderId } from './selection'
import { cn } from '@/lib/utils'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'

const DEFAULT_TEMPLATE_ID = 'openai'

function slugifyProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function defaultModelForTemplate(template: ProviderDef): string {
  return template.defaultModels?.[0] || ''
}

function defaultServiceIdForTemplate(template: ProviderDef): string {
  return template.id || slugifyProviderId(template.name)
}

function uniqueServiceId(baseId: string, existingIds: Iterable<string>): string {
  const fallbackId = slugifyProviderId(baseId) || 'model-service'
  const existing = new Set(Array.from(existingIds).map((id) => id.toLowerCase()))
  if (!existing.has(fallbackId.toLowerCase())) return fallbackId

  let suffix = 2
  let candidate = `${fallbackId}-${suffix}`
  while (existing.has(candidate.toLowerCase())) {
    suffix += 1
    candidate = `${fallbackId}-${suffix}`
  }
  return candidate
}

function normalizeEndpointUrl(rawUrl: string, useFullUrl: boolean): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '')
  if (!trimmed || useFullUrl) return trimmed
  if (/\/v\d+(beta)?$/i.test(trimmed)) return trimmed
  return `${trimmed}/v1`
}

type SyncedModel = {
  id: string
  name: string
  capabilities: string[]
}

function logModelServiceDialog(event: string, detail?: Record<string, unknown>) {
  console.info(`[ModelServices:AddDialog] ${event}`, detail ?? {})
}

function buildModel(modelId: string, name = modelId, capabilities: string[] = []) {
  return {
    id: modelId,
    name,
    enabled: true,
    capabilities,
  }
}

function orderModelsForSelection(models: SyncedModel[], selectedModelId: string) {
  const selected = selectedModelId.trim()
  if (!selected) return models
  return [
    ...models.filter((model) => model.id === selected),
    ...models.filter((model) => model.id !== selected),
  ]
}

type UpdateProvider = ReturnType<typeof useModelServices>['updateProvider']

function AddModelServiceDialog({
  updateProvider,
  existingProviderIds,
}: {
  updateProvider: UpdateProvider
  existingProviderIds: string[]
}) {
  const { toast } = useToast()
  const selectProvider = useModelServicesStore((state) => state.setSelectedProviderId)

  const defaultTemplate = getModelProviderTemplate(DEFAULT_TEMPLATE_ID) || MODEL_PROVIDER_TEMPLATES[0]
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState(defaultTemplate.id)
  const [providerName, setProviderName] = useState(defaultTemplate.name)
  const [remark, setRemark] = useState('')
  const [homeUrl, setHomeUrl] = useState(defaultTemplate.homeUrl || '')
  const [apiKey, setApiKey] = useState('')
  const [endpointUrl, setEndpointUrl] = useState(defaultTemplate.defaultBaseUrl || '')
  const [useFullUrl, setUseFullUrl] = useState(false)
  const [serviceId, setServiceId] = useState(defaultServiceIdForTemplate(defaultTemplate))
  const [mainModel, setMainModel] = useState(defaultModelForTemplate(defaultTemplate))
  const [syncedModels, setSyncedModels] = useState<SyncedModel[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSyncingModels, setIsSyncingModels] = useState(false)

  const selectedTemplate = useMemo(
    () => getModelProviderTemplate(templateId) || defaultTemplate,
    [defaultTemplate, templateId],
  )

  const resetFromTemplate = (template: ProviderDef) => {
    setTemplateId(template.id)
    setProviderName(template.name)
    setRemark('')
    setHomeUrl(template.homeUrl || '')
    setApiKey('')
    setEndpointUrl(template.defaultBaseUrl || '')
    setUseFullUrl(false)
    setServiceId(defaultServiceIdForTemplate(template))
    setMainModel(defaultModelForTemplate(template))
    setSyncedModels([])
    setAdvancedOpen(false)
  }

  const handleTemplateChange = (nextTemplateId: string) => {
    const template = getModelProviderTemplate(nextTemplateId) || defaultTemplate
    resetFromTemplate(template)
  }

  const syncModels = async () => {
    const normalizedServiceId = slugifyProviderId(serviceId || providerName || selectedTemplate.id)
    const normalizedEndpoint = normalizeEndpointUrl(endpointUrl, useFullUrl)
    const normalizedName = providerName.trim()

    logModelServiceDialog('sync_models_clicked', {
      templateId: selectedTemplate.id,
      serviceId: normalizedServiceId,
      providerName: normalizedName,
      endpoint: normalizedEndpoint,
      useFullUrl,
      apiKeyPresent: Boolean(apiKey.trim()),
      apiKeyLength: apiKey.trim().length,
    })

    if (!normalizedServiceId || !normalizedName) {
      logModelServiceDialog('sync_models_blocked', { reason: 'missing_provider_name' })
      toast({
        variant: 'destructive',
        description: '请先填写供应商名称。',
      })
      return
    }

    if (!normalizedEndpoint) {
      logModelServiceDialog('sync_models_blocked', { reason: 'missing_endpoint' })
      toast({
        variant: 'destructive',
        description: '请先填写 API 请求地址。',
      })
      return
    }

    if (selectedTemplate.id !== 'ollama' && selectedTemplate.id !== 'undefineds' && !apiKey.trim()) {
      logModelServiceDialog('sync_models_blocked', { reason: 'missing_api_key', templateId: selectedTemplate.id })
      toast({
        variant: 'destructive',
        description: '请先填写 API Key。',
      })
      return
    }

    setIsSyncingModels(true)

    try {
      logModelServiceDialog('sync_models_request_started', {
        providerId: normalizedServiceId,
        endpoint: normalizedEndpoint,
      })
      const groups = await searchProviderModels(
        { ...selectedTemplate, id: normalizedServiceId, modelsApi: undefined },
        apiKey.trim(),
        normalizedEndpoint,
      )
      const deduped = new Map<string, SyncedModel>()
      Object.values(groups).flat().forEach((model) => {
        if (!model.id || deduped.has(model.id)) return
        deduped.set(model.id, {
          id: model.id,
          name: model.name || model.id,
          capabilities: model.capabilities || [],
        })
      })
      const nextModels = Array.from(deduped.values())

      if (nextModels.length === 0) {
        logModelServiceDialog('sync_models_empty', { providerId: normalizedServiceId })
        toast({
          variant: 'destructive',
          description: '没有同步到可用模型，请检查接口地址。',
        })
        return
      }

      setSyncedModels(nextModels)
      const trimmedMainModel = mainModel.trim()
      if (!trimmedMainModel || !nextModels.some((model) => model.id === trimmedMainModel)) {
        const preferredModel = nextModels.find((model) => /mini/i.test(model.id))
          ?? nextModels.find((model) => /(^|[-_.])gpt[-_.]?/i.test(model.id))
          ?? nextModels[0]
        if (preferredModel?.id) setMainModel(preferredModel.id)
      }
      logModelServiceDialog('sync_models_succeeded', {
        providerId: normalizedServiceId,
        modelCount: nextModels.length,
        firstModelId: nextModels[0]?.id,
      })
      toast({
        description: `已同步 ${nextModels.length} 个模型`,
      })
    } catch (error) {
      logModelServiceDialog('sync_models_failed', {
        providerId: normalizedServiceId,
        endpoint: normalizedEndpoint,
        error: formatErrorForUser(error),
      })
      toast({
        variant: 'destructive',
        description: `同步失败：${formatErrorForUser(error)}`,
      })
    } finally {
      setIsSyncingModels(false)
    }
  }

  const persistService = async () => {
    const requestedServiceId = slugifyProviderId(serviceId || providerName || selectedTemplate.id)
    const normalizedServiceId = uniqueServiceId(requestedServiceId, existingProviderIds)
    const normalizedEndpoint = normalizeEndpointUrl(endpointUrl, useFullUrl)
    const normalizedName = providerName.trim()
    const normalizedModel = mainModel.trim()

    logModelServiceDialog('create_service_clicked', {
      templateId: selectedTemplate.id,
      serviceId: normalizedServiceId,
      providerName: normalizedName,
      endpoint: normalizedEndpoint,
      useFullUrl,
      mainModel: normalizedModel,
      syncedModelCount: syncedModels.length,
      requestedServiceId,
      apiKeyPresent: Boolean(apiKey.trim()),
      apiKeyLength: apiKey.trim().length,
    })

    if (!normalizedServiceId || !normalizedName) {
      logModelServiceDialog('create_service_blocked', { reason: 'missing_provider_name' })
      toast({
        variant: 'destructive',
        description: '请先填写供应商名称。',
      })
      return
    }

    if (!normalizedEndpoint) {
      logModelServiceDialog('create_service_blocked', { reason: 'missing_endpoint' })
      toast({
        variant: 'destructive',
        description: '请先填写 API 请求地址。',
      })
      return
    }

    if (selectedTemplate.id !== 'ollama' && selectedTemplate.id !== 'undefineds' && !apiKey.trim()) {
      logModelServiceDialog('create_service_blocked', { reason: 'missing_api_key', templateId: selectedTemplate.id })
      toast({
        variant: 'destructive',
        description: '请先填写 API Key。',
      })
      return
    }

    if (!normalizedModel) {
      logModelServiceDialog('create_service_blocked', { reason: 'missing_main_model' })
      toast({
        variant: 'destructive',
        description: '请先选择或填写主模型。',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const models = syncedModels.length > 0
        ? orderModelsForSelection(syncedModels, normalizedModel).map((model) =>
            buildModel(model.id, model.name, model.capabilities),
          )
        : [buildModel(normalizedModel)]

      if (models.length === 0) {
        logModelServiceDialog('create_service_blocked', { reason: 'empty_model_payload' })
        toast({
          variant: 'destructive',
          description: '请先选择或填写主模型。',
        })
        return
      }

      logModelServiceDialog('create_service_persist_started', {
        providerId: normalizedServiceId,
        modelCount: models.length,
        firstModelId: models[0]?.id,
      })
      await updateProvider(normalizedServiceId, {
        name: normalizedName,
        enabled: true,
        apiKey: apiKey.trim(),
        baseUrl: normalizedEndpoint,
        credentialLabel: remark.trim() || undefined,
        models,
      })

      logModelServiceDialog('create_service_persist_succeeded', {
        providerId: normalizedServiceId,
        modelCount: models.length,
      })
      selectProvider(normalizedServiceId)
      toast({
        description: `已创建 ${normalizedName}`,
      })
      setOpen(false)
      resetFromTemplate(defaultTemplate)
    } catch (error) {
      logModelServiceDialog('create_service_persist_failed', {
        providerId: normalizedServiceId,
        endpoint: normalizedEndpoint,
        error: formatErrorForUser(error),
      })
      toast({
        variant: 'destructive',
        description: `创建失败：${formatErrorForUser(error)}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="添加模型服务"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden p-0">
        <div className="flex max-h-[88vh] flex-col">
          <DialogHeader className="border-b border-border/50 px-8 py-6">
            <DialogTitle className="text-2xl">添加模型服务</DialogTitle>
            <DialogDescription className="text-base">
              选择模板只会预填默认值，供应商、模型、Key 和地址都由你维护。
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-7 px-8 py-6">
              <div className="space-y-2">
                <Label>模板</Label>
                <Select value={templateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="h-12 rounded-lg bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PROVIDER_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="model-service-name">供应商名称</Label>
                  <Input
                    id="model-service-name"
                    value={providerName}
                    onChange={(event) => {
                      const nextName = event.target.value
                      const previousNameSlug = slugifyProviderId(providerName)
                      setProviderName(nextName)
                      const currentDefaultServiceId = defaultServiceIdForTemplate(selectedTemplate)
                      if (
                        !serviceId
                        || serviceId === currentDefaultServiceId
                        || serviceId === previousNameSlug
                      ) {
                        setServiceId(slugifyProviderId(nextName))
                      }
                    }}
                    placeholder="例如：Claude 官方"
                    className="h-12 rounded-lg bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model-service-remark">备注</Label>
                  <Input
                    id="model-service-remark"
                    value={remark}
                    onChange={(event) => setRemark(event.target.value)}
                    placeholder="例如：公司专用账号"
                    className="h-12 rounded-lg bg-background"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model-service-home">官网链接</Label>
                <div className="relative">
                  <Link className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="model-service-home"
                    value={homeUrl}
                    onChange={(event) => setHomeUrl(event.target.value)}
                    placeholder="https://example.com（可选）"
                    className="h-12 rounded-lg bg-background pl-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model-service-key">API Key</Label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="model-service-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={selectedTemplate.defaultApiKeyPlaceholder || '只需要填这里，下方 auth.json 会自动填充'}
                    className="h-12 rounded-lg bg-background pl-11"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="model-service-endpoint">API 请求地址</Label>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>完整 URL</span>
                    <Switch checked={useFullUrl} onCheckedChange={setUseFullUrl} />
                  </div>
                </div>
                <Input
                  id="model-service-endpoint"
                  value={endpointUrl}
                  onChange={(event) => {
                    setEndpointUrl(event.target.value)
                    setSyncedModels([])
                  }}
                  placeholder="https://your-api-endpoint.com/v1"
                  className="h-12 rounded-lg bg-background"
                />
                <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  填写兼容 OpenAI Response 格式的服务端点地址
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    <Label>模型同步</Label>
                    <div className="text-sm text-muted-foreground">
                      {syncedModels.length > 0
                        ? `已同步 ${syncedModels.length} 个模型`
                        : '先同步模型列表，再选择主模型'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void syncModels()}
                    disabled={isSubmitting || isSyncingModels}
                    className="h-11 rounded-lg"
                  >
                    {isSyncingModels
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <RefreshCw className="mr-2 h-4 w-4" />}
                    同步模型
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model-service-model">主模型</Label>
                  {syncedModels.length > 0 ? (
                    <SearchableSelect
                      id="model-service-model"
                      options={syncedModels}
                      value={syncedModels.find((model) => model.id === mainModel) ?? null}
                      onChange={(model) => model && setMainModel(model.id)}
                      getLabel={(model) => model.name || model.id}
                      getValue={(model) => model.id}
                      placeholder="搜索已同步的模型，例如 5.5"
                      className="[&_input]:h-12 [&_input]:rounded-lg [&_input]:bg-background"
                      renderOption={(model) => (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{model.name || model.id}</span>
                          {model.name && model.name !== model.id ? (
                            <span className="truncate text-xs text-muted-foreground">{model.id}</span>
                          ) : null}
                        </span>
                      )}
                    />
                  ) : (
                    <Input
                      id="model-service-model"
                      value={mainModel}
                      onChange={(event) => setMainModel(event.target.value)}
                      placeholder="gpt-4o-mini"
                      className="h-12 rounded-lg bg-background"
                    />
                  )}
                </div>
              </div>

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full justify-start rounded-lg text-base"
                  >
                    <ChevronDown
                      className={cn(
                        'mr-2 h-4 w-4 transition-transform',
                        advancedOpen && 'rotate-180',
                      )}
                    />
                    高级选项
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="model-service-id">服务 ID</Label>
                      <Input
                        id="model-service-id"
                        value={serviceId}
                        onChange={(event) => setServiceId(event.target.value)}
                        placeholder="openai-main"
                        className="h-12 rounded-lg bg-background"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-border/50 px-8 py-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-11 rounded-lg"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void persistService()}
              disabled={isSubmitting || isSyncingModels}
              className="h-11 rounded-lg"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建服务
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ModelServicesListPane({}: MicroAppPaneProps) {
  const { providers, updateProvider } = useModelServices()
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const selectProvider = useModelServicesStore((state) => state.setSelectedProviderId)
  const [search, setSearch] = useState('')
  const effectiveSelectedId = resolveSelectedProviderId(providers, selectedId)

  const items = useMemo(() => {
    const list = Object.values(providers)
    if (!search) return list
    const query = search.toLowerCase()
    return list.filter((provider) => provider.name.toLowerCase().includes(query))
  }, [providers, search])

  return (
    <div className="flex h-full min-w-0 flex-col border-r border-border/40 bg-muted/10">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border/40 bg-background/50 px-4 backdrop-blur-sm">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 border-transparent bg-muted/50 pl-8 text-xs transition-colors focus-visible:bg-background"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
          />
        </div>
      <AddModelServiceDialog
        updateProvider={updateProvider}
        existingProviderIds={Object.keys(providers)}
      />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div>
          {items.map((provider) => {
            const IconComp = provider.icon
            const isSelected = effectiveSelectedId === provider.id
            const isEnabled = provider.enabled

            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => selectProvider(provider.id)}
                aria-current={isSelected ? 'page' : undefined}
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-3 border-l-[3px] border-transparent px-4 py-3 text-left transition-colors',
                  isSelected
                    ? 'border-l-primary bg-accent/80'
                    : 'border-l-transparent hover:bg-muted/40',
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9 rounded-md border border-border/20">
                    <AvatarImage src={provider.avatar} />
                    <AvatarFallback className="rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                      {IconComp ? <IconComp size={16} /> : provider.name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      isSelected ? 'text-foreground' : 'text-foreground/80',
                    )}
                  >
                    {provider.name}
                  </span>
                  <span className={cn(
                    'flex items-center gap-1 truncate text-xs',
                    provider.verificationStatus === 'available' && 'text-emerald-600',
                    provider.verificationStatus === 'failed' && 'text-destructive',
                    provider.verificationStatus === 'unverified' && 'text-muted-foreground',
                  )}>
                    {provider.verificationStatus === 'available' && <CircleCheck className="h-3 w-3 shrink-0" />}
                    {provider.verificationStatus === 'failed' && <CircleAlert className="h-3 w-3 shrink-0" />}
                    {provider.verificationStatus === 'unverified' && <CircleDashed className="h-3 w-3 shrink-0" />}
                    {provider.verificationStatus === 'available'
                      ? '可用'
                      : provider.verificationStatus === 'failed'
                        ? '验证失败，可编辑后重试'
                        : '未验证'}
                  </span>
                </div>

                {isEnabled && (
                  <div className="shrink-0 pr-1">
                    <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_4px_rgba(var(--primary),0.5)]" />
                  </div>
                )}
              </button>
            )
          })}

          {items.length === 0 && (
            <div className="space-y-3 px-6 py-10 text-center">
              <div className="text-sm font-medium text-foreground">还没有模型服务</div>
              <div className="text-xs leading-5 text-muted-foreground">
                点击右上角加号添加一个兼容 OpenAI Response 的服务。
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
