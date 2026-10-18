import { ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { ContactAccessSummary } from '../domain/contact-access'
import { GroupRow, GroupCard } from './group-rows'

export interface ContactSpaceViewProps {
  summary: ContactAccessSummary
  isLoading: boolean
  /** null when the public profile could not be read */
  showInProfile: boolean | null
  isUpdatingProfile: boolean
  onToggleShowInProfile(checked: boolean): void
}

export interface ContactSpaceSectionProps {
  space: ContactSpaceViewProps
  address: string | null
  fullAddress: string | null
  sync: {
    isSyncing: boolean
    errorMessage: string | null
    lastSyncedText: string
    onRefresh(): void
  }
  onCopyAddress(fullAddress: string): void
  onOpenAccess(): void
}

/** "TA 的空间与权限": only what the Pod can actually tell us. */
export function ContactSpaceSection({ space, address, fullAddress, sync, onCopyAddress, onOpenAccess }: ContactSpaceSectionProps) {
  const { summary } = space
  return (
    <section aria-label="TA 的空间与权限" className="space-y-2">
      <h3 className="px-1 text-xs text-muted-foreground">TA 的空间与权限</h3>
      <GroupCard>
        <GroupRow label="账号">
          <span className="truncate">{address ?? '暂时看不到'}</span>
          {fullAddress ? (
            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => onCopyAddress(fullAddress)}>
              复制地址
            </Button>
          ) : null}
        </GroupRow>
        <GroupRow label="资料来自 TA 的公开资料">
          {sync.errorMessage ? (
            <span className="text-xs text-muted-foreground">资料暂时读不到，显示的是上次的信息</span>
          ) : (
            <span className="text-xs text-muted-foreground">{sync.lastSyncedText}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={sync.onRefresh}
            disabled={sync.isSyncing}
          >
            {sync.isSyncing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            {sync.errorMessage ? '重试' : '刷新'}
          </Button>
        </GroupRow>
        <GroupRow label="我共享给 TA 的" onClick={onOpenAccess}>
          <span className="text-muted-foreground">{space.isLoading ? '正在查看…' : summary.sharedText}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </GroupRow>
        <GroupRow label="TA 在我空间里能做什么" onClick={onOpenAccess}>
          <span className="text-muted-foreground">{space.isLoading ? '正在查看…' : summary.canDoText}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </GroupRow>
        <GroupRow label="在我的公开资料里显示 TA">
          {space.showInProfile === null ? (
            <span className="ml-auto text-xs text-muted-foreground">暂时改不了</span>
          ) : (
            <Switch
              className="ml-auto"
              aria-label="在我的公开资料里显示 TA"
              checked={space.showInProfile}
              disabled={space.isUpdatingProfile}
              onCheckedChange={space.onToggleShowInProfile}
            />
          )}
        </GroupRow>
      </GroupCard>
    </section>
  )
}
