import type { ReactNode } from 'react'
import type { ContactRow } from '@undefineds.co/models'
import type { ContactEntry, UnifiedContact } from '../domain/types'
import { formatModelLabel } from '../domain/contact-projection'
import { isDefaultSecretaryContactId } from '../domain/default-secretary'
import type { GroupMember } from './MemberList'
import { MemberList } from './MemberList'
import { SelectableContactList } from './SelectableContactList'
import { ContactAvatar } from './ContactAvatar'
import { ContactEntryView } from './ContactEntryViews'
import { ContactSpaceSection, type ContactSpaceViewProps } from './ContactSpaceSection'
import { GroupCard, GroupRow } from './group-rows'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ModelSelector, type ModelOption } from '@/components/ui/model-selector'
import { cn } from '@/lib/utils'
import {
  AlertCircle, Bot, Check, ChevronRight, Loader2, Lock, MessageCircle, Phone, User, UserPlus, Video,
} from 'lucide-react'

type EditMode = 'none' | 'alias' | 'delete' | 'condition' | 'shares' | 'grants'
type CreateType = 'agent' | 'friend' | 'group' | null

interface CreateForm {
  name: string
  instructions: string
  model: string
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
    isOwnAgent: boolean
    entry: ContactEntry | null
    groups: UnifiedContact[]
    recentFriends: UnifiedContact[]
    commonGroups: Array<{ id: string; name: string }>
    /** 名字@提供方 */
    address: string | null
    /** Full account address, only for the copy action. */
    fullAddress: string | null
  }
  space: ContactSpaceViewProps & {
    onRevokeAll(): Promise<boolean>
    isRevoking: boolean
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
    model: string
    revokeOnDelete: boolean
    onAliasChange(value: string): void
    onModelChange(value: string): void
    onRevokeOnDeleteChange(value: boolean): void
    onClose(): void
    onOpen(mode: EditMode): void
    onOpenDelete(): void
    onSaveAlias(): void
    onSaveModel(): void
    onDelete(): void
  }
  creation: {
    open: boolean
    type: CreateType
    form: CreateForm
    availableAgentModels: ModelOption[]
    methodTemplates: Array<{ id: string; label: string; instructions: string }>
    onUpdateForm(patch: Partial<CreateForm>): void
    onClose(): void
    onFriendAdded(friend: { contactId: string; chatId: string }): void
    onCreateAgent(): void
    onGroupCreated(contactId: string, chatId: string): void
  }
  actions: {
    onOpenAliasEdit(): void
    onCopyAddress(fullAddress: string): void
    onStartChat(): void
    onVoiceCall(): void
    onVideoCall(): void
    onOpenMethod(): void
    onOpenCondition(): void
    onSelectContact(contactId: string): void
    onAddFriend(): void
  }
  /** Supplied by the pane so this file stays free of other modules' hooks. */
  renderGrants?: (agentId: string) => ReactNode
  renderAddFriend?: (props: {
    onAdded: (friend: { contactId: string; chatId: string }) => void
    onOpenExisting: (contactId: string) => void
  }) => ReactNode
}

function ActionButton({ icon, label, primary, onClick }: {
  icon: ReactNode
  label: string
  primary?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[13px] transition-colors',
        primary
          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export function ContactDetail({ detail, space, sync, group, editing, creation, actions, renderGrants, renderAddFriend }: ContactDetailProps) {
  const { selectedId, isContactLoading, error, onRetry, contact, isGroup } = detail
  const content = detail.entry && !selectedId ? (
    <ContactEntryView
      entry={detail.entry}
      groups={detail.groups}
      recentFriends={detail.recentFriends}
      onSelect={actions.onSelectContact}
      onAddFriend={actions.onAddFriend}
    />
  ) : !selectedId ? (
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
    const displayName = contact.alias || contact.name || '未命名'
    const isAgent = contact.sourceType === 'agent'
    // An assistant from someone else is read-only: its method stays with them.
    const isReference = isAgent && !detail.isOwnAgent
    const isOwnAssistant = isAgent && detail.isOwnAgent
    const isProtected = isDefaultSecretaryContactId(contact.id)
    const modelLabel = formatModelLabel(contact.agentConfig?.model)
    const agentId = contact.agentConfig?.id
    const hasSpaceSection = !isAgent && !isGroup && !!detail.fullAddress
    const methodSummary = contact.agentConfig?.instructions?.trim().split('\n')[0]

    return (
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-8 py-8 space-y-5">
            <div className="flex items-center gap-4">
              {isGroup ? (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted"><User className="h-6 w-6" aria-hidden="true" /></span>
              ) : (
                <ContactAvatar
                  name={displayName}
                  src={contact.displayAvatar}
                  isAssistant={isAgent}
                  isOthersAssistant={isReference}
                  className="h-14 w-14"
                  fallbackClassName="text-lg"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold">{displayName}</h2>
                {isAgent ? (
                  <p className="text-sm text-muted-foreground">{isOwnAssistant ? '助手 · 你创建的' : '助手 · 别人共享给你'}</p>
                ) : isGroup ? (
                  <p className="text-sm text-muted-foreground">{group.members.length} 人</p>
                ) : detail.address ? (
                  <p className="truncate text-sm text-muted-foreground">{detail.address}</p>
                ) : null}
                {!isAgent && !isGroup && contact.alias && contact.name && contact.alias !== contact.name ? (
                  <p className="truncate text-xs text-muted-foreground">昵称：{contact.name}</p>
                ) : null}
              </div>
            </div>

            <div className={cn('grid gap-2.5', isGroup ? 'grid-cols-1' : 'grid-cols-3')}>
              <ActionButton primary icon={<MessageCircle className="h-5 w-5" aria-hidden="true" />} label="发消息" onClick={actions.onStartChat} />
              {isGroup ? null : (
                <>
                  <ActionButton icon={<Phone className="h-5 w-5" aria-hidden="true" />} label="语音通话" onClick={actions.onVoiceCall} />
                  <ActionButton icon={<Video className="h-5 w-5" aria-hidden="true" />} label="视频通话" onClick={actions.onVideoCall} />
                </>
              )}
            </div>

            {isGroup ? (
              <GroupCard>
                <GroupRow label="群成员"><span className="ml-auto">{group.members.length} 人</span></GroupRow>
                <GroupRow label="我的角色"><span className="ml-auto">{group.currentUserRole === 'owner' ? '群主' : group.currentUserRole === 'admin' ? '管理员' : '成员'}</span></GroupRow>
              </GroupCard>
            ) : (
              <>
                {isAgent ? (
                  <GroupCard>
                    <GroupRow label="做事的方法" onClick={isReference ? undefined : actions.onOpenMethod}>
                      <span className="ml-auto min-w-0 truncate text-muted-foreground">
                        {isReference ? '由对方管理，你看不到' : methodSummary || '还没有写'}
                      </span>
                      {isReference ? <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    </GroupRow>
                    {isReference ? null : (
                      <GroupRow label="执行条件" onClick={actions.onOpenCondition}>
                        <span className="ml-auto text-muted-foreground">{modelLabel ?? '未设置'}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </GroupRow>
                    )}
                    {isOwnAssistant && agentId && renderGrants ? (
                      <GroupRow label="在你空间里的权限" onClick={() => editing.onOpen('grants')}>
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </GroupRow>
                    ) : null}
                    <GroupRow label="账号">
                      <span className="truncate">{detail.address ?? '暂时看不到'}</span>
                      {detail.fullAddress ? (
                        <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => actions.onCopyAddress(detail.fullAddress as string)}>复制地址</Button>
                      ) : null}
                    </GroupRow>
                  </GroupCard>
                ) : null}
                {isOwnAssistant ? <p className="px-1 text-xs text-muted-foreground">改名、换模型都不会改变它的身份和聊天记录</p> : null}

                <section aria-label="备注与往来" className="space-y-2">
                  <h3 className="px-1 text-xs text-muted-foreground">备注与往来</h3>
                  <GroupCard>
                    <GroupRow label="备注" onClick={actions.onOpenAliasEdit}>
                      <span className="ml-auto truncate text-muted-foreground">{contact.alias || '未设置'}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </GroupRow>
                    {isAgent ? null : (
                      <GroupRow
                        label="共同群聊"
                        onClick={detail.commonGroups.length ? () => actions.onSelectContact(detail.commonGroups[0].id) : undefined}
                      >
                        <span className="ml-auto truncate text-muted-foreground">
                          {detail.commonGroups.length === 0
                            ? '没有'
                            : detail.commonGroups.length === 1
                              ? detail.commonGroups[0].name
                              : `${detail.commonGroups[0].name} 等 ${detail.commonGroups.length} 个`}
                        </span>
                        {detail.commonGroups.length ? <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
                      </GroupRow>
                    )}
                  </GroupCard>
                </section>

                {hasSpaceSection ? (
                  <>
                    <ContactSpaceSection
                      space={space}
                      address={detail.address}
                      fullAddress={detail.fullAddress}
                      sync={sync}
                      onCopyAddress={actions.onCopyAddress}
                      onOpenAccess={() => editing.onOpen('shares')}
                    />
                    <p className="px-1 text-xs text-muted-foreground">备注只存在你的空间，TA 看不到。</p>
                  </>
                ) : null}
              </>
            )}

            {isProtected ? null : (
              <button
                type="button"
                onClick={editing.onOpenDelete}
                className="px-1 text-sm text-destructive hover:underline"
              >
                {isGroup ? '删除群聊…' : '删除联系人…'}
              </button>
            )}
          </div>
        </div>
        {isGroup && <MemberList members={group.members} currentUserRef={group.currentUserRef} isOwner={group.isOwner} isAdmin={group.isAdmin} onViewProfile={group.onViewProfile} onMention={group.onMention} onRemoveMember={group.onRemoveMember} onUpdateRole={group.onUpdateRole} onInvite={group.onOpenInvite} />}
      </div>
    )
  })()

  const shareCount = space.summary.sharedWithThem.length
  const deleteName = contact?.alias || contact?.name || ''

  return (
    <div className="flex-1 h-full bg-background flex flex-col overflow-hidden">
      {content}

      <Dialog open={editing.mode === 'alias'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>备注</DialogTitle>
            <DialogDescription>备注只存在你的空间，TA 看不到。</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!editing.isSaving) editing.onSaveAlias()
            }}
          >
            <Input placeholder="给 TA 起个备注" value={editing.alias} onChange={(event) => editing.onAliasChange(event.target.value)} className="mt-2" autoFocus />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button>
              <Button type="submit" disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing.mode === 'condition'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>执行条件</DialogTitle>
            <DialogDescription>选它用哪个模型做事。换模型不会改变它的身份和聊天记录。</DialogDescription>
          </DialogHeader>
          <ModelSelector
            type="chat"
            value={editing.model}
            onChange={editing.onModelChange}
            models={creation.availableAgentModels.length ? creation.availableAgentModels : undefined}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button>
            <Button onClick={editing.onSaveModel} disabled={editing.isSaving || !editing.model}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing.mode === 'grants'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{contact?.alias || contact?.name} 在你空间里的权限</DialogTitle>
            <DialogDescription>对外发送、花钱、删除：没单独授权就每次问你。</DialogDescription>
          </DialogHeader>
          {contact?.agentConfig?.id && renderGrants ? renderGrants(contact.agentConfig.id) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editing.mode === 'shares'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleteName} 在你空间里能做什么</DialogTitle>
            <DialogDescription>
              {space.summary.known ? '下面是你的空间现在的设置。' : '现在查不到你的空间设置，稍后再试。'}
            </DialogDescription>
          </DialogHeader>
          <GroupCard>
            {space.summary.canDo.map((line) => (
              <GroupRow key={line.label} label={line.label}><span className="ml-auto text-muted-foreground">{line.value}</span></GroupRow>
            ))}
          </GroupCard>
          <p className="text-xs text-muted-foreground">我共享给 TA 的</p>
          {shareCount === 0 ? (
            <p className="text-sm text-muted-foreground">{space.summary.sharedText}。单个文件的共享在“文件”里看。</p>
          ) : (
            <GroupCard>
              {space.summary.sharedWithThem.map((item) => (
                <GroupRow key={item.place} label={item.label}><span className="ml-auto text-muted-foreground">{item.value}</span></GroupRow>
              ))}
            </GroupCard>
          )}
          <DialogFooter className="mt-2">
            {shareCount > 0 ? (
              <Button variant="outline" disabled={space.isRevoking} onClick={() => { void space.onRevokeAll() }}>
                {space.isRevoking && <Loader2 className="w-4 h-4 animate-spin mr-2" />}全部收回…
              </Button>
            ) : null}
            <Button onClick={editing.onClose}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing.mode === 'delete'} onOpenChange={(open) => !open && editing.onClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除 {deleteName}？</DialogTitle>
            <DialogDescription>
              {isGroup ? '聊天记录还在。' : '聊天记录还在。删除后 TA 仍能看到你的公开资料。'}
            </DialogDescription>
          </DialogHeader>
          {shareCount > 0 && !isGroup ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.revokeOnDelete}
                onChange={(event) => editing.onRevokeOnDeleteChange(event.target.checked)}
              />
              同时收回我共享给 TA 的 {shareCount} 项
            </label>
          ) : null}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={editing.onClose} disabled={editing.isSaving}>取消</Button>
            <Button variant="destructive" onClick={editing.onDelete} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creation.open && creation.type === 'agent'} onOpenChange={(open) => !open && creation.onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5" />创建助手</DialogTitle>
            <DialogDescription>它会出现在联系人和聊天里。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="new-agent-name">名字</label>
              <Input id="new-agent-name" placeholder="给助手起个名字" value={creation.form.name} onChange={(event) => creation.onUpdateForm({ name: event.target.value })} autoFocus />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">从哪个方法开始</p>
              <div role="radiogroup" aria-label="从哪个方法开始" className="overflow-hidden rounded-lg border border-border">
                {creation.methodTemplates.map((template) => {
                  const selected = creation.form.instructions === template.instructions
                  return (
                    <button key={template.id} type="button" role="radio" aria-checked={selected} onClick={() => creation.onUpdateForm({ instructions: template.instructions })} className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40">
                      <span className="min-w-0 truncate">{template.label}</span>
                      {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                    </button>
                  )
                })}
                <button type="button" role="radio" aria-checked={!creation.form.instructions} onClick={() => creation.onUpdateForm({ instructions: '' })} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40">
                  <span>空白</span>
                  {!creation.form.instructions ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">创建助手不会训练模型；做事的方法在“我的 AI”里改，执行条件之后也可以改。</p>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={creation.onClose} disabled={editing.isSaving}>取消</Button>
            <Button onClick={creation.onCreateAgent} disabled={editing.isSaving}>{editing.isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creation.open && creation.type === 'friend'} onOpenChange={(open) => !open && creation.onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />添加朋友</DialogTitle>
            <DialogDescription>粘贴对方的账号，找到后添加。</DialogDescription>
          </DialogHeader>
          {renderAddFriend?.({
            onAdded: creation.onFriendAdded,
            onOpenExisting: (contactId) => { creation.onClose(); actions.onSelectContact(contactId) },
          })}
        </DialogContent>
      </Dialog>

      <Dialog open={group.invite.open} onOpenChange={(open) => !open && group.invite.onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>邀请成员</DialogTitle><DialogDescription>选择联系人加入当前群组。</DialogDescription></DialogHeader>
          <SelectableContactList title="可邀请联系人" icon={<UserPlus className="w-4 h-4" />} contacts={group.invite.candidates} selected={group.invite.selected} onToggle={group.invite.onToggle} search={group.invite.search} onSearchChange={group.invite.onSearchChange} showSearch />
          <DialogFooter>
            <Button variant="outline" onClick={group.invite.onClose} disabled={group.invite.isInviting}>取消</Button>
            <Button onClick={group.invite.onSubmit} disabled={group.invite.selected.size === 0 || group.invite.isInviting}>{group.invite.isInviting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}邀请</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ContactDetail
