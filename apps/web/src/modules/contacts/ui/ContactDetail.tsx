import type { ContactRow } from '@undefineds.co/models'
import type { UnifiedContact } from '../domain/types'
import { getShortContactId } from '../domain/contact-projection'
import type { GroupMember } from './MemberList'
import { MemberList } from './MemberList'
import { SelectableContactList } from './SelectableContactList'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ModelSelector } from '@/components/ui/model-selector'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AlertCircle, Bot, CheckCircle2, ChevronRight, Copy, Edit3, Link as LinkIcon,
  Loader2, Lock, MessageCircle, MoreHorizontal, Phone, RefreshCw, Search,
  Share2, Star, Trash2, User, UserPlus, Video,
} from 'lucide-react'

type EditMode = 'none' | 'prompt' | 'tools' | 'alias' | 'delete'
type CreateType = 'agent' | 'friend' | 'group' | null

interface CreateForm {
  name: string
  instructions: string
  model: string
}

interface FriendSearch {
  webId: string
  isSearching: boolean
  searchResult: { name: string; webId: string; avatarUrl?: string } | null
  error: string
}

export interface ContactDetailProps {
  detail: {
    selectedId: string | null
    isContactLoading: boolean
    error: string | null
    onRetry(): void
    contact: UnifiedContact | null
    persistedContact: ContactRow | null
    contactInbox: string | null
    isGroup: boolean
  }
  sync: {
    isSyncing: boolean
    errorMessage: string | null
    lastSyncedText: string
    onRefresh(): void
  }
  group: {
    members: GroupMember[]
    currentUserRef?: string
    currentUserRole?: string
    isOwner: boolean
    isAdmin: boolean
    onViewProfile(contactId: string): void
    onMention(contactName: string): void
    onRemoveMember(memberRef: string): void
    onUpdateRole(memberRef: string, role: 'admin' | 'member'): void
    onOpenInvite(): void
    invite: {
      open: boolean
      candidates: ContactRow[]
      selected: Set<string>
      search: string
      isInviting: boolean
      onToggle(contactId: string): void
      onSearchChange(search: string): void
      onClose(): void
      onSubmit(): void
    }
  }
  editing: {
    mode: EditMode
    isSaving: boolean
    alias: string
    prompt: string
    toolsText: string
    onAliasChange(value: string): void
    onPromptChange(value: string): void
    onToolsTextChange(value: string): void
    onClose(): void
    onOpenDelete(): void
    onSaveAlias(): void
    onSavePrompt(): void
    onSaveTools(): void
    onDelete(): void
  }
  creation: {
    open: boolean
    type: CreateType
    form: CreateForm
    friendSearch: FriendSearch
    onUpdateForm(patch: Partial<CreateForm>): void
    onFriendWebIdChange(webId: string): void
    onClose(): void
    onSearchWebId(): void
    onAddFriend(): void
    onCreateAgent(): void
    onGroupCreated(contactId: string, chatId: string): void
  }
  actions: {
    onShare(): void
    onToggleStar(): void
    onOpenAliasEdit(): void
    onCopyId(id: string): void
    onStartChat(): void
    onVoiceCall(): void
    onVideoCall(): void
    onTogglePublic(checked: boolean): void
    onOpenPromptEdit(): void
    onOpenToolsEdit(): void
  }
}

const CALLING_ACTIONS_ENABLED = false
const SHARED_GROUPS_ENABLED = false
const REFERENCE_PERMISSION_EDITOR_ENABLED = false

function GenderIcon({ type }: { type?: string }) {
  if (type === 'male') return <span aria-label="男" className="ml-1 font-medium text-muted-foreground">♂</span>
  if (type === 'female') return <span aria-label="女" className="ml-1 font-medium text-muted-foreground">♀</span>
  if (type === 'bot') return <Bot className="w-3.5 h-3.5 text-primary ml-1" />
  return null
}

function InfoRow({ label, children, onClick, last, hideArrow }: {
  label: string
  children: React.ReactNode
  onClick?: () => void
  last?: boolean
  hideArrow?: boolean
}) {
  return (
    <div onClick={onClick} className={cn(
      'flex items-start py-4 px-4 hover:bg-muted/30 transition-colors cursor-pointer group',
      !last && 'border-b border-border/30',
    )}>
      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0 text-sm text-foreground">{children}</div>
      {onClick && !hideArrow && <ChevronRight className="w-4 h-4 text-muted-foreground/20 shrink-0 self-center" />}
    </div>
  )
}

export function ContactDetail({ detail, sync, group, editing, creation, actions }: ContactDetailProps) {
  const { selectedId, isContactLoading, error, onRetry, contact, persistedContact, contactInbox, isGroup } = detail
  const content = !selectedId ? (
    <div className="flex-1 h-full bg-layout-content flex items-center justify-center">
      <div className="text-center opacity-60">
        <User className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm">选择联系人查看详情</p>
      </div>
    </div>
  ) : error ? (
    <div className="flex-1 h-full bg-layout-content flex items-center justify-center px-6">
      <div role="alert" className="text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive/70" />
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>重试</Button>
      </div>
    </div>
  ) : isContactLoading || !contact ? (
    <div className="flex-1 h-full bg-layout-content flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/30" />
    </div>
  ) : (() => {
    const displayName = contact.alias || contact.name || 'Unknown'
    const rawId = contact.externalId || contact.about || contact.id
    const displayId = getShortContactId(rawId ?? '')
    const region = contact.province ? `${contact.province} ${contact.city || ''}` : '未知地区'
    const isAgent = contact.sourceType === 'agent'
    const gender = contact.gender || (isAgent ? 'bot' : 'unknown')
    const isReference = contact.sourceType === 'solid' || (isAgent && rawId?.startsWith('http'))

    return (
      <>
        <div className="h-16 flex items-center justify-end px-4 gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={actions.onShare}>
            <Share2 className="w-4.5 h-4.5 text-muted-foreground" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md"><MoreHorizontal className="w-4.5 h-4.5 text-muted-foreground" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={actions.onToggleStar}>
                <Star className={cn('w-4 h-4 mr-2', contact.starred && 'fill-primary text-primary')} />
                {contact.starred ? '取消星标' : '设为星标'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={actions.onOpenAliasEdit}><Edit3 className="w-4 h-4 mr-2" />修改备注</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={editing.onOpenDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />删除联系人
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-8 pt-2 pb-12 space-y-8">
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
                    {contact.starred && <Star className="w-4 h-4 fill-primary text-primary" />}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 h-6">
                    <span className="shrink-0 opacity-60 w-12 text-right">{contact.sourceType === 'wechat' ? '微信号:' : 'ID:'}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-medium truncate" title={rawId}>{displayId}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md" onClick={() => actions.onCopyId(rawId ?? '')}><Copy className="w-3 h-3" /></Button>
                      {isReference && (
                        <div className="flex items-center gap-1 pl-1 border-l border-border/40">
                          <Button variant="ghost" size="icon" className={cn('h-5 w-5 rounded-md', sync.errorMessage ? 'text-destructive/70' : 'text-primary/70')} onClick={sync.onRefresh} disabled={sync.isSyncing}>
                            <RefreshCw className={cn('w-3 h-3', sync.isSyncing && 'animate-spin')} />
                          </Button>
                          {sync.errorMessage ? <AlertCircle className="w-3 h-3 text-destructive/50" /> : <LinkIcon className="w-3 h-3 text-muted-foreground/30" />}
                        </div>
                      )}
                    </div>
                  </div>
                  {isReference && (
                    <div className="text-xs text-muted-foreground/60 flex items-center gap-1.5 ml-14">
                      {sync.isSyncing ? <><Loader2 className="w-3 h-3 animate-spin" /><span>正在同步...</span></>
                        : sync.errorMessage ? <><AlertCircle className="w-3 h-3 text-destructive/60" /><span className="text-destructive/60">{sync.errorMessage}</span><Button variant="link" className="h-auto p-0 text-xs" onClick={sync.onRefresh}>重试</Button></>
                          : <><CheckCircle2 className="w-3 h-3 text-success/60" /><span>{sync.lastSyncedText}</span></>}
                    </div>
                  )}
                  {isGroup ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2"><span className="shrink-0 opacity-60 w-12 text-right">成员:</span><span>{group.members.length} 人</span></div>
                  ) : (
                    <div className="text-sm text-muted-foreground flex items-center gap-2"><span className="shrink-0 opacity-60 w-12 text-right">地区:</span><span>{region}</span></div>
                  )}
                </div>
              </div>

              <div className={cn('grid gap-3', CALLING_ACTIONS_ENABLED ? 'grid-cols-3' : 'grid-cols-1')}>
                <Button variant="secondary" className="h-12 rounded-xl gap-2" onClick={actions.onStartChat}><MessageCircle className="w-5 h-5" />聊天</Button>
                {CALLING_ACTIONS_ENABLED && <><Button variant="secondary" onClick={actions.onVoiceCall}><Phone className="w-5 h-5" />语音</Button><Button variant="secondary" onClick={actions.onVideoCall}><Video className="w-5 h-5" />视频</Button></>}
              </div>

              {isGroup ? (
                <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
                  <InfoRow label="群成员" hideArrow><span className="font-medium">{group.members.length} 人</span></InfoRow>
                  <InfoRow label="我的角色" hideArrow><span className="font-medium">{group.currentUserRole === 'owner' ? '群主' : group.currentUserRole === 'admin' ? '管理员' : '成员'}</span></InfoRow>
                  <InfoRow label="群聊资源" hideArrow last><span className="font-mono text-xs break-all">{persistedContact?.about || persistedContact?.id}</span></InfoRow>
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
                  <InfoRow label="备注名" onClick={actions.onOpenAliasEdit} hideArrow><span className="font-medium">{contact.alias || '点击设置备注'}</span></InfoRow>
                  {REFERENCE_PERMISSION_EDITOR_ENABLED && <InfoRow label="朋友权限" onClick={() => {}}><span>已允许访问 Inbox, Profile</span></InfoRow>}
                  <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/30">
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">公开关系</span>
                    <div className="flex-1 flex items-center justify-between"><span className="text-xs text-muted-foreground">在我的公开资料中显示</span><Switch checked={!!contact.isPublic} onCheckedChange={actions.onTogglePublic} className="scale-90" /></div>
                  </div>
                </div>
              )}

              {isAgent && contact.agentConfig && (
                <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
                  <InfoRow label="系统提示词" onClick={!isReference ? actions.onOpenPromptEdit : undefined}><div className="flex items-center justify-between gap-2"><p className="line-clamp-2 italic text-muted-foreground/80">{contact.agentConfig.instructions || '未设置'}</p>{isReference && <Lock className="w-3 h-3" />}</div></InfoRow>
                  <InfoRow label="聊天模型" hideArrow><span className="font-medium">{contact.agentConfig.model || '未设置'}</span></InfoRow>
                  <InfoRow label="语音模型" hideArrow><span className="font-medium">{contact.agentConfig.ttsModel || '未设置'}</span></InfoRow>
                  <InfoRow label="视频模型" hideArrow><span className="font-medium">{contact.agentConfig.videoModel || '未设置'}</span></InfoRow>
                  <InfoRow label="插件工具" onClick={!isReference ? actions.onOpenToolsEdit : undefined} last>
                    <div className="flex items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5">{contact.agentConfig.tools?.length ? contact.agentConfig.tools.map((tool) => <Badge key={tool} variant="secondary">{tool}</Badge>) : <span className="text-muted-foreground">无</span>}</div>{isReference && <Lock className="w-3 h-3" />}</div>
                  </InfoRow>
                </div>
              )}

              {!isAgent && !isGroup && (contact.about || contactInbox) && (
                <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
                  {contact.about && <InfoRow label={contact.sourceType === 'solid' ? '用户地址' : '资源'} hideArrow last={!contactInbox}><span className="font-mono text-xs break-all">{contact.about}</span></InfoRow>}
                  {contactInbox && <InfoRow label="Inbox" hideArrow last><span className="font-mono text-xs break-all">{contactInbox}</span></InfoRow>}
                </div>
              )}

              {!isGroup && (
                <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
                  {SHARED_GROUPS_ENABLED && <InfoRow label="共同群聊" onClick={() => {}}><span className="text-muted-foreground">3 个群聊</span></InfoRow>}
                  {(contact.agentConfig?.description || contact.note) && <InfoRow label="个性签名" hideArrow><span className="italic text-muted-foreground/80">{contact.agentConfig?.description || contact.note}</span></InfoRow>}
                  <InfoRow label="来源" last hideArrow><div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px] uppercase">{contact.sourceType}</Badge><span className="text-xs text-muted-foreground">{contact.sourceType === 'agent' ? '本地创建' : '通过 ID 搜索添加'}</span></div></InfoRow>
                </div>
              )}
            </div>
          </div>
          {isGroup && <MemberList members={group.members} currentUserRef={group.currentUserRef} isOwner={group.isOwner} isAdmin={group.isAdmin} onViewProfile={group.onViewProfile} onMention={group.onMention} onRemoveMember={group.onRemoveMember} onUpdateRole={group.onUpdateRole} onInvite={group.onOpenInvite} />}
        </div>
      </>
    )
  })()

  return (
    <div className="flex-1 h-full bg-background flex flex-col overflow-hidden">
      {content}

      <Dialog open={editing.mode === 'alias'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>修改备注名</DialogTitle><DialogDescription>更新当前联系人或群组的备注名称。</DialogDescription></DialogHeader><Input placeholder="输入备注名..." value={editing.alias} onChange={(event) => editing.onAliasChange(event.target.value)} className="mt-2" autoFocus /><DialogFooter className="mt-4"><Button variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button><Button onClick={editing.onSaveAlias} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}保存</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={editing.mode === 'prompt'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>编辑系统提示词</DialogTitle><DialogDescription>调整当前助手的系统提示词。</DialogDescription></DialogHeader><Textarea placeholder="输入 System Prompt..." className="min-h-[200px] resize-none font-mono text-sm leading-relaxed" value={editing.prompt} onChange={(event) => editing.onPromptChange(event.target.value)} /><DialogFooter className="mt-4"><Button variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button><Button onClick={editing.onSavePrompt} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}保存</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={editing.mode === 'tools'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>配置插件工具</DialogTitle><DialogDescription>每行一个工具标识，直接写入当前助手配置。</DialogDescription></DialogHeader><Textarea placeholder={'例如：web-search\nfilesystem\nnotion'} className="min-h-[220px] resize-none font-mono text-sm leading-relaxed" value={editing.toolsText} onChange={(event) => editing.onToolsTextChange(event.target.value)} /><DialogFooter className="mt-4"><Button variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button><Button onClick={editing.onSaveTools} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}保存</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={editing.mode === 'delete'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>删除联系人</DialogTitle><DialogDescription>删除联系人后，关联聊天也会同步移除。</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">确定要删除 <span className="font-medium text-foreground">{contact?.alias || contact?.name}</span> 吗？此操作无法撤销。</p><DialogFooter className="mt-4"><Button variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button><Button variant="destructive" onClick={editing.onDelete} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}删除</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={creation.open && creation.type === 'agent'} onOpenChange={(open) => !open && creation.onClose()}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5" />新建助手</DialogTitle><DialogDescription>创建一个新的 AI 联系人与默认会话。</DialogDescription></DialogHeader><div className="space-y-4 mt-2"><div className="space-y-2"><label className="text-sm font-medium">名称 *</label><Input placeholder="给助手起个名字" value={creation.form.name} onChange={(event) => creation.onUpdateForm({ name: event.target.value })} autoFocus /></div><div className="space-y-2"><label className="text-sm font-medium">系统提示词</label><Textarea placeholder="描述助手的角色和能力..." value={creation.form.instructions} onChange={(event) => creation.onUpdateForm({ instructions: event.target.value })} className="min-h-[100px] resize-none" /></div><div className="space-y-2"><label className="text-sm font-medium">聊天模型</label><ModelSelector type="chat" value={creation.form.model} onChange={(model) => creation.onUpdateForm({ model })} className="w-full" /></div></div><DialogFooter className="mt-4"><Button variant="outline" onClick={creation.onClose} disabled={editing.isSaving}>取消</Button><Button onClick={creation.onCreateAgent} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}创建</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={creation.open && creation.type === 'friend'} onOpenChange={(open) => !open && creation.onClose()}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><User className="w-5 h-5" />添加朋友</DialogTitle><DialogDescription>通过用户地址搜索并添加新的联系人。</DialogDescription></DialogHeader><div className="space-y-4 mt-2"><div className="space-y-2"><label className="text-sm font-medium">用户地址</label><div className="flex gap-2"><Input placeholder="https://alice.solidcommunity.net/profile/card#me" value={creation.friendSearch.webId} onChange={(event) => creation.onFriendWebIdChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && creation.onSearchWebId()} autoFocus /><Button onClick={creation.onSearchWebId} disabled={creation.friendSearch.isSearching}>{creation.friendSearch.isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button></div>{creation.friendSearch.error && <p className="text-xs text-destructive">{creation.friendSearch.error}</p>}</div>{creation.friendSearch.searchResult && <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-4"><div className="flex items-center gap-4"><Avatar className="w-14 h-14 rounded-xl"><AvatarImage src={creation.friendSearch.searchResult.avatarUrl} /><AvatarFallback>{creation.friendSearch.searchResult.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div className="flex-1 min-w-0"><h3 className="text-base font-semibold">{creation.friendSearch.searchResult.name}</h3><p className="text-xs text-muted-foreground truncate">{creation.friendSearch.searchResult.webId}</p></div></div><Button className="w-full" onClick={creation.onAddFriend} disabled={editing.isSaving}>{editing.isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}添加为好友</Button></div>}{!creation.friendSearch.searchResult && !creation.friendSearch.isSearching && <div className="py-8 text-center text-muted-foreground"><User className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">输入对方的用户地址搜索用户</p></div>}</div></DialogContent>
      </Dialog>

      <Dialog open={group.invite.open} onOpenChange={(open) => !open && group.invite.onClose()}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>邀请成员</DialogTitle><DialogDescription>选择联系人加入当前群组。</DialogDescription></DialogHeader><SelectableContactList title="可邀请联系人" icon={<UserPlus className="w-4 h-4" />} contacts={group.invite.candidates} selected={group.invite.selected} onToggle={group.invite.onToggle} search={group.invite.search} onSearchChange={group.invite.onSearchChange} showSearch /><DialogFooter><Button variant="outline" onClick={group.invite.onClose} disabled={group.invite.isInviting}>取消</Button><Button onClick={group.invite.onSubmit} disabled={group.invite.selected.size === 0 || group.invite.isInviting}>{group.invite.isInviting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}邀请</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  )
}

export default ContactDetail
