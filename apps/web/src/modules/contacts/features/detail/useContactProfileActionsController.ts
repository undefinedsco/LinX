import { useCallback, useState } from 'react'
import { contactOps } from '../../data/collections'
import type { UnifiedContact } from '../../domain/types'
import type { ContactDetailNotifier } from './controller-types'

export type ContactDetailEditMode = 'none' | 'alias' | 'delete' | 'condition' | 'shares' | 'grants'

interface ContactProfileActionsControllerOptions {
  contact: UnifiedContact | null
  selectedId: string | null
  notify: ContactDetailNotifier
}

export function useContactProfileActionsController({
  contact,
  selectedId,
  notify,
}: ContactProfileActionsControllerOptions) {
  const [editMode, setEditMode] = useState<ContactDetailEditMode>('none')
  const [editingAlias, setEditingAlias] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const closeEditor = useCallback(() => setEditMode('none'), [])
  const openEditor = useCallback((mode: ContactDetailEditMode) => setEditMode(mode), [])

  const handleVoiceCall = useCallback(() => {
    notify.info('暂时不能打')
  }, [notify])

  const handleVideoCall = useCallback(() => {
    notify.info('暂时不能打')
  }, [notify])

  const handleCopyAddress = useCallback((webId: string) => {
    void navigator.clipboard?.writeText(webId)
    notify.success('已复制')
  }, [notify])

  const handleOpenAliasEdit = useCallback(() => {
    setEditingAlias(contact?.alias || '')
    setEditMode('alias')
  }, [contact])

  const handleSaveAlias = useCallback(async () => {
    if (!contact || !selectedId) return
    setIsSavingProfile(true)
    try {
      await contactOps.updateContact(selectedId, { alias: editingAlias.trim() || undefined })
      notify.success('备注名已更新')
      closeEditor()
    } catch {
      notify.error('保存失败')
    } finally {
      setIsSavingProfile(false)
    }
  }, [closeEditor, contact, editingAlias, notify, selectedId])

  return {
    editMode,
    openEditor,
    closeEditor,
    editingAlias,
    setEditingAlias,
    isSavingProfile,
    handleVoiceCall,
    handleVideoCall,
    handleCopyAddress,
    handleOpenAliasEdit,
    handleSaveAlias,
  }
}
