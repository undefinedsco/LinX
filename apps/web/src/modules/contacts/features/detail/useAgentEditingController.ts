import { useCallback, useState } from 'react'
import { useOpenAgentMethod } from '@/modules/my-ai'
import type { UnifiedContact } from '../../domain/types'
import { contactOps } from '../../data/collections'
import type { ContactDetailNotifier } from './controller-types'

interface AgentEditingControllerOptions {
  contact: UnifiedContact | null
  notify: ContactDetailNotifier
  openEditor(mode: 'condition'): void
  closeEditor(): void
}

export function useAgentEditingController({
  contact,
  notify,
  openEditor,
  closeEditor,
}: AgentEditingControllerOptions) {
  const [editingModel, setEditingModel] = useState('')
  const [isSavingAgent, setIsSavingAgent] = useState(false)

  const openAgentMethod = useOpenAgentMethod()

  // 做事的方法只在“我的 AI”里编辑，这里只负责带过去。
  const handleOpenMethod = useCallback(() => {
    const agentId = contact?.agentConfig?.id
    if (!agentId) return
    openAgentMethod(agentId)
  }, [contact, openAgentMethod])

  const handleOpenCondition = useCallback(() => {
    const config = contact?.agentConfig
    const model = config?.model ?? ''
    setEditingModel(config?.provider && model && !model.includes('/') ? `${config.provider}/${model}` : model)
    openEditor('condition')
  }, [contact, openEditor])

  const handleSaveModel = useCallback(async () => {
    const agentId = contact?.agentConfig?.id
    if (!agentId || !editingModel) return
    const separator = editingModel.indexOf('/')
    if (separator < 0) return
    setIsSavingAgent(true)
    try {
      await contactOps.updateAgentModel(agentId, editingModel.slice(0, separator), editingModel.slice(separator + 1))
      notify.success('执行条件已更新')
      closeEditor()
    } catch {
      notify.error('保存失败')
    } finally {
      setIsSavingAgent(false)
    }
  }, [closeEditor, contact, editingModel, notify])

  return {
    editingModel,
    setEditingModel,
    isSavingAgent,
    handleOpenMethod,
    handleOpenCondition,
    handleSaveModel,
  }
}
