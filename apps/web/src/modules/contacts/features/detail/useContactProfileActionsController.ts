import { useCallback, useState } from 'react'
import { contactOps } from '../../data/collections'
import type { UnifiedContact } from '../../domain/types'
import type { ContactDetailNotifier } from './controller-types'

export type ContactDetailEditMode = 'none' | 'prompt' | 'tools' | 'alias' | 'delete'

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
    notify.info('语音通话功能即将上线')
  }, [notify])

  const handleVideoCall = useCallback(() => {
    notify.info('视频通话功能即将上线')
  }, [notify])

  const handleCopyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id)
    notify.success('已复制到剪贴板')
  }, [notify])

  const handleToggleStar = useCallback(async () => {
    if (!contact || !selectedId) return
    try {
      await contactOps.toggleStar(selectedId, !!contact.starred)
      notify.success(contact.starred ? '已取消星标' : '已添加星标')
    } catch {
      notify.error('操作失败')
    }
  }, [contact, notify, selectedId])

  const handleTogglePublic = useCallback(async (checked: boolean) => {
    if (!contact || !selectedId) return
    try {
      await contactOps.updateContact(selectedId, { isPublic: checked })
      notify.success(checked ? '已公开到个人资料' : '已设为私密')
    } catch {
      notify.error('操作失败')
    }
  }, [contact, notify, selectedId])

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

  const handleShare = useCallback(() => {
    if (!contact) return
    navigator.clipboard.writeText(contact.about || `linx://contact/${contact.id}`)
    notify.success('联系人链接已复制')
  }, [contact, notify])

  return {
    editMode,
    openEditor,
    closeEditor,
    editingAlias,
    setEditingAlias,
    isSavingProfile,
    handleVoiceCall,
    handleVideoCall,
    handleCopyId,
    handleToggleStar,
    handleTogglePublic,
    handleOpenAliasEdit,
    handleSaveAlias,
    handleShare,
  }
}
