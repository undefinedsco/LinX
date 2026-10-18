import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { useSession } from '@/providers/solid-session-context'

import { copyFilesText } from '../../app/platform-actions'
import {
  parseShareAccountInput,
  useApplyShareChange,
  useShareContacts,
  useShareState,
} from '../../data/queries'
import type { ShareChange } from '../../data/proposal/share-commands'
import {
  SHARE_ROLE_LABEL,
  projectLinkCopy,
  projectShareErrorMessage,
  projectShareInheritance,
  projectShareRows,
  projectShareSummary,
  projectShareWarning,
  type ShareRole,
  type ShareRow,
} from '../../domain/resource/share-model'
import type { FilesEntry } from '../../domain/resource/resource-model'

export interface ShareDialogContext {
  /** A card whose quote came from a private chat. */
  privateChat?: { quote: string; withName: string } | null
  /** A board with cards some people cannot see. */
  hiddenCards?: { count: number } | null
  /** The folder this item lives in, for "跟“活动”文件夹一样". */
  parentName?: string | null
  childCount?: number | null
}

type ShareTarget = Pick<FilesEntry, 'uri' | 'kind'> & { name?: string }

type Pending =
  | { type: 'add'; webId: string; role: ShareRole; name: string }
  | { type: 'revoke'; row: ShareRow }
  | { type: 'link-on' }

const ROLE_OPTIONS: ShareRole[] = ['view', 'edit']

function RoleSelect({ value, onChange, disabled }: { value: ShareRole; onChange: (role: ShareRole) => void; disabled?: boolean }) {
  return (
    <select
      aria-label="权限"
      disabled={disabled}
      value={value}
      className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
      onChange={(event) => onChange(event.target.value as ShareRole)}
    >
      {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{SHARE_ROLE_LABEL[role]}</option>)}
    </select>
  )
}

/**
 * K9: share a folder, file, card or board with people, in plain words. Changes apply at once; revoking
 * is immediate and the other side loses access straight away.
 */
export function ShareDialog({
  file,
  open,
  onOpenChange,
  context,
}: {
  file: ShareTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  context?: ShareDialogContext
}) {
  const { toast } = useToast()
  const { session } = useSession()
  const isFolder = file.kind === 'container'
  const stateQuery = useShareState(file.uri, isFolder, open)
  const apply = useApplyShareChange()
  const { contacts, names } = useShareContacts()
  const [draft, setDraft] = useState('')
  const [role, setRole] = useState<ShareRole>('view')
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)

  const state = stateQuery.data ?? null
  const itemName = file.name || decodeURIComponent(file.uri.replace(/\/$/, '').split('/').pop() ?? '')
  const rows = useMemo(
    () => (state ? projectShareRows({ state, selfWebId: session.info.webId, names }) : []),
    [names, session.info.webId, state],
  )
  const inheritance = projectShareInheritance({
    followsParent: state?.followsParent ?? true,
    isFolder,
    parentName: context?.parentName,
  })
  const linkCopy = projectLinkCopy({ itemName, isFolder, childCount: context?.childCount })

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase()
    const shared = new Set(rows.map((row) => row.webId))
    return contacts
      .filter((contact) => !shared.has(contact.webId))
      .filter((contact) => !query || contact.name.toLowerCase().includes(query))
      .slice(0, 6)
  }, [contacts, draft, rows])

  const run = async (change: ShareChange, personName?: string) => {
    setError(null)
    try {
      await apply.mutateAsync({ uri: file.uri, isFolder, change })
    } catch (failure) {
      setError({ message: projectShareErrorMessage(failure, personName, { sharedWithYou: stateQuery.data?.canManage === false }), retry: () => { void run(change, personName) } })
    }
  }

  const addPerson = (webId: string, name: string) => {
    const warning = projectShareWarning({
      privateChat: context?.privateChat,
      hiddenCards: context?.hiddenCards ? { boardName: itemName, count: context.hiddenCards.count, personName: name } : null,
      cardName: itemName,
      personName: name,
    })
    if (warning) {
      setPending({ type: 'add', webId, role, name })
      return
    }
    void run({ type: 'person', webId, role }, name).then(() => setDraft(''))
  }

  const submitDraft = () => {
    const webId = parseShareAccountInput(draft)
    if (!webId) {
      setError({ message: '没认出这个账号，可以输入 名字@提供方', retry: () => setError(null) })
      return
    }
    addPerson(webId, draft.trim())
  }

  const warning = pending?.type === 'add'
    ? projectShareWarning({
      privateChat: context?.privateChat,
      hiddenCards: context?.hiddenCards ? { boardName: itemName, count: context.hiddenCards.count, personName: pending.name } : null,
      cardName: itemName,
      personName: pending.name,
    })
    : null

  const copyLink = async () => {
    try {
      await copyFilesText(file.uri)
      toast({ title: '链接已复制' })
    } catch {
      toast({ title: '没复制成功', variant: 'destructive' })
    }
  }

  const renderPending = () => {
    if (!pending) return null
    if (pending.type === 'link-on') {
      return (
        <div role="alertdialog" className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="font-medium">{linkCopy.confirmTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{linkCopy.confirmBody}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>取消</Button>
            <Button size="sm" onClick={() => { setPending(null); void run({ type: 'link', on: true }) }}>打开</Button>
          </div>
        </div>
      )
    }
    if (pending.type === 'revoke') {
      return (
        <div role="alertdialog" className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="font-medium">不再和 {pending.row.name} 共享“{itemName}”？</p>
          <p className="mt-1 text-xs text-muted-foreground">TA 那边立刻看不到。TA 已经下载的拿不回来。</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>取消</Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { const row = pending.row; setPending(null); void run({ type: 'person', webId: row.webId, role: null }, row.name) }}
            >
              不再共享
            </Button>
          </div>
        </div>
      )
    }
    if (!warning) return null
    const [lighter, together] = warning.options
    return (
      <div role="alertdialog" className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
        <p className="font-medium">{warning.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{warning.body}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>取消</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { const next = pending; setPending(null); void run({ type: 'person', webId: next.webId, role: next.role }, next.name).then(() => setDraft('')) }}
          >
            {lighter}
          </Button>
          <Button
            size="sm"
            onClick={() => { const next = pending; setPending(null); void run({ type: 'person', webId: next.webId, role: next.role }, next.name).then(() => setDraft('')) }}
          >
            {together}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" data-share-dialog="true">
        <DialogHeader className="border-b border-border/40 px-5 py-4">
          <DialogTitle className="text-base">共享“{itemName}”{isFolder ? '文件夹' : ''}</DialogTitle>
          <DialogDescription className="text-xs">
            {stateQuery.isLoading ? '正在读取…' : projectShareSummary(rows)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {state && !state.canManage ? (
            <p className="text-xs text-muted-foreground">这个{isFolder ? '文件夹' : '文件'}是别人共享给你的，你不能再共享给别人。</p>
          ) : null}
          {state?.canManage ? (
            <div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="添加人"
                  placeholder="添加人：名字@提供方"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') submitDraft() }}
                />
                <RoleSelect value={role} onChange={setRole} />
                <Button size="sm" disabled={!draft.trim() || apply.isPending} onClick={submitDraft}>添加</Button>
              </div>
              {suggestions.length > 0 ? (
                <ul aria-label="联系人" className="mt-2 divide-y divide-border/30 rounded-md border border-border/40">
                  {suggestions.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                        onClick={() => addPerson(contact.webId, contact.name)}
                      >
                        <span>{contact.name}</span>
                        <span className="text-muted-foreground">{contact.isAssistant ? '助手' : '联系人'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {renderPending()}

          {stateQuery.isError ? (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span>暂时读不到谁能访问，请稍后再试</span>
              <button type="button" className="underline" onClick={() => { void stateQuery.refetch() }}>重试</button>
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span>{error.message}</span>
              <button type="button" className="underline" onClick={error.retry}>重试</button>
            </div>
          ) : null}

          <ul aria-label="谁能访问" className="divide-y divide-border/30">
            {rows.map((row) => (
              <li key={row.webId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{row.name}</p>
                  {!row.isYou ? <p className="truncate text-xs text-muted-foreground">{row.address}</p> : null}
                </div>
                {row.role === 'owner' ? (
                  <span className="text-xs text-muted-foreground">所有者</span>
                ) : (
                  <>
                    <RoleSelect
                      value={row.role}
                      disabled={!row.editable || apply.isPending}
                      onChange={(next) => { void run({ type: 'person', webId: row.webId, role: next }, row.name) }}
                    />
                    {row.editable ? (
                      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setPending({ type: 'revoke', row })}>
                        不再共享
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>

          {state ? (
            <div className="rounded-lg border border-border/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p>知道链接的人也能看</p>
                  <p className="text-xs text-muted-foreground">{state.linkOn ? linkCopy.on : linkCopy.off}</p>
                </div>
                <Switch
                  aria-label="知道链接的人也能看"
                  checked={state.linkOn}
                  disabled={!state.canManage || apply.isPending}
                  onCheckedChange={(on) => {
                    if (on) setPending({ type: 'link-on' })
                    else void run({ type: 'link', on: false })
                  }}
                />
              </div>
            </div>
          ) : null}

          {state ? (
            <p className="text-xs text-muted-foreground">
              {inheritance.differs ? (
                <>
                  和文件夹不同：{state.people.length <= 1 ? '只有你' : '单独设置过'}
                  {state.canManage ? (
                    <button type="button" className="ml-2 text-primary hover:underline" onClick={() => { void run({ type: 'follow-parent' }) }}>改回跟随文件夹</button>
                  ) : null}
                </>
              ) : inheritance.note}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => { void copyLink() }}>复制链接</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>完成</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
