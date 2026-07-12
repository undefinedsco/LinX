import { useCallback, useEffect, useState } from 'react'
import { contactOps } from '../../data/collections'
import type { ContactDetailNotifier } from './controller-types'

export interface ContactCreationForm {
  name: string
  instructions: string
  model: string
}

export interface FriendSearchState {
  webId: string
  isSearching: boolean
  searchResult: { name: string; webId: string; avatarUrl?: string } | null
  error: string
}

const initialCreateForm: ContactCreationForm = {
  name: '',
  instructions: '',
  model: 'openai/gpt-4o',
}

const initialFriendSearch: FriendSearchState = {
  webId: '',
  isSearching: false,
  searchResult: null,
  error: '',
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
  const [friendSearch, setFriendSearch] = useState(initialFriendSearch)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!createDialogOpen) return
    setCreateForm(initialCreateForm)
    setFriendSearch(initialFriendSearch)
  }, [createDialogOpen])

  const handleSearchWebId = useCallback(async () => {
    if (!friendSearch.webId.trim()) {
      setFriendSearch((current) => ({ ...current, error: '请输入用户地址' }))
      return
    }
    setFriendSearch((current) => ({ ...current, isSearching: true, error: '', searchResult: null }))
    try {
      const profile = await contactOps.fetchSolidProfile(friendSearch.webId.trim())
      if (!profile) {
        setFriendSearch((current) => ({
          ...current,
          isSearching: false,
          error: '无法获取用户信息，请检查用户地址是否正确',
        }))
        return
      }
      setFriendSearch((current) => ({
        ...current,
        isSearching: false,
        searchResult: {
          name: profile.name,
          webId: profile.webId,
          avatarUrl: profile.avatarUrl,
        },
      }))
    } catch {
      setFriendSearch((current) => ({
        ...current,
        isSearching: false,
        error: '搜索失败，请检查网络连接',
      }))
    }
  }, [friendSearch.webId])

  const handleAddFriend = useCallback(async () => {
    if (!friendSearch.searchResult) return
    setIsCreating(true)
    try {
      const result = await contactOps.addFriend(friendSearch.searchResult)
      notify.success('好友添加成功')
      closeCreateDialog()
      selectContact(result.id)
    } catch {
      notify.error('添加失败，请重试')
    } finally {
      setIsCreating(false)
    }
  }, [closeCreateDialog, friendSearch.searchResult, notify, selectContact])

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
    friendSearch,
    setFriendSearch,
    isCreating,
    handleSearchWebId,
    handleAddFriend,
    handleCreateAgent,
  }
}
