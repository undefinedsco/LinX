import { useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LockKeyhole, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInboxItems } from '@/modules/inbox/collections'
import { useInboxStore } from '@/modules/inbox/store'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { useLinxDefaultSecretaryBootstrapSettling } from '../../collections'

export interface InboxActionBannerProps {
  chatId: string
  threadId: string
}

export function InboxActionBanner({ chatId, threadId }: InboxActionBannerProps) {
  const navigate = useNavigate()
  const selectItem = useInboxStore((state) => state.selectItem)
  const setFilter = useInboxStore((state) => state.setFilter)
  const isDefaultSecretarySettling = useLinxDefaultSecretaryBootstrapSettling()
  const { data: inboxItems = [] } = useInboxItems('all', { enabled: !isDefaultSecretarySettling })

  const actionableItems = useMemo(
    () => inboxItems.filter((item) => (
      item.chatId === chatId
      && (!item.threadId || item.threadId === threadId)
      && isActionableInboxItem(item)
    )),
    [chatId, inboxItems, threadId],
  )
  const primaryItem = useMemo(
    () => actionableItems.find((item) => item.category === 'auth_required')
      ?? actionableItems.find((item) => item.kind === 'approval' && item.status === 'pending')
      ?? null,
    [actionableItems],
  )
  const openInbox = useCallback(() => {
    if (!primaryItem) return
    setFilter('pending')
    selectItem(primaryItem.id)
    navigate({ to: '/$microAppId', params: { microAppId: 'inbox' } })
  }, [navigate, primaryItem, selectItem, setFilter])

  if (!primaryItem) return null

  const isAuthRequired = primaryItem.category === 'auth_required'
  const Icon = isAuthRequired ? LockKeyhole : ShieldAlert
  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-warning" />
          <span>{isAuthRequired ? '当前话题等待认证' : `当前话题有 ${actionableItems.length} 条待处理授权`}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAuthRequired
            ? '请先在收件箱完成认证，再继续当前 runtime 会话。'
            : '授权统一在收件箱处理；处理完成后 runtime 会自动续跑。'}
        </p>
      </div>
      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={openInbox}>打开收件箱</Button>
    </div>
  )
}
