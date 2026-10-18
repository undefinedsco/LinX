import { useCallback, useEffect, useState } from 'react'
import { contactOps } from '../../data/collections'
import type { ContactDetailNotifier } from './controller-types'

export interface ContactCreationForm {
  name: string
  instructions: string
  model: string
}

const initialCreateForm: ContactCreationForm = {
  name: '',
  instructions: '',
  model: 'undefineds/linx-lite',
}

interface ContactCreationControllerOptions {
  createDialogOpen: boolean
  closeCreateDialog(): void
  selectContact(contactId: string): void
  notify: ContactDetailNotifier
}

export function useContactCreationController({
  createDialogOpen,
  closeCreateDialog,
  selectContact,
  notify,
}: ContactCreationControllerOptions) {
  const [createForm, setCreateForm] = useState(initialCreateForm)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!createDialogOpen) return
    setCreateForm(initialCreateForm)
  }, [createDialogOpen])

  const handleCreateAgent = useCallback(async () => {
    if (!createForm.name.trim()) {
      notify.error('请输入助手名称')
      return
    }
    setIsCreating(true)
    try {
      const [provider, model] = createForm.model.includes('/')
        ? createForm.model.split('/')
        : ['openai', createForm.model]
      const result = await contactOps.createAgent({
        name: createForm.name.trim(),
        instructions: createForm.instructions.trim() || undefined,
        model,
        provider,
      })
      notify.success('助手创建成功')
      closeCreateDialog()
      selectContact(result.id)
    } catch {
      notify.error('创建失败，请重试')
    } finally {
      setIsCreating(false)
    }
  }, [closeCreateDialog, createForm, notify, selectContact])

  return {
    createForm,
    setCreateForm,
    isCreating,
    handleCreateAgent,
  }
}
