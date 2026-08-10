import { useEffect, useMemo, useRef, useState } from 'react'
import { AIConfigRuntimeCapability } from '@undefineds.co/models'
import { useToast } from '@/components/ui/use-toast'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { useModelServicesStore } from '../../app/store'
import { searchProviderModels } from '../../data/model-fetcher'
import { useModelServices } from '../../data/use-model-services'
import { projectModelList } from '../../domain/model-services-projection'
import type { AIModel } from '../../domain/types'
import type { ModelEditorDialogProps, ModelEditorValue } from '../../ui/ModelEditorDialog'
import type { ModelServicesDetailViewProps } from '../../ui/ModelServicesDetailView'
import { getModelProviderAvatar } from '../../ui/provider-visuals'

export interface ModelServicesContentPaneController {
  detailViewProps: ModelServicesDetailViewProps
  editorDialogProps: ModelEditorDialogProps
}

function verificationErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '')
  if (/401|unauthorized|api key|invalid key|missing key|incorrect api key/i.test(rawMessage)) {
    return '密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。'
  }
  if (/模型列表获取失败|model list|models/i.test(rawMessage)) {
    return '模型列表获取失败。请检查密钥、服务地址或网络后重试。'
  }
  return formatErrorForUser(error, '请检查密钥、服务地址或网络后重试。')
}

export function useModelServicesContentPaneController(): ModelServicesContentPaneController {
  const { toast } = useToast()
  const { providers, updateProvider, error: queryError = null } = useModelServices()
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const provider = selectedId ? providers[selectedId] : null

  const [localApiKey, setLocalApiKey] = useState('')
  const [localBaseUrl, setLocalBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const connectionDraftRef = useRef({
    providerId: null as string | null,
    apiKey: '',
    baseUrl: '',
    apiKeyDirty: false,
    baseUrlDirty: false,
    apiKeyVersion: 0,
    baseUrlVersion: 0,
  })

  const providerId = provider?.id
  const providerApiKey = provider?.apiKey
  const providerBaseUrl = provider?.baseUrl

  useEffect(() => {
    const draft = connectionDraftRef.current
    const nextProviderId = providerId ?? null
    const nextApiKey = providerApiKey ?? ''
    const nextBaseUrl = providerBaseUrl ?? ''

    if (draft.providerId !== nextProviderId) {
      draft.providerId = nextProviderId
      draft.apiKey = nextApiKey
      draft.baseUrl = nextBaseUrl
      draft.apiKeyDirty = false
      draft.baseUrlDirty = false
      draft.apiKeyVersion = 0
      draft.baseUrlVersion = 0
      setLocalApiKey(nextApiKey)
      setLocalBaseUrl(nextBaseUrl)
      setShowKey(false)
      setIsVerifying(false)
      setModelSearch('')
      setMutationError(null)
      setIsDialogOpen(false)
      setEditingModelId(null)
      return
    }

    if (!draft.apiKeyDirty && draft.apiKey !== nextApiKey) {
      draft.apiKey = nextApiKey
      setLocalApiKey(nextApiKey)
    }
    if (!draft.baseUrlDirty && draft.baseUrl !== nextBaseUrl) {
      draft.baseUrl = nextBaseUrl
      setLocalBaseUrl(nextBaseUrl)
    }
  }, [providerApiKey, providerBaseUrl, providerId])

  const changeApiKey = (value: string) => {
    const draft = connectionDraftRef.current
    draft.apiKey = value
    draft.apiKeyDirty = true
    draft.apiKeyVersion += 1
    setLocalApiKey(value)
  }

  const changeBaseUrl = (value: string) => {
    const draft = connectionDraftRef.current
    draft.baseUrl = value
    draft.baseUrlDirty = true
    draft.baseUrlVersion += 1
    setLocalBaseUrl(value)
  }

  const saveConnection = async () => {
    if (!provider) return
    const draft = connectionDraftRef.current
    const submittedApiKey = draft.apiKey
    const submittedBaseUrl = draft.baseUrl
    const submittedApiKeyVersion = draft.apiKeyVersion
    const submittedBaseUrlVersion = draft.baseUrlVersion
    if (submittedApiKey === (provider.apiKey ?? '') && submittedBaseUrl === (provider.baseUrl ?? '')) return

    setMutationError(null)
    try {
      await updateProvider(provider.id, { apiKey: submittedApiKey, baseUrl: submittedBaseUrl })
      const currentDraft = connectionDraftRef.current
      if (currentDraft.providerId === provider.id) {
        if (currentDraft.apiKeyVersion === submittedApiKeyVersion) currentDraft.apiKeyDirty = false
        if (currentDraft.baseUrlVersion === submittedBaseUrlVersion) currentDraft.baseUrlDirty = false
      }
    } catch (error) {
      const message = formatErrorForUser(error, '连接配置保存失败，请重试。')
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
    }
  }

  const toggleEnable = async (enabled: boolean) => {
    if (!provider) return
    setMutationError(null)
    try {
      await updateProvider(provider.id, { enabled })
    } catch (error) {
      const message = formatErrorForUser(error, '提供商状态保存失败，请重试。')
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
    }
  }

  const changeCapability = async (capability: string, enabled: boolean) => {
    if (!provider || provider.id === 'undefineds') return
    const next = new Set(provider.capabilities)
    if (enabled) next.add(capability)
    else next.delete(capability)

    if (capability === AIConfigRuntimeCapability.responsesWebSearch && enabled) {
      next.add(AIConfigRuntimeCapability.responses)
    }
    if (capability === AIConfigRuntimeCapability.responses && !enabled) {
      next.delete(AIConfigRuntimeCapability.responsesWebSearch)
    }
    if (
      !next.has(AIConfigRuntimeCapability.chatCompletions)
      && !next.has(AIConfigRuntimeCapability.responses)
    ) {
      const message = '至少需要启用 Chat Completions 或 Responses API 之一。'
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
      return
    }

    setMutationError(null)
    try {
      await updateProvider(provider.id, { capabilities: [...next] })
    } catch (error) {
      const message = formatErrorForUser(error, '运行时能力保存失败，请重试。')
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
    }
  }

  const verify = async () => {
    if (!provider) return
    setIsVerifying(true)
    setMutationError(null)
    try {
      const normalizedApiKey = localApiKey.trim()
      const normalizedBaseUrl = localBaseUrl.trim()
      const fetchedGroups = await searchProviderModels(
        provider,
        normalizedApiKey || undefined,
        normalizedBaseUrl || undefined,
      )
      const fetchedModels: AIModel[] = Object.values(fetchedGroups).flat().map((model) => ({
        id: model.id,
        name: model.name,
        capabilities: model.capabilities,
        enabled: true,
      }))
      const mergedModels = [
        ...provider.models,
        ...fetchedModels.filter((model) => !provider.models.some((existing) => existing.id === model.id)),
      ]

      await updateProvider(provider.id, {
        apiKey: normalizedApiKey,
        baseUrl: normalizedBaseUrl || provider.defaultBaseUrl,
        models: mergedModels,
      })
      toast({
        description: fetchedModels.length > 0 ? `连接成功，已同步 ${fetchedModels.length} 个模型` : '连接成功',
        className: 'bg-green-500/15 border-green-500/20 text-green-600',
      })
    } catch (error) {
      const message = verificationErrorMessage(error)
      setMutationError(message)
      toast({ variant: 'destructive', description: `连接失败：${message}` })
    } finally {
      setIsVerifying(false)
    }
  }

  const copyModelId = async (modelId: string) => {
    setMutationError(null)
    try {
      await navigator.clipboard.writeText(modelId)
      toast({ description: 'ID 已复制', duration: 1000 })
    } catch (error) {
      const message = formatErrorForUser(error, '模型 ID 复制失败，请重试。')
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
    }
  }

  const saveModel = async (model: ModelEditorValue): Promise<string | null> => {
    if (!provider) return '请先选择模型提供商。'
    const models = [...provider.models]
    const existingIndex = models.findIndex((item) => item.id === model.id)
    if (existingIndex >= 0) models[existingIndex] = { ...models[existingIndex], ...model }
    else models.push(model)

    setMutationError(null)
    try {
      await updateProvider(provider.id, { models })
      toast({ description: existingIndex >= 0 ? '模型已更新' : '模型已添加' })
      return null
    } catch (error) {
      const message = formatErrorForUser(error, '模型保存失败，请重试。')
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
      return message
    }
  }

  const deleteModel = async (modelId: string) => {
    if (!provider) return
    setMutationError(null)
    try {
      await updateProvider(provider.id, {
        models: provider.models.filter((model) => model.id !== modelId),
      })
      toast({ description: '模型已移除' })
    } catch (error) {
      const message = formatErrorForUser(error, '模型移除失败，请重试。')
      setMutationError(message)
      toast({ variant: 'destructive', description: message })
    }
  }

  const openEditor = (modelId: string | null) => {
    setEditingModelId(modelId)
    setIsDialogOpen(true)
  }
  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) setEditingModelId(null)
  }

  const editingModel = provider?.models.find((model) => model.id === editingModelId)
  const editorInitialValue: ModelEditorValue | undefined = editingModel
    ? {
        id: editingModel.id,
        name: editingModel.name,
        enabled: editingModel.enabled,
        capabilities: editingModel.capabilities ?? [],
        isCustom: editingModel.isCustom ?? true,
      }
    : undefined

  const projectedModels = useMemo(
    () => projectModelList(provider?.models ?? [], modelSearch),
    [modelSearch, provider?.models],
  )
  const isPlatformProvider = provider?.id === 'undefineds'

  return {
    detailViewProps: {
      provider: provider ? {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        homeUrl: provider.homeUrl,
        apiKeyUrl: provider.apiKeyUrl,
        defaultApiKeyPlaceholder: provider.defaultApiKeyPlaceholder,
        defaultBaseUrl: provider.defaultBaseUrl,
        avatar: getModelProviderAvatar(provider.id),
        enabled: provider.enabled,
        modelCount: provider.models.length,
        models: projectedModels,
        capabilities: provider.capabilities,
      } : null,
      queryError,
      mutationError,
      localApiKey,
      localBaseUrl,
      showKey,
      isVerifying,
      modelSearch,
      isPlatformProvider,
      verificationRequiresApiKey: provider ? !['ollama', 'undefineds'].includes(provider.id) : true,
      onApiKeyChange: changeApiKey,
      onBaseUrlChange: changeBaseUrl,
      onCapabilityChange: changeCapability,
      onSaveConnection: saveConnection,
      onToggleKeyVisibility: () => setShowKey((visible) => !visible),
      onToggleEnable: toggleEnable,
      onVerify: verify,
      onModelSearchChange: setModelSearch,
      onAddModel: () => openEditor(null),
      onEditModel: (modelId) => openEditor(modelId),
      onDeleteModel: deleteModel,
      onCopyModelId: copyModelId,
    },
    editorDialogProps: {
      open: isDialogOpen,
      initialValue: editorInitialValue,
      onOpenChange: handleDialogOpenChange,
      onSave: saveModel,
    },
  }
}
