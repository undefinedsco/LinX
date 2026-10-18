/**
 * ChatRightSidebar - 聊天信息 (W6 / W8 / W10 right column).
 *
 * Closed by default and remembered. One identity, one sidebar: assistant and
 * person chats show the same rows; recurring topics add 计划, coding runs add
 * 这次运行, groups switch to the 群聊信息 variant. Topics are not listed here.
 */
import { useMemo, useState, type FC } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatModelLabel } from '@/modules/contacts/domain/contact-projection'
import { useOpenFileEntry } from '@/modules/files/features/search/file-name-search'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useOpenAgentMethod } from '@/modules/my-ai/app/open-method'
import { useChatStore } from '../store'
import { useWorkbenchDialogs } from '../features/conversation/workbench-dialogs'
import {
  useChatMutations,
  useMessageIndex,
  useThreadList,
  chatOps,
  messageRowMatchesThread,
} from '../collections'
import { deleteChatCopy, avatarTextFor } from '../domain/chat-list-model'
import { projectChatAssets } from '../domain/chat-asset-library'
import { useChatIdentity } from '../features/identity/useChatIdentity'
import { useThreadSchedule } from '../features/schedule/useThreadSchedule'
import { useRuntimeSession } from '../runtime-client'
import { isCodingTool } from '../domain/coding-run'
import { ChatHistorySearchDialog } from '../ui/ChatHistorySearchDialog'
import { CodingRunInfoGroup } from '../ui/CodingRunInfoGroup'
import { InfoGroup, InfoRow, InfoSwitchRow } from '../ui/ChatInfoParts'
import { IdentityAvatar } from '../ui/IdentityAvatar'
import { MemberPickerDialog, type MemberCandidate } from '../ui/MemberPickerDialog'
import { ScheduleInfoGroup } from '../ui/ScheduleInfoGroup'

function methodSummary(instructions: unknown): string {
  const text = typeof instructions === 'string' ? instructions.trim() : ''
  if (!text) return '还没有写'
  const firstLine = text.split(/\r?\n/u).find((line) => line.trim())?.trim() ?? text
  return firstLine.length > 16 ? `${firstLine.slice(0, 16)}…` : firstLine
}

export interface ChatRightSidebarProps {}

export const ChatRightSidebar: FC<ChatRightSidebarProps> = () => {
  const { session } = useSession()
  const { toast } = useToast()
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectChat = useChatStore((state) => state.selectChat)
  const requestExecutionConditions = useChatStore((state) => state.requestExecutionConditions)

  const { chat, identity, agent, agentId, lookup, isSecretary } = useChatIdentity(selectedChatId)
  const mutations = useChatMutations()
  const openAgentMethod = useOpenAgentMethod()
  const openFileEntry = useOpenFileEntry()
  const { db } = useSolidDatabase()
  const podBaseUrl = db ? resolveCurrentPodBaseUrl(db) : null

  const { data: threads = [] } = useThreadList(selectedChatId ?? '', { enabled: !!selectedChatId })
  const { data: allMessages = [] } = useMessageIndex({ enabled: Boolean(selectedChatId) })
  const chatMessages = useMemo(() => {
    const threadIds = (threads as Array<{ id?: string | null }>).map((thread) => thread.id).filter((id): id is string => Boolean(id))
    return allMessages.filter((message) => threadIds.some((id) => messageRowMatchesThread(message.thread, id)))
  }, [allMessages, threads])
  const assetCount = useMemo(
    () => (podBaseUrl ? projectChatAssets(chatMessages as Parameters<typeof projectChatAssets>[0], podBaseUrl).length : 0),
    [chatMessages, podBaseUrl],
  )

  const isGroup = identity?.kind === 'group'
  const isAssistant = identity?.kind === 'assistant'
  const schedule = useThreadSchedule(isAssistant ? selectedThreadId : null)
  const runtime = useRuntimeSession(isAssistant ? selectedThreadId : null)
  const codingSession = runtime.runtimeSession && isCodingTool(runtime.runtimeSession.tool) ? runtime.runtimeSession : null

  const hasWorkspace = (threads as Array<{ id?: string | null; workspace?: string | null }>).some((thread) => thread.id === selectedThreadId && Boolean(thread.workspace))
  const openDialog = useWorkbenchDialogs((state) => state.open)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitees, setInvitees] = useState<string[]>([])

  if (!selectedChatId || !chat || !identity) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个聊天
      </div>
    )
  }

  const updateFlags = async (flags: { starred?: boolean; muted?: boolean; title?: string; participants?: string[] }) => {
    try {
      await mutations.updateChat.mutateAsync({ id: selectedChatId, ...flags } as never)
    } catch (error) {
      console.error('Update chat failed:', error)
      toast({ description: '没能保存，请稍后再试。', variant: 'destructive' })
    }
  }

  const remove = async () => {
    try {
      await mutations.deleteChat.mutateAsync(selectedChatId)
      selectChat(null)
      setConfirmRemove(false)
    } catch (error) {
      console.error('Remove chat failed:', error)
      toast({ description: '没能删除这个会话，请稍后再试。', variant: 'destructive' })
    }
  }

  const topicCount = chatOps.getThreads(selectedChatId).length
  const removeCopy = isGroup
    ? { title: `退出“${identity.name}”？`, description: '退出后不再收到这个群的消息，群里的文件不受影响。' }
    : deleteChatCopy({ title: identity.name, kind: identity.kind }, topicCount)

  const memberCandidates: MemberCandidate[] = lookup.contacts
    .filter((contact) => !contact.isGroup && contact.name)
    .map((contact) => ({
      id: contact.about || contact.id,
      name: contact.name,
      kind: contact.isAssistant ? 'assistant' : 'person',
      avatarUrl: contact.avatarUrl,
      disabledReason: identity.counterparts.includes(contact.about || contact.id) ? '已在群里' : null,
    }))
  const members = identity.counterparts.map((participant) => {
    const contact = lookup.find(participant)
    const name = contact?.name || '群成员'
    return { id: participant, name, kind: contact?.isAssistant ? ('assistant' as const) : ('person' as const), avatarUrl: contact?.avatarUrl }
  })
  const selfName = (session.info as { name?: string }).name

  return (
    <div className="flex h-full flex-col bg-layout-content">
      <div className="flex h-12 shrink-0 items-center border-b border-border/50 px-4">
        <h3 className="text-sm font-medium">聊天信息</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {isGroup ? (
            <>
              <InfoGroup title={`群成员 ${identity.memberCount}`}>
                <div className="grid grid-cols-4 gap-3 p-3">
                  {selfName ? (
                    <div className="flex min-w-0 flex-col items-center gap-1 text-[11px]">
                      <IdentityAvatar kind="person" text={avatarTextFor('person', selfName)} size="member" />
                      <span className="max-w-full truncate">{selfName}</span>
                    </div>
                  ) : null}
                  {members.map((member) => (
                    <div key={member.id} className="flex min-w-0 flex-col items-center gap-1 text-[11px]">
                      <IdentityAvatar kind={member.kind} text={avatarTextFor(member.kind, member.name)} avatarUrl={member.avatarUrl} size="member" />
                      <span className="max-w-full truncate">{member.name}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    aria-label="邀请"
                    onClick={() => { setInvitees([]); setInviteOpen(true) }}
                    className="flex min-w-0 flex-col items-center gap-1 text-[11px] text-primary"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-primary/60 text-lg">+</span>
                    邀请
                  </button>
                </div>
              </InfoGroup>
              <InfoGroup>
                <InfoRow label="群名称" value={identity.name} onClick={() => { setNameDraft(identity.name); setRenameOpen(true) }} />
                <InfoRow label="群里的文件" value={String(assetCount)} onClick={() => setHistoryOpen(true)} />
                <InfoRow label="查找聊天记录" onClick={() => setHistoryOpen(true)} />
                <InfoRow label="助手在这个群里" value="需要时接话" last />
              </InfoGroup>
            </>
          ) : (
            <>
              <InfoGroup>
                <div className="flex items-center gap-3 px-3 py-3">
                  <IdentityAvatar kind={identity.kind} text={avatarTextFor(identity.kind, identity.name)} avatarUrl={identity.avatarUrl} size="member" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{identity.name}</p>
                    <p className="text-xs text-muted-foreground">{isAssistant ? '助手' : '联系人'}</p>
                  </div>
                </div>
              </InfoGroup>
              {isAssistant && agentId ? (
                <InfoGroup>
                  <InfoRow label="做事的方法" value={methodSummary(agent?.instructions)} onClick={() => openAgentMethod(agentId)} />
                  <InfoRow
                    label="执行条件"
                    value={formatModelLabel(agent?.model as string | undefined) ?? '默认模型'}
                    onClick={requestExecutionConditions}
                    last
                  />
                </InfoGroup>
              ) : null}
              {isAssistant ? <ScheduleInfoGroup state={schedule} /> : null}
              {codingSession ? <CodingRunInfoGroup session={codingSession} agentId={agentId} /> : null}
              <InfoGroup>
                <InfoRow label="查找聊天记录" onClick={() => setHistoryOpen(true)} last />
              </InfoGroup>
            </>
          )}

          <InfoGroup title="这段聊天">
            {hasWorkspace ? <InfoRow label="项目记忆" onClick={() => openDialog('project-context')} /> : null}
            <InfoRow label="附件" onClick={() => openDialog('attachments')} />
            <InfoRow label="产物" onClick={() => openDialog('artifacts')} />
            <InfoRow label="素材" onClick={() => openDialog('assets')} />
            <InfoRow label="分享这段聊天" onClick={() => openDialog('share')} last />
          </InfoGroup>

          <InfoGroup>
            {!isSecretary ? (
              <InfoSwitchRow label="标星" checked={Boolean(chat.starred)} onCheckedChange={(checked) => { void updateFlags({ starred: checked }) }} />
            ) : null}
            <InfoSwitchRow label="免打扰" checked={Boolean(chat.muted)} onCheckedChange={(checked) => { void updateFlags({ muted: checked }) }} last />
          </InfoGroup>

          {!isSecretary ? (
            <InfoGroup>
              <InfoRow
                label={isGroup ? '退出群聊…' : '删除会话…'}
                tone="danger"
                onClick={() => setConfirmRemove(true)}
                last
              />
            </InfoGroup>
          ) : null}
        </div>
      </ScrollArea>

      <ChatHistorySearchDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        messages={chatMessages as never}
        podBaseUrl={podBaseUrl}
        onOpenAsset={(asset) => openFileEntry({
          id: asset.url,
          uri: asset.url,
          name: asset.name,
          kind: 'resource',
          parentUri: asset.url.replace(/[^/]+$/u, ''),
        })}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={removeCopy.title}
        description={removeCopy.description}
        confirmLabel={isGroup ? '退出' : '删除'}
        destructive
        busy={mutations.deleteChat.isPending}
        onConfirm={() => { void remove() }}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>群名称</DialogTitle></DialogHeader>
          <Input autoFocus value={nameDraft} aria-label="群名称" onChange={(event) => setNameDraft(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>取消</Button>
            <Button
              disabled={!nameDraft.trim()}
              onClick={() => { void updateFlags({ title: nameDraft.trim() }).then(() => setRenameOpen(false)) }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MemberPickerDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="邀请进群"
        description="选择要邀请的朋友或助手。"
        candidates={memberCandidates}
        selected={invitees}
        onToggle={(id) => setInvitees((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
        confirmLabel={`邀请（${invitees.length} 人）`}
        canConfirm={invitees.length > 0}
        onConfirm={() => {
          const participants = Array.from(new Set([...((chat.participants as string[] | undefined) ?? []), ...invitees]))
          void updateFlags({ participants }).then(() => setInviteOpen(false))
        }}
      />
    </div>
  )
}

export default ChatRightSidebar
