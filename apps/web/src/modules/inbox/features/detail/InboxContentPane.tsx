import { ChevronLeft } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { Button } from '@/components/ui/button'
import { InboxDetail } from '../../ui/InboxDetail'
import { InboxListPane } from '../list/InboxListPane'
import { useInboxContentPaneController } from './useInboxContentPaneController'

export function InboxContentPane({ compact = false, theme }: MicroAppPaneProps) {
  const controller = useInboxContentPaneController()

  if (controller.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载 inbox 详情…
      </div>
    )
  }

  if (compact && !controller.selectedItem) {
    return <InboxListPane theme={theme} />
  }

  if (!controller.selectedItem) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一条 inbox 事件查看详情。
      </div>
    )
  }

  const detail = <InboxDetail {...controller} selectedItem={controller.selectedItem} />

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center border-b border-border/30 px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => controller.selectItem(null)}
            aria-label="返回 inbox 列表"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            列表
          </Button>
        </div>
        <div className="min-h-0 flex-1">{detail}</div>
      </div>
    )
  }

  return detail
}

export default InboxContentPane
