import { useCallback, useState } from 'react'
import type { UnifiedContact } from '../../domain/types'
import { contactOps } from '../../data/collections'
import type { ContactDetailNotifier } from './controller-types'

interface AgentEditingControllerOptions {
  contact: UnifiedContact | null
  notify: ContactDetailNotifier
  openEditor(mode: 'prompt' | 'tools'): void
  closeEditor(): void
}

export function useAgentEditingController({
  contact,
  notify,
  openEditor,
  closeEditor,
}: AgentEditingControllerOptions) {
  const [editingPrompt, setEditingPrompt] = useState('')
  const [editingToolsText, setEditingToolsText] = useState('')
  const [isSavingAgent, setIsSavingAgent] = useState(false)

  const handleOpenPromptEdit = useCallback(() => {
    setEditingPrompt(contact?.agentConfig?.instructions || '')
    openEditor('prompt')
  }, [contact, openEditor])

  const handleSavePrompt = useCallback(async () => {
    const agentId = contact?.agentConfig?.id
    if (!contact || !agentId) return
    setIsSavingAgent(true)
    try {
      await contactOps.updateAgent(agentId, { instructions: editingPrompt.trim() })
      notify.success('系统提示词已更新')
      closeEditor()
    } catch {
      notify.error('保存失败')
    } finally {
      setIsSavingAgent(false)
    }
  }, [closeEditor, contact, editingPrompt, notify])

  const handleOpenToolsEdit = useCallback(() => {
    setEditingToolsText((contact?.agentConfig?.tools || []).join('\n'))
    openEditor('tools')
  }, [contact, openEditor])

  const handleSaveTools = useCallback(async () => {
    const agentId = contact?.agentConfig?.id
    if (!contact || !agentId) return
    const tools = Array.from(new Set(
      editingToolsText.split('\n').map((entry) => entry.trim()).filter(Boolean),
    ))

    setIsSavingAgent(true)
    try {
      await contactOps.updateAgent(agentId, { tools })
      notify.success('工具配置已更新')
      closeEditor()
    } catch {
      notify.error('保存失败')
    } finally {
      setIsSavingAgent(false)
    }
  }, [closeEditor, contact, editingToolsText, notify])

  return {
    editingPrompt,
    setEditingPrompt,
    editingToolsText,
    setEditingToolsText,
    isSavingAgent,
    handleOpenPromptEdit,
    handleSavePrompt,
    handleOpenToolsEdit,
    handleSaveTools,
  }
}
