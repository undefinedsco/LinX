/**
 * ContactDetailPane - WeChat Style Split Layout
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useNavigate } from '@tanstack/react-router'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useContactStore } from '../store'
import { contactOps, contactCollection } from '../collections'
import type { UnifiedContact } from '../types'
import { useChatStore } from '@/modules/chat/store'
import { useEntity } from '@/lib/data/use-entity'
import { solidProfileTable, agentTable, ContactType, isGroupContact } from '@linx/models'
import { useToast } from '@/components/ui/use-toast'
import { 
  MessageCircle, 
  Phone, 
  Video, 
  Star, 
  MoreHorizontal, 
  ChevronRight,
  Wrench,
  Bot,
  User,
  Loader2,
  Share2,
  UserPlus,
  Copy,
  Link as LinkIcon,
  RefreshCw,
  Lock,
  Search,
  Trash2,
  Edit3,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ModelSelector } from '@/components/ui/model-selector'
import { useQuery } from '@tanstack/react-query'
import { CreateGroupDialog } from './CreateGroupDialog'
import { MemberList, type GroupMember } from './MemberList'
import { SelectableContactList } from './SelectableContactList'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ============================================
// Helpers & Components
// ============================================

function getShortId(id: string) {
  if (!id) return ''
  if (!id.startsWith('http')) return id
  try {
    const url = new URL(id)
    const hostnameParts = url.hostname.split('.')
    if (hostnameParts.length >= 3) return hostnameParts[0]
    const pathParts = url.pathname.split('/').filter(p => p && p !== 'profile' && p !== 'card')
    if (pathParts.length > 0) return pathParts[pathParts.length - 1]
    return url.hostname
  } catch { return id }
}

const GenderIcon = ({ type }: { type?: string }) => {
  if (type === 'male') return <span className="text-blue-500 font-bold ml-1">♂</span>
  if (type === 'female') return <span className="text-pink-500 font-bold ml-1">♀</span>
  if (type === 'bot') return <Bot className="w-3.5 h-3.5 text-primary ml-1" />
  return null
}

function InfoRow({ label, children, onClick, last, hideArrow }: any) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-start py-4 px-4 hover:bg-muted/30 transition-colors cursor-pointer group",
        !last && "border-b border-border/30"
      )}
    >
      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0 text-sm text-foreground">
        {children}
      </div>
      {onClick && !hideArrow && <ChevronRight className="w-4 h-4 text-muted-foreground/20 shrink-0 self-center" />}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function ContactDetailPane({}: MicroAppPaneProps) {
  const navigate = useNavigate()
  const { session } = useSession()
  const { toast } = useToast()
  const selectedId = useContactStore((state) => state.selectedId)
  const selectContact = useContactStore((state) => state.select)
  const viewMode = useContactStore((state) => state.viewMode)
  const createDialogOpen = useContactStore((state) => state.createDialogOpen)
  const createType = useContactStore((state) => state.createType)
  const closeCreateDialog = useContactStore((state) => state.closeCreateDialog)
  const clearNewFriends = useContactStore((state) => state.clearNewFriends)
  const inviteMemberDialogOpen = useContactStore((state) => state.inviteMemberDialogOpen)
  const inviteTargetGroupId = useContactStore((state) => state.inviteTargetGroupId)
  const openInviteMemberDialog = useContactStore((state) => state.openInviteMemberDialog)
  const closeInviteMemberDialog = useContactStore((state) => state.closeInviteMemberDialog)
  // Contact data from collections (state is a Map)
  const contacts = Array.from(contactCollection.state.values())
  const selectChat = useChatStore((state) => state.selectChat)
  
  // Edit State
  const [editMode, setEditMode] = useState<'none' | 'prompt' | 'tools' | 'alias' | 'delete' | 'tags'>('none')
  const [editingAlias, setEditingAlias] = useState('')
  const [editingPrompt, setEditingPrompt] = useState('')
  const [editingTags, setEditingTags] = useState<string[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set())
  const [isInviting, setIsInviting] = useState(false)
  
  // Create Dialog State
  const [createForm, setCreateForm] = useState({
    name: '',
    instructions: '',
    model: 'openai/gpt-4o',
  })
  
  // 添加朋友搜索状态
  const [friendSearch, setFriendSearch] = useState({
    webId: '',
    isSearching: false,
    searchResult: null as { name: string; webId: string; avatarUrl?: string } | null,
    error: '',
  })
  
  // Reset create form when dialog opens
  useEffect(() => {
    if (createDialogOpen) {
      setCreateForm({
        name: '',
        instructions: '',
        model: 'openai/gpt-4o',
      })
      setFriendSearch({
        webId: '',
        isSearching: false,
        searchResult: null,
        error: '',
      })
    }
  }, [createDialogOpen])

  // Mock available tags (后续可从数据库获取)
  const AVAILABLE_TAGS = [
    { id: 'friend', name: '朋友', color: 'blue' },
    { id: 'family', name: '家人', color: 'pink' },
    { id: 'work', name: '同事', color: 'orange' },
    { id: 'school', name: '同学', color: 'green' },
    { id: 'vip', name: 'VIP', color: 'yellow' },
  ]
  
  // Find contact from collection state (本地缓存)
  const realContact = selectedId && !selectedId.startsWith('mock-')
    ? contacts.find(c => c.id === selectedId || (c as any)['@id'] === selectedId)
    : null
  const isContactLoading = false // Collections handle loading state
  
  // 确定 entityUri 和对应的 table
  const entityUri = realContact && !isGroupContact(realContact) ? realContact.entityUri || null : null
  const entityTable = realContact?.contactType === ContactType.AGENT ? agentTable : solidProfileTable

  // 使用 useEntity 获取源数据（本地或远程，统一处理）
  const { 
    data: entityData, 
    isLoading: isSyncing, 
    error: syncError, 
    refresh: handleManualSync 
  } = useEntity(entityTable, entityUri, {
    onUpdate: (data) => {
      // 同步成功后更新本地 Contact 缓存
      if (realContact?.id && data) {
        contactOps.updateContact(realContact.id, {
          name: data.name || realContact.name,
          avatarUrl: (data as any).avatar || (data as any).avatarUrl || realContact.avatarUrl,
          lastSyncedAt: new Date(),
        }).catch(() => undefined)
      }
    },
  })

  const notify = useMemo(() => ({
    success: (description: string) => toast({ description }),
    info: (description: string) => toast({ description }),
    error: (description: string) => toast({ description, variant: 'destructive' }),
  }), [toast])

  const contact: UnifiedContact | null = useMemo(() => {
    if (!selectedId) return null
    if (selectedId.startsWith('mock-')) {
      if (selectedId === 'mock-agent-1') return {
        id: 'mock-agent-1', name: '智能翻译官', alias: '翻译助手', contactType: 'agent', starred: true, gender: 'bot', province: '广东', city: '深圳', sourceType: 'agent',
        agentConfig: { model: 'openai/gpt-4o', instructions: '你是一个精通 12 国语言的翻译专家，能够精准捕捉语境中的文化细微差别。', ttsModel: 'openai/tts-1', videoModel: 'heygen/avatar-v2', tools: ['WebSearch'] }
      } as any
      if (selectedId === 'mock-solid-1') return {
        id: 'mock-solid-1', name: 'Alice Smith', alias: 'Alice', contactType: 'solid', entityUri: 'https://alice.solidcommunity.net/profile/card#me', gender: 'female', province: '北京', city: '海淀', sourceType: 'solid', isPublic: true
      } as any
      if (selectedId === 'mock-wechat-1') return {
        id: 'mock-wechat-1', name: '王小二', alias: '老王', contactType: 'external', externalPlatform: 'wechat', externalId: 'wxid_wang123', gender: 'male', province: '上海', city: '黄浦', sourceType: 'wechat', isPublic: true
      } as any
    }
    if (!realContact) return null
    
    // 构建 agentConfig（如果是 Agent 类型且有源数据）
    const agentConfig = realContact.contactType === ContactType.AGENT && entityData ? {
      ...entityData,
      model: (entityData as any).model,
      instructions: (entityData as any).instructions,
      ttsModel: (entityData as any).ttsModel,
      videoModel: (entityData as any).videoModel,
    } : undefined
    
    return {
      ...realContact,
      displayName: realContact.alias || realContact.name || 'Unknown',
      displayAvatar: realContact.avatarUrl || '',
      sourceType: realContact.contactType === 'agent' ? 'agent' : (realContact.externalPlatform === 'wechat' ? 'wechat' : 'solid'),
      agentConfig,
    } as UnifiedContact
  }, [selectedId, realContact, entityData])

  const currentUserRef = session.info.webId ?? undefined
  const isGroup = !!realContact && isGroupContact(realContact)
  const groupContactRef = isGroup ? realContact?.entityUri || realContact?.id || null : null
  const groupMemberRoleMap = useMemo(
    () => (groupContactRef ? contactOps.getGroupMemberRoles(groupContactRef) : {}),
    [groupContactRef, contacts],
  )
  const groupMembers = useMemo<GroupMember[]>(() => {
    if (!groupContactRef) return []

    const memberRefs = contactOps.getGroupMembers(groupContactRef)
    const resolvedByRef = new Map(
      contactOps.resolveMembers(memberRefs).flatMap((member) => {
        const refs = new Set<string>()
        if (member.id) refs.add(member.id)
        if (typeof member.entityUri === 'string' && member.entityUri.length > 0) refs.add(member.entityUri)
        return Array.from(refs).map((ref) => [ref, member] as const)
      }),
    )

    return memberRefs.map((memberRef) => ({
      memberRef,
      contact: resolvedByRef.get(memberRef) ?? ({
        id: memberRef,
        name: getShortId(memberRef),
        contactType: ContactType.SOLID,
        entityUri: memberRef,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as any),
      role: (groupMemberRoleMap[memberRef] as 'owner' | 'admin' | 'member' | undefined) ?? 'member',
    }))
  }, [groupContactRef, groupMemberRoleMap, contacts])
  const currentUserRole = currentUserRef ? groupMemberRoleMap[currentUserRef] : undefined
  const isGroupOwner = currentUserRole === 'owner'
  const isGroupAdmin = currentUserRole === 'owner' || currentUserRole === 'admin'

  const { data: inviteContacts = [] } = useQuery({
    queryKey: ['contacts', 'group-invite', inviteTargetGroupId],
    queryFn: () => contactOps.getAll(),
    enabled: inviteMemberDialogOpen && !!inviteTargetGroupId,
  })

  const inviteCandidates = useMemo(() => {
    if (!inviteTargetGroupId) return []

    const existingMembers = new Set(contactOps.getGroupMembers(inviteTargetGroupId))
    return inviteContacts
      .filter((candidate) => !isGroupContact(candidate) && !candidate.deletedAt)
      .filter((candidate) => {
        const memberRef = candidate.entityUri || candidate.id
        return typeof memberRef === 'string' && memberRef.length > 0 && !existingMembers.has(memberRef)
      })
      .filter((candidate) => {
        if (!inviteSearch.trim()) return true
        const query = inviteSearch.toLowerCase()
        return candidate.name?.toLowerCase().includes(query) || candidate.alias?.toLowerCase().includes(query)
      })
  }, [inviteContacts, inviteSearch, inviteTargetGroupId, contacts])

  // === 操作处理函数 ===
  
  // 开始聊天 - 查找或创建与该联系人的聊天
  const handleStartChat = useCallback(async () => {
    if (!contact || !selectedId) return
    
    try {
      // 对于 mock 数据，使用 contact.id 作为 chatId
      if (selectedId.startsWith('mock-')) {
        selectChat(contact.id)
        navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
        return
      }

      if (realContact && isGroupContact(realContact)) {
        const chat = contactOps.getGroupChat(realContact.entityUri || realContact.id)
        if (!chat) {
          throw new Error('群聊不存在')
        }
        selectChat(chat.id)
        navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
        return
      }
      
      // 使用 contactOps 查找或创建聊天
      const chatId = await contactOps.findOrCreateChat(selectedId)
      selectChat(chatId)
      navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
    } catch (e) {
      notify.error('无法启动聊天')
    }
  }, [contact, selectedId, selectChat, navigate, realContact, notify])

  // 语音通话
  const handleVoiceCall = useCallback(() => {
    notify.info('语音通话功能即将上线')
  }, [notify])

  // 视频通话
  const handleVideoCall = useCallback(() => {
    notify.info('视频通话功能即将上线')
  }, [notify])

  // 复制 ID
  const handleCopyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id)
    notify.success('已复制到剪贴板')
  }, [notify])

  // 切换星标
  const handleToggleStar = useCallback(async () => {
    if (!contact || selectedId?.startsWith('mock-')) {
      notify.info('Mock 数据不支持修改')
      return
    }
    try {
      await contactOps.toggleStar(selectedId!, !!contact.starred)
      notify.success(contact.starred ? '已取消星标' : '已添加星标')
    } catch (e) {
      notify.error('操作失败')
    }
  }, [contact, selectedId, notify])

  // 切换公开关系
  const handleTogglePublic = useCallback(async (checked: boolean) => {
    if (!contact || selectedId?.startsWith('mock-')) {
      notify.info('Mock 数据不支持修改')
      return
    }
    try {
      await contactOps.updateContact(selectedId!, { isPublic: checked })
      notify.success(checked ? '已公开到个人资料' : '已设为私密')
    } catch (e) {
      notify.error('操作失败')
    }
  }, [contact, selectedId, notify])

  // 打开备注名编辑
  const handleOpenAliasEdit = useCallback(() => {
    setEditingAlias(contact?.alias || '')
    setEditMode('alias')
  }, [contact])

  // 保存备注名
  const handleSaveAlias = useCallback(async () => {
    if (!contact || selectedId?.startsWith('mock-')) {
      notify.info('Mock 数据不支持修改')
      setEditMode('none')
      return
    }
    setIsSaving(true)
    try {
      await contactOps.updateContact(selectedId!, { alias: editingAlias.trim() || undefined })
      notify.success('备注名已更新')
      setEditMode('none')
    } catch (e) {
      notify.error('保存失败')
    } finally {
      setIsSaving(false)
    }
  }, [contact, selectedId, editingAlias, notify])

  // 打开 Prompt 编辑
  const handleOpenPromptEdit = useCallback(() => {
    setEditingPrompt(contact?.agentConfig?.instructions || '')
    setEditMode('prompt')
  }, [contact])

  // 保存 Prompt
  const handleSavePrompt = useCallback(async () => {
    if (!contact || selectedId?.startsWith('mock-') || !entityUri) {
      notify.info('Mock 数据不支持修改')
      setEditMode('none')
      return
    }
    setIsSaving(true)
    try {
      await contactOps.updateAgent(entityUri, { instructions: editingPrompt.trim() })
      notify.success('系统提示词已更新')
      setEditMode('none')
    } catch (e) {
      notify.error('保存失败')
    } finally {
      setIsSaving(false)
    }
  }, [contact, selectedId, entityUri, editingPrompt, notify])

  // 删除联系人
  const handleDelete = useCallback(async () => {
    if (!contact || selectedId?.startsWith('mock-')) {
      notify.info('Mock 数据不支持删除')
      setEditMode('none')
      return
    }
    setIsSaving(true)
    try {
      await contactOps.deleteContact(selectedId!)
      notify.success('联系人已删除')
      selectContact(null)
      setEditMode('none')
    } catch (e) {
      notify.error('删除失败')
    } finally {
      setIsSaving(false)
    }
  }, [contact, selectedId, selectContact, notify])

  // 分享联系人
  const handleShare = useCallback(() => {
    if (!contact) return
    const shareUrl = contact.entityUri || `linx://contact/${contact.id}`
    navigator.clipboard.writeText(shareUrl)
    notify.success('联系人链接已复制')
  }, [contact, notify])

  // 打开标签编辑
  const handleOpenTagsEdit = useCallback(() => {
    setEditingTags(contact?.tags?.map(t => t.id) || [])
    setNewTagName('')
    setEditMode('tags')
  }, [contact])

  // 切换标签选中状态
  const handleToggleTag = useCallback((tagId: string) => {
    setEditingTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }, [])

  // 添加新标签
  const handleAddNewTag = useCallback(() => {
    if (!newTagName.trim()) return
    // 创建临时 ID
    const newId = `custom-${Date.now()}`
    setEditingTags(prev => [...prev, newId])
    setNewTagName('')
    notify.success(`标签 "${newTagName}" 已添加`)
  }, [newTagName, notify])

  // 保存标签 (Mock)
  const handleSaveTags = useCallback(() => {
    notify.success('标签已更新')
    setEditMode('none')
  }, [notify])

  // Mock new friends data
  const MOCK_NEW_FRIENDS = [
    { id: 'new-1', name: 'Bob Johnson', avatarUrl: '', message: '我是通过微信搜索添加的', time: '2小时前' },
    { id: 'new-2', name: '李明', avatarUrl: '', message: '你好，我是 xxx 的朋友', time: '昨天' },
  ]

  // 接受好友请求
  const handleAcceptFriend = useCallback((_id: string) => {
    notify.success('已添加为好友')
    clearNewFriends()
  }, [clearNewFriends, notify])

  // 忽略好友请求
  const handleIgnoreFriend = useCallback((_id: string) => {
    notify.info('已忽略该请求')
  }, [notify])

  // 搜索 WebID - 使用 contactOps.fetchSolidProfile
  const handleSearchWebId = useCallback(async () => {
    if (!friendSearch.webId.trim()) {
      setFriendSearch(s => ({ ...s, error: '请输入 WebID' }))
      return
    }
    
    setFriendSearch(s => ({ ...s, isSearching: true, error: '', searchResult: null }))
    
    try {
      const webId = friendSearch.webId.trim()
      const profile = await contactOps.fetchSolidProfile(webId)
      
      if (!profile) {
        setFriendSearch(s => ({ 
          ...s, 
          isSearching: false, 
          error: '无法获取用户信息，请检查 WebID 是否正确' 
        }))
        return
      }
      
      setFriendSearch(s => ({
        ...s,
        isSearching: false,
        searchResult: {
          name: profile.name,
          webId: profile.webId,
          avatarUrl: profile.avatarUrl,
        }
      }))
    } catch (e) {
      setFriendSearch(s => ({ 
        ...s, 
        isSearching: false, 
        error: '搜索失败，请检查网络连接' 
      }))
    }
  }, [friendSearch.webId])

  // 添加朋友（确认搜索结果后）
  const handleAddFriend = useCallback(async () => {
    if (!friendSearch.searchResult) return
    
    setIsSaving(true)
    try {
      // Use contactOps to create contact + chat together
      const result = await contactOps.addFriend({
        name: friendSearch.searchResult.name,
        webId: friendSearch.searchResult.webId,
        avatarUrl: friendSearch.searchResult.avatarUrl,
      })
      
      notify.success('好友添加成功')
      closeCreateDialog()
      // Select the new contact
      selectContact(result.id)
    } catch (e) {
      notify.error('添加失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [friendSearch.searchResult, closeCreateDialog, selectContact, notify])

  // 创建助手
  const handleCreateAgent = useCallback(async () => {
    if (!createForm.name.trim()) {
      notify.error('请输入助手名称')
      return
    }
    
    setIsSaving(true)
    try {
      // Use contactOps to create agent + contact + chat together
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
      // Select the new contact
      selectContact(result.id)
    } catch (e) {
      notify.error('创建失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [createForm, closeCreateDialog, selectContact, notify])

  const handleViewGroupMemberProfile = useCallback((contactId: string) => {
    const nextContact = contacts.find((entry) => entry.id === contactId)
    if (nextContact) {
      selectContact(nextContact.id)
    }
  }, [contacts, selectContact])

  const handleMentionMember = useCallback((contactName: string) => {
    navigator.clipboard.writeText(`@${contactName} `)
    notify.info(`已复制 @${contactName}`)
  }, [notify])

  const handleRemoveGroupMember = useCallback(async (memberRef: string) => {
    if (!groupContactRef) return
    try {
      await contactOps.removeMemberFromGroup(groupContactRef, memberRef)
      notify.success('成员已移除')
    } catch {
      notify.error('移除成员失败')
    }
  }, [groupContactRef, notify])

  const handleUpdateGroupMemberRole = useCallback(async (memberRef: string, role: 'admin' | 'member') => {
    if (!groupContactRef) return
    try {
      await contactOps.updateMemberRole(groupContactRef, memberRef, role)
      notify.success(role === 'admin' ? '已设为管理员' : '已取消管理员')
    } catch {
      notify.error('更新成员角色失败')
    }
  }, [groupContactRef, notify])

  const toggleInvitee = useCallback((contactId: string) => {
    setSelectedInvitees((current) => {
      const next = new Set(current)
      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }
      return next
    })
  }, [])

  const handleInviteMembers = useCallback(async () => {
    if (!inviteTargetGroupId || selectedInvitees.size === 0) return
    setIsInviting(true)
    try {
      const candidatesById = new Map(inviteContacts.map((candidate) => [candidate.id, candidate]))
      for (const inviteeId of selectedInvitees) {
        const candidate = candidatesById.get(inviteeId)
        const memberRef = candidate?.entityUri || candidate?.id
        if (typeof memberRef === 'string' && memberRef.length > 0) {
          await contactOps.addMemberToGroup(inviteTargetGroupId, memberRef)
        }
      }

      notify.success('已邀请成员')
      setInviteSearch('')
      setSelectedInvitees(new Set())
      closeInviteMemberDialog()
    } catch {
      notify.error('邀请成员失败')
    } finally {
      setIsInviting(false)
    }
  }, [inviteContacts, inviteTargetGroupId, selectedInvitees, closeInviteMemberDialog, notify])

  const handleGroupCreated = useCallback((contactId: string, chatId: string) => {
    closeCreateDialog()
    selectContact(contactId)
    selectChat(chatId)
    navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
  }, [closeCreateDialog, selectContact, selectChat, navigate])

  // 渲染 "新的朋友" 视图
  if (viewMode === 'new-friends') {
    return (
      <div className="flex-1 h-full bg-background flex flex-col overflow-hidden">
        <div className="h-16 flex items-center px-6 border-b border-border/30">
          <h2 className="text-lg font-semibold">新的朋友</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {MOCK_NEW_FRIENDS.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无好友请求</p>
              </div>
            ) : (
              MOCK_NEW_FRIENDS.map(friend => (
                <div key={friend.id} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/40">
                  <Avatar className="w-12 h-12 rounded-lg">
                    <AvatarImage src={friend.avatarUrl} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {friend.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{friend.name}</span>
                      <span className="text-xs text-muted-foreground">{friend.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{friend.message}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleIgnoreFriend(friend.id)}>
                      忽略
                    </Button>
                    <Button size="sm" onClick={() => handleAcceptFriend(friend.id)}>
                      接受
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  if (!selectedId) return <div className="flex-1 h-full bg-layout-content flex items-center justify-center"><div className="text-center opacity-60"><User className="w-12 h-12 mx-auto mb-2 text-muted-foreground" /><p className="text-sm">选择联系人查看详情</p></div></div>
  if (isContactLoading || !contact) return <div className="flex-1 h-full bg-layout-content flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground/30" /></div>

  const displayName = contact.alias || contact.name || 'Unknown'
  const rawId = contact.externalId || contact.entityUri || contact.id
  const displayId = getShortId(rawId ?? '')
  const region = contact.province ? `${contact.province} ${contact.city || ''}` : '未知地区'
  const gender = contact.gender || (contact.contactType === 'agent' ? 'bot' : 'unknown')
  
  const isAgent = contact.sourceType === 'agent'
  const isReference = contact.sourceType === 'solid' || (isAgent && rawId?.startsWith('http'))

  // Tools Mock Data
  const TOOLS = [
    { id: 'web-search', name: '联网搜索', desc: 'Google / Bing Search', enabled: true },
    { id: 'calculator', name: '计算器', desc: 'Math Calculator', enabled: true },
    { id: 'dalle', name: 'DALL·E 3', desc: 'Image Generation', enabled: false },
    { id: 'browser', name: '网页浏览', desc: 'Fetch & Read URL', enabled: false }
  ]

  return (
    <div className="flex-1 h-full bg-background flex flex-col overflow-hidden">
      {/* Top Actions */}
      <div className="h-16 flex items-center justify-end px-4 gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={handleShare}>
          <Share2 className="w-4.5 h-4.5 text-muted-foreground" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md">
              <MoreHorizontal className="w-4.5 h-4.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={handleToggleStar}>
              <Star className={cn("w-4 h-4 mr-2", contact.starred && "fill-yellow-400 text-yellow-400")} />
              {contact.starred ? '取消星标' : '设为星标'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenAliasEdit}>
              <Edit3 className="w-4 h-4 mr-2" />
              修改备注
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditMode('delete')} className="text-destructive focus:text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              删除联系人
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 pt-2 pb-12 space-y-8">
          
          {/* HEADER */}
          <div className="flex items-start gap-6">
            <Avatar className="w-24 h-24 rounded-2xl border border-border/50 shadow-sm shrink-0">
              <AvatarImage src={contact.displayAvatar} className="object-cover" />
              <AvatarFallback className="text-3xl bg-primary/5 text-primary font-bold">{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 py-1 space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-foreground truncate flex items-baseline gap-1">
                  {displayName}
                  {contact.sourceType === 'wechat' && <span className="text-sm font-normal text-muted-foreground/60 ml-1">@wechat</span>}
                </h2>
                <GenderIcon type={gender} />
                {contact.starred && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-2 h-6">
                <span className="shrink-0 opacity-60 w-12 text-right">{contact.sourceType === 'wechat' ? '微信号:' : 'ID:'}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-medium truncate" title={rawId}>{displayId}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-muted-foreground/10 text-muted-foreground/50 hover:text-foreground" onClick={() => handleCopyId(rawId ?? '')}><Copy className="w-3 h-3" /></Button>
                  {isReference && (
                    <div className="flex items-center gap-1 pl-1 border-l border-border/40">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn(
                          "h-5 w-5 rounded-md hover:bg-muted-foreground/10",
                          syncError ? "text-destructive/70 hover:text-destructive" : "text-primary/70 hover:text-primary"
                        )}
                        onClick={handleManualSync}
                        disabled={isSyncing}
                      >
                        <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
                      </Button>
                      {syncError ? (
                        <AlertCircle className="w-3 h-3 text-destructive/50" />
                      ) : (
                        <LinkIcon className="w-3 h-3 text-muted-foreground/30" />
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* 同步状态行 */}
              {isReference && (
                <div className="text-xs text-muted-foreground/60 flex items-center gap-1.5 ml-14">
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>正在同步...</span>
                    </>
                  ) : syncError ? (
                    <>
                      <AlertCircle className="w-3 h-3 text-destructive/60" />
                      <span className="text-destructive/60">{syncError.message}</span>
                      <Button 
                        variant="link" 
                        className="h-auto p-0 text-xs text-primary/70 hover:text-primary"
                        onClick={handleManualSync}
                      >
                        重试
                      </Button>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-500/60" />
                      <span>{contactOps.getLastSyncedText(realContact?.lastSyncedAt)}</span>
                    </>
                  )}
                </div>
              )}
              {isGroup ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="shrink-0 opacity-60 w-12 text-right">成员:</span>
                  <span className="truncate">{groupMembers.length} 人</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><span className="shrink-0 opacity-60 w-12 text-right">地区:</span><span className="truncate">{region}</span></div>
              )}
            </div>
          </div>

          {/* ACTION BAR */}
          <div className="grid grid-cols-3 gap-3">
            <Button variant="secondary" className="h-12 rounded-xl gap-2 text-sm font-medium bg-muted/60 hover:bg-muted border border-border/10" onClick={handleStartChat}><MessageCircle className="w-5 h-5" /> 聊天</Button>
            <Button variant="secondary" className="h-12 rounded-xl gap-2 text-sm font-medium bg-muted/60 hover:bg-muted border border-border/10" onClick={handleVoiceCall}><Phone className="w-5 h-5" /> 语音</Button>
            <Button variant="secondary" className="h-12 rounded-xl gap-2 text-sm font-medium bg-muted/60 hover:bg-muted border border-border/10" onClick={handleVideoCall}><Video className="w-5 h-5" /> 视频</Button>
          </div>

          {isGroup ? (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
              <InfoRow label="群成员" hideArrow>
                <span className="font-medium">{groupMembers.length} 人</span>
              </InfoRow>
              <InfoRow label="我的角色" hideArrow>
                <span className="font-medium">
                  {currentUserRole === 'owner' ? '群主' : currentUserRole === 'admin' ? '管理员' : '成员'}
                </span>
              </InfoRow>
              <InfoRow label="群聊资源" hideArrow last>
                <span className="font-mono text-xs break-all">{realContact?.entityUri || realContact?.id}</span>
              </InfoRow>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
              <InfoRow label="备注名" onClick={handleOpenAliasEdit} hideArrow>
                <span className="font-medium">{contact.alias || '点击设置备注'}</span>
              </InfoRow>
              <InfoRow label="标签" onClick={handleOpenTagsEdit} hideArrow>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {(contact.tags && contact.tags.length > 0) ? (
                    contact.tags.map(tag => (
                      <Badge key={tag.id} variant="secondary" className="bg-muted/50 font-normal text-xs px-2 py-0.5 rounded-md border-none">{tag.name}</Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="bg-muted/50 font-normal text-xs px-2 py-0.5 rounded-md border-none">朋友</Badge>
                  )}
                  <div className="w-6 h-6 rounded-md border border-dashed border-border/60 flex items-center justify-center text-muted-foreground/40 hover:border-primary/50 hover:text-primary/50 cursor-pointer transition-colors"><UserPlus className="w-3 h-3" /></div>
                </div>
              </InfoRow>
              <InfoRow label="朋友权限" onClick={() => {}}>
                <span>已允许访问 Inbox, Profile</span>
              </InfoRow>
              <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/30 transition-colors">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">公开关系</span>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">在我的公开资料中显示</span>
                  <Switch checked={!!contact.isPublic} onCheckedChange={handleTogglePublic} className="scale-90" />
                </div>
              </div>
            </div>
          )}

          {/* BLOCK 2: Agent Specific Config */}
          {isAgent && contact.agentConfig && (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
              <InfoRow label="系统提示词" onClick={() => !isReference && handleOpenPromptEdit()}>
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-2 italic text-muted-foreground/80">{contact.agentConfig.instructions || '未设置'}</p>
                  {isReference && <Lock className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                </div>
              </InfoRow>
              
              <InfoRow label="聊天模型" hideArrow>
                <ModelSelector type="chat" value={contact.agentConfig.model} className="h-8 border-none bg-transparent hover:bg-transparent px-0 justify-end" />
              </InfoRow>

              <InfoRow label="语音模型" hideArrow>
                <ModelSelector type="voice" value={contact.agentConfig.ttsModel} className="h-8 border-none bg-transparent hover:bg-transparent px-0 justify-end" />
              </InfoRow>

              <InfoRow label="视频模型" hideArrow>
                <ModelSelector type="video" value={contact.agentConfig.videoModel} className="h-8 border-none bg-transparent hover:bg-transparent px-0 justify-end" />
              </InfoRow>

              <InfoRow label="插件工具" onClick={() => setEditMode('tools')} last>
                <div className="flex items-center gap-1">
                  {(contact.agentConfig.tools || []).slice(0, 3).map((tool, i) => (
                    <div key={i} className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[8px] text-primary font-bold">{tool[0]}</div>
                  ))}
                  {(contact.agentConfig.tools?.length || 0) === 0 && <span className="text-muted-foreground">无</span>}
                </div>
              </InfoRow>
            </div>
          )}

          {/* BLOCK 3: Contact Details (Humans Only) */}
          {!isAgent && !isGroup && (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
              <InfoRow label="电话" onClick={() => {}} hideArrow>
                <span className="text-blue-500">138 0013 8000</span>
              </InfoRow>
              <InfoRow label="邮箱" onClick={() => {}} hideArrow last={contact.sourceType !== 'solid'}>
                <span className="text-blue-500">alice@example.com</span>
              </InfoRow>
              {contact.sourceType === 'solid' && (
                <InfoRow label="Inbox" onClick={() => {}} last>
                  <span className="font-mono text-xs break-all">https://alice.solid/inbox/</span>
                </InfoRow>
              )}
            </div>
          )}

          {/* BLOCK 4: Origin & Bio */}
          {!isGroup && (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
              <InfoRow label="共同群聊" onClick={() => {}}>
                <span className="text-muted-foreground">3 个群聊</span>
              </InfoRow>
              {(contact.agentConfig?.description || contact.note) && (
                <InfoRow label="个性签名" onClick={() => {}} hideArrow>
                  <span className="italic text-muted-foreground/80">{contact.agentConfig?.description || contact.note}</span>
                </InfoRow>
              )}
              <InfoRow label="来源" last hideArrow>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] uppercase font-normal rounded-md">{contact.sourceType}</Badge>
                  <span className="text-xs text-muted-foreground">{contact.sourceType === 'agent' ? '本地创建' : '通过 ID 搜索添加'}</span>
                </div>
              </InfoRow>
            </div>
          )}

          </div>
        </div>
        {isGroup && (
          <MemberList
            members={groupMembers}
            currentUserRef={currentUserRef}
            isOwner={isGroupOwner}
            isAdmin={isGroupAdmin}
            onViewProfile={handleViewGroupMemberProfile}
            onMention={handleMentionMember}
            onRemoveMember={handleRemoveGroupMember}
            onUpdateRole={handleUpdateGroupMemberRole}
            onInvite={() => realContact && openInviteMemberDialog(realContact.entityUri || realContact.id)}
          />
        )}
      </div>

      {/* --- DIALOGS --- */}
      
      {/* 备注名编辑 Dialog */}
      <Dialog open={editMode === 'alias'} onOpenChange={(v) => !v && setEditMode('none')}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>修改备注名</DialogTitle>
            <DialogDescription>更新当前联系人或群组的备注名称。</DialogDescription>
          </DialogHeader>
          <Input 
            placeholder="输入备注名..." 
            value={editingAlias}
            onChange={(e) => setEditingAlias(e.target.value)}
            className="mt-2"
            autoFocus
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditMode('none')} disabled={isSaving}>取消</Button>
            <Button onClick={handleSaveAlias} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt 编辑 Dialog */}
      <Dialog open={editMode === 'prompt'} onOpenChange={(v) => !v && setEditMode('none')}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑系统提示词</DialogTitle>
            <DialogDescription>调整当前助手的系统提示词。</DialogDescription>
          </DialogHeader>
          <Textarea 
            placeholder="输入 System Prompt..." 
            className="min-h-[200px] resize-none font-mono text-sm leading-relaxed"
            value={editingPrompt}
            onChange={(e) => setEditingPrompt(e.target.value)}
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditMode('none')} disabled={isSaving}>取消</Button>
            <Button onClick={handleSavePrompt} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 工具配置 Dialog */}
      <Dialog open={editMode === 'tools'} onOpenChange={(v) => !v && setEditMode('none')}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>配置插件工具</DialogTitle>
            <DialogDescription>管理当前助手可调用的插件工具。</DialogDescription>
          </DialogHeader>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="搜索工具..." className="pl-9" />
          </div>
          <ScrollArea className="h-[300px] -mx-6 px-6">
            <div className="space-y-4">
              {TOOLS.map((t) => (
                <div key={t.id} className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </div>
                  </div>
                  <Switch defaultChecked={t.enabled} />
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* 标签管理 Dialog */}
      <Dialog open={editMode === 'tags'} onOpenChange={(v) => !v && setEditMode('none')}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>管理标签</DialogTitle>
            <DialogDescription>为当前联系人维护标签信息。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={editingTags.includes(tag.id) ? "default" : "secondary"}
                  className={cn(
                    "cursor-pointer transition-all px-3 py-1.5 text-sm",
                    editingTags.includes(tag.id) 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted/50 hover:bg-muted"
                  )}
                  onClick={() => handleToggleTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="添加新标签..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewTag()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddNewTag} disabled={!newTagName.trim()}>
                添加
              </Button>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditMode('none')}>取消</Button>
            <Button onClick={handleSaveTags}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 Dialog */}
      <Dialog open={editMode === 'delete'} onOpenChange={(v) => !v && setEditMode('none')}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除联系人</DialogTitle>
            <DialogDescription>删除联系人后，关联聊天也会同步移除。</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除 <span className="font-medium text-foreground">{contact?.alias || contact?.name}</span> 吗？此操作无法撤销。
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditMode('none')} disabled={isSaving}>取消</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建助手 Dialog */}
      <Dialog open={createDialogOpen && createType === 'agent'} onOpenChange={(v) => !v && closeCreateDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              新建助手
            </DialogTitle>
            <DialogDescription>创建一个新的 AI 联系人与默认会话。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称 *</label>
              <Input
                placeholder="给助手起个名字"
                value={createForm.name}
                onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">系统提示词</label>
              <Textarea
                placeholder="描述助手的角色和能力..."
                value={createForm.instructions}
                onChange={(e) => setCreateForm(f => ({ ...f, instructions: e.target.value }))}
                className="min-h-[100px] resize-none"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">聊天模型</label>
              <ModelSelector
                type="chat"
                value={createForm.model}
                onChange={(model) => setCreateForm(f => ({ ...f, model }))}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeCreateDialog} disabled={isSaving}>
              取消
            </Button>
            <Button onClick={handleCreateAgent} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加朋友 Dialog */}
      <Dialog open={createDialogOpen && createType === 'friend'} onOpenChange={(v) => !v && closeCreateDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              添加朋友
            </DialogTitle>
            <DialogDescription>通过 WebID 搜索并添加新的 Solid 联系人。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* 搜索框 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">WebID</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://alice.solidcommunity.net/profile/card#me"
                  value={friendSearch.webId}
                  onChange={(e) => setFriendSearch(s => ({ ...s, webId: e.target.value, error: '' }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchWebId()}
                  autoFocus
                />
                <Button onClick={handleSearchWebId} disabled={friendSearch.isSearching}>
                  {friendSearch.isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {friendSearch.error && (
                <p className="text-xs text-destructive">{friendSearch.error}</p>
              )}
            </div>

            {/* 搜索结果 */}
            {friendSearch.searchResult && (
              <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 rounded-xl">
                    <AvatarImage src={friendSearch.searchResult.avatarUrl} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {friendSearch.searchResult.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold">{friendSearch.searchResult.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{friendSearch.searchResult.webId}</p>
                  </div>
                </div>
                <Button className="w-full" onClick={handleAddFriend} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  添加为好友
                </Button>
              </div>
            )}

            {/* 空状态提示 */}
            {!friendSearch.searchResult && !friendSearch.isSearching && (
              <div className="py-8 text-center text-muted-foreground">
                <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">输入对方的 WebID 搜索用户</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateGroupDialog
        open={createDialogOpen && createType === 'group'}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog()
        }}
        onCreated={handleGroupCreated}
      />

      <Dialog
        open={inviteMemberDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setInviteSearch('')
            setSelectedInvitees(new Set())
            closeInviteMemberDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>邀请成员</DialogTitle>
            <DialogDescription>选择联系人加入当前群组。</DialogDescription>
          </DialogHeader>
          <SelectableContactList
            title="可邀请联系人"
            icon={<UserPlus className="w-4 h-4" />}
            contacts={inviteCandidates}
            selected={selectedInvitees}
            onToggle={toggleInvitee}
            search={inviteSearch}
            onSearchChange={setInviteSearch}
            showSearch
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeInviteMemberDialog} disabled={isInviting}>取消</Button>
            <Button onClick={handleInviteMembers} disabled={selectedInvitees.size === 0 || isInviting}>
              {isInviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              邀请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export default ContactDetailPane
